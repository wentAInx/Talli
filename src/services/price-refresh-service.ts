import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  findPriceProviderState,
  listAssets,
  listLatestPriceQuotes,
  listPriceProviderMappings,
  upsertLatestPriceQuotes,
  upsertPriceProviderState,
} from "../db/queries";
import { PRICE_POLICY } from "../domain/quote-math";
import type {
  PriceProviderId,
  ProviderMapping,
  ProviderQuote,
} from "../domain/quote-types";
import { canonicalUtcInstantValue } from "../domain/time";
import { PriceProviderError } from "../providers/errors";
import type { PriceProviderAdapters } from "../providers/types";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

const PROVIDERS: readonly PriceProviderId[] = ["coingecko", "ecb"];

export interface PriceRefreshResult {
  refreshed: PriceProviderId[];
  skipped: PriceProviderId[];
  failed: Array<{
    provider: PriceProviderId;
    code: string;
    message: string;
  }>;
}

interface ProviderClaim {
  claimed: boolean;
  fetchedAt: string;
  mappings: ProviderMapping[];
}

function plusMilliseconds(instant: string, milliseconds: number): string {
  return new Date(
    canonicalUtcInstantValue(instant) + milliseconds,
  ).toISOString();
}

function laterInstant(left: string, right: string): string {
  return canonicalUtcInstantValue(left) >= canonicalUtcInstantValue(right)
    ? left
    : right;
}

function enabledMappings(
  executor: DatabaseExecutor,
  provider: PriceProviderId,
): ProviderMapping[] {
  const activeAssetIds = new Set(
    listAssets(executor)
      .filter((asset) => !asset.isArchived)
      .map((asset) => asset.id),
  );
  return listPriceProviderMappings(executor, provider)
    .filter(
      (mapping) => mapping.isEnabled && activeAssetIds.has(mapping.assetId),
    )
    .map((mapping) => ({
      assetId: mapping.assetId,
      provider: mapping.provider,
      providerAssetKey: mapping.providerAssetKey,
      isEnabled: mapping.isEnabled,
      priority: mapping.priority,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    }));
}

function fiatBridgeAsset(
  executor: DatabaseExecutor,
  providerAssetKey: "EUR" | "USD",
) {
  const assets = listAssets(executor);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const mapped = listPriceProviderMappings(executor, "ecb")
    .filter(
      (mapping) =>
        mapping.providerAssetKey.trim().toUpperCase() === providerAssetKey,
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.assetId.localeCompare(right.assetId),
    )
    .map((mapping) => assetById.get(mapping.assetId))
    .find((asset) => asset?.assetType === "fiat" && !asset.isArchived);
  return (
    mapped ??
    assets.find(
      (asset) =>
        asset.assetType === "fiat" &&
        !asset.isArchived &&
        asset.code.toUpperCase() === providerAssetKey,
    )
  );
}

function mappingFingerprint(mappings: readonly ProviderMapping[]): string {
  return JSON.stringify(
    [...mappings]
      .map((mapping) => ({
        assetId: mapping.assetId,
        provider: mapping.provider,
        providerAssetKey: mapping.providerAssetKey,
        isEnabled: mapping.isEnabled,
        priority: mapping.priority,
      }))
      .sort(
        (left, right) =>
          left.assetId.localeCompare(right.assetId) ||
          left.providerAssetKey.localeCompare(right.providerAssetKey),
      ),
  );
}

function allExpectedQuotesPresent(
  executor: DatabaseExecutor,
  provider: PriceProviderId,
  mappings: readonly ProviderMapping[],
  now: string,
): boolean {
  const rows = listLatestPriceQuotes(executor).filter(
    (quote) => quote.provider === provider,
  );
  const isFresh = (quote: (typeof rows)[number] | undefined) =>
    Boolean(
      quote &&
      quote.quoteKind === (provider === "coingecko" ? "spot" : "reference") &&
      canonicalUtcInstantValue(now) -
        canonicalUtcInstantValue(quote.fetchedAt) <
        PRICE_POLICY[provider].freshMs,
    );
  if (provider === "coingecko") {
    const usd = fiatBridgeAsset(executor, "USD");
    if (!usd) return false;
    return mappings.every((mapping) =>
      isFresh(
        rows.find(
          (quote) =>
            quote.baseAssetId === mapping.assetId &&
            quote.quoteAssetId === usd.id,
        ),
      ),
    );
  }
  const eur = fiatBridgeAsset(executor, "EUR");
  if (!eur) return false;
  return mappings
    .filter((mapping) => mapping.assetId !== eur.id)
    .every((mapping) =>
      isFresh(
        rows.find(
          (quote) =>
            quote.baseAssetId === eur.id &&
            quote.quoteAssetId === mapping.assetId,
        ),
      ),
    );
}

function refreshDue(
  executor: DatabaseExecutor,
  provider: PriceProviderId,
  now: string,
  mappings: readonly ProviderMapping[],
): boolean {
  if (!allExpectedQuotesPresent(executor, provider, mappings, now)) return true;
  const state = findPriceProviderState(executor, provider);
  if (!state?.lastSuccessAt) return true;
  const age =
    canonicalUtcInstantValue(now) -
    canonicalUtcInstantValue(state.lastSuccessAt);
  return age >= PRICE_POLICY[provider].freshMs;
}

function cooldownActive(
  executor: DatabaseExecutor,
  provider: PriceProviderId,
  now: string,
): boolean {
  const cooldownUntil = findPriceProviderState(
    executor,
    provider,
  )?.cooldownUntil;
  return Boolean(
    cooldownUntil &&
    canonicalUtcInstantValue(cooldownUntil) > canonicalUtcInstantValue(now),
  );
}

function claimProvider(
  context: DatabaseContext,
  provider: PriceProviderId,
  force: boolean,
  fetchedAt: string,
): ProviderClaim {
  return context.db.transaction(
    (transaction) => {
      const mappings = enabledMappings(transaction, provider);
      if (mappings.length === 0) {
        return { claimed: false, fetchedAt, mappings };
      }
      if (
        cooldownActive(transaction, provider, fetchedAt) ||
        (!force && !refreshDue(transaction, provider, fetchedAt, mappings))
      ) {
        return { claimed: false, fetchedAt, mappings };
      }
      const previous = findPriceProviderState(transaction, provider);
      upsertPriceProviderState(transaction, {
        provider,
        lastAttemptAt: fetchedAt,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        lastErrorCode: previous?.lastErrorCode ?? null,
        lastErrorMessage: previous?.lastErrorMessage ?? null,
        cooldownUntil: plusMilliseconds(
          fetchedAt,
          PRICE_POLICY.manualRefreshCooldownMs,
        ),
        updatedAt: fetchedAt,
      });
      return { claimed: true, fetchedAt, mappings };
    },
    { behavior: "immediate" },
  );
}

function safeFailure(error: unknown): {
  code: string;
  message: string;
  retryAfterSeconds: number | null;
} {
  if (error instanceof PriceProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "Price provider refresh failed.",
    retryAfterSeconds: null,
  };
}

export class PriceRefreshService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly adapters: PriceProviderAdapters,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async refreshCurrent(input?: {
    force?: boolean;
    providers?: PriceProviderId[];
  }): Promise<PriceRefreshResult> {
    const requested = input?.providers ?? [...PROVIDERS];
    const providers = PROVIDERS.filter((provider) =>
      requested.includes(provider),
    );
    const result: PriceRefreshResult = {
      refreshed: [],
      skipped: [],
      failed: [],
    };

    for (const provider of providers) {
      try {
        const fetchedAt = runtimeNow(this.runtime);
        const claim = claimProvider(
          this.context,
          provider,
          Boolean(input?.force),
          fetchedAt,
        );
        if (!claim.claimed) {
          result.skipped.push(provider);
          continue;
        }

        let quotes: ProviderQuote[];
        if (provider === "coingecko") {
          const usd = fiatBridgeAsset(this.context.db, "USD");
          if (!usd) {
            throw new PriceProviderError(
              "CONFIG_ERROR",
              "USD bridge asset is unavailable.",
            );
          }
          quotes = await this.adapters.coingecko.fetchCryptoUsdQuotes({
            mappings: claim.mappings,
            usdAssetId: usd.id,
            fetchedAt: claim.fetchedAt,
          });
        } else {
          const eur = fiatBridgeAsset(this.context.db, "EUR");
          if (!eur) {
            throw new PriceProviderError(
              "CONFIG_ERROR",
              "EUR bridge asset is unavailable.",
            );
          }
          quotes = await this.adapters.ecb.fetchEurReferenceQuotes({
            mappings: claim.mappings,
            eurAssetId: eur.id,
            fetchedAt: claim.fetchedAt,
          });
        }

        this.context.db.transaction(
          (transaction) => {
            if (
              mappingFingerprint(enabledMappings(transaction, provider)) !==
              mappingFingerprint(claim.mappings)
            ) {
              throw new PriceProviderError(
                "CONFIG_ERROR",
                "Provider mapping changed during refresh; the response was discarded.",
              );
            }
            upsertLatestPriceQuotes(transaction, quotes);
            upsertPriceProviderState(transaction, {
              provider,
              lastAttemptAt: claim.fetchedAt,
              lastSuccessAt: claim.fetchedAt,
              lastErrorCode: null,
              lastErrorMessage: null,
              cooldownUntil: plusMilliseconds(
                claim.fetchedAt,
                PRICE_POLICY.manualRefreshCooldownMs,
              ),
              updatedAt: claim.fetchedAt,
            });
          },
          { behavior: "immediate" },
        );
        result.refreshed.push(provider);
      } catch (error) {
        const failedAt = runtimeNow(this.runtime);
        const failure = safeFailure(error);
        const minimumCooldown = plusMilliseconds(
          failedAt,
          PRICE_POLICY.manualRefreshCooldownMs,
        );
        const upstreamCooldown = plusMilliseconds(
          failedAt,
          (failure.retryAfterSeconds ?? 0) * 1000,
        );
        this.context.db.transaction(
          (transaction) => {
            const previous = findPriceProviderState(transaction, provider);
            upsertPriceProviderState(transaction, {
              provider,
              lastAttemptAt: previous?.lastAttemptAt ?? failedAt,
              lastSuccessAt: previous?.lastSuccessAt ?? null,
              lastErrorCode: failure.code,
              lastErrorMessage: failure.message,
              cooldownUntil: laterInstant(minimumCooldown, upstreamCooldown),
              updatedAt: failedAt,
            });
          },
          { behavior: "immediate" },
        );
        result.failed.push({
          provider,
          code: failure.code,
          message: failure.message,
        });
      }
    }

    return result;
  }
}
