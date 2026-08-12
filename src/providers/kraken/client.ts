import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "../../services/runtime";
import { createKrakenSignature } from "./auth";
import { KrakenProviderError } from "./errors";
import {
  associateKrakenPairAliases,
  krakenResultCount,
  parseKrakenAssetPairs,
  parseKrakenAssets,
  parseKrakenBalances,
  parseKrakenLedgers,
  parseKrakenPermissionPayload,
  parseKrakenTrades,
} from "./normalize";
import type {
  KrakenHttpTransport,
  KrakenNonceSource,
  KrakenPermissionCheck,
  KrakenReadOnlyProvider,
  KrakenSourceObject,
  KrakenSyncSnapshot,
} from "./types";

const KRAKEN_ORIGIN = "https://api.kraken.com";
const DEFAULT_LOOKBACK_DAYS = 90;
const LEDGER_PAGE_SIZE = 50;
const TRADE_PAGE_SIZE = 100;

type KrakenPrivateMethod =
  "GetApiKeyInfo" | "Balance" | "Ledgers" | "TradesHistory";

interface KrakenClientOptions {
  connectionId: string;
  apiKey: string;
  apiSecret: string;
  timeoutMs?: number;
}

interface KrakenEnvelope {
  error: string[];
  result: unknown;
}

function parseEnvelope(text: string): KrakenEnvelope {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken returned malformed JSON.",
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken response envelope is invalid.",
    );
  }
  const value = payload as Record<string, unknown>;
  if (
    !Array.isArray(value.error) ||
    !value.error.every((item) => typeof item === "string") ||
    !("result" in value)
  ) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken response envelope is invalid.",
    );
  }
  return { error: value.error as string[], result: value.result };
}

function throwKrakenApiError(errors: readonly string[]): never {
  const joined = errors.join(" ").toLowerCase();
  if (joined.includes("nonce")) {
    throw new KrakenProviderError(
      "NONCE_ERROR",
      "Kraken rejected the monotonic nonce state.",
    );
  }
  if (joined.includes("permission")) {
    throw new KrakenProviderError(
      "PERMISSION_ERROR",
      "Kraken denied a required read-only permission.",
    );
  }
  if (joined.includes("rate limit") || joined.includes("throttled")) {
    throw new KrakenProviderError(
      "RATE_LIMITED",
      "Kraken rate limit was reached.",
    );
  }
  if (
    joined.includes("invalid key") ||
    joined.includes("invalid signature") ||
    joined.includes("otp")
  ) {
    throw new KrakenProviderError(
      "AUTH_ERROR",
      joined.includes("otp")
        ? "Kraken API-key 2FA is unsupported; use a dedicated read-only key without OTP."
        : "Kraken rejected the configured credentials.",
    );
  }
  throw new KrakenProviderError(
    "UPSTREAM_ERROR",
    "Kraken returned an unavailable upstream response.",
  );
}

function assertHttpStatus(status: number): void {
  if (status >= 200 && status < 300) return;
  if (status === 401 || status === 403) {
    throw new KrakenProviderError(
      "AUTH_ERROR",
      "Kraken rejected the configured credentials.",
    );
  }
  if (status === 429) {
    throw new KrakenProviderError(
      "RATE_LIMITED",
      "Kraken rate limit was reached.",
    );
  }
  throw new KrakenProviderError(
    "UPSTREAM_ERROR",
    "Kraken returned an unavailable upstream response.",
  );
}

function startEpochSeconds(
  fetchedAt: string,
  explicit?: string | null,
): string {
  const source = explicit
    ? Date.parse(explicit)
    : Date.parse(fetchedAt) - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(source)) {
    throw new KrakenProviderError(
      "CONFIG_ERROR",
      "Kraken sync cursor is invalid.",
    );
  }
  return String(Math.floor(source / 1000));
}

export class KrakenReadOnlyClient implements KrakenReadOnlyProvider {
  private readonly timeoutMs: number;
  private privateQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: KrakenHttpTransport,
    private readonly nonceSource: KrakenNonceSource,
    private readonly options: KrakenClientOptions,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!options.apiKey.trim() || !options.apiSecret.trim()) {
      throw new KrakenProviderError(
        "CONFIG_ERROR",
        "Kraken server credentials are not configured.",
      );
    }
  }

  private serializePrivate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.privateQueue.then(operation, operation);
    this.privateQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private privatePost(
    method: KrakenPrivateMethod,
    parameters: Record<string, string> = {},
  ): Promise<unknown> {
    return this.serializePrivate(async () => {
      const nonce = this.nonceSource.next(this.options.connectionId);
      const body = new URLSearchParams({
        nonce,
        ...Object.fromEntries(
          Object.entries(parameters).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      }).toString();
      const path = `/0/private/${method}` as const;
      const signature = createKrakenSignature({
        path,
        nonce,
        body,
        apiSecret: this.options.apiSecret,
      });
      const response = await this.transport.request({
        method: "POST",
        url: new URL(path, KRAKEN_ORIGIN),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "API-Key": this.options.apiKey,
          "API-Sign": signature,
        },
        body,
        timeoutMs: this.timeoutMs,
      });
      assertHttpStatus(response.status);
      const envelope = parseEnvelope(response.text);
      if (envelope.error.length > 0) throwKrakenApiError(envelope.error);
      return envelope.result;
    });
  }

  private async publicGet(
    path: "/0/public/Assets" | "/0/public/AssetPairs",
    assetVersion?: "1",
  ): Promise<unknown> {
    const url = new URL(path, KRAKEN_ORIGIN);
    if (assetVersion) url.searchParams.set("assetVersion", assetVersion);
    const response = await this.transport.request({
      method: "GET",
      url,
      timeoutMs: this.timeoutMs,
    });
    assertHttpStatus(response.status);
    const envelope = parseEnvelope(response.text);
    if (envelope.error.length > 0) throwKrakenApiError(envelope.error);
    return envelope.result;
  }

  async validateCredentials(): Promise<KrakenPermissionCheck> {
    return parseKrakenPermissionPayload(
      await this.privatePost("GetApiKeyInfo"),
    );
  }

  private async fetchLedgers(start: string): Promise<KrakenSourceObject[]> {
    const objects: KrakenSourceObject[] = [];
    for (let offset = 0; ; offset += LEDGER_PAGE_SIZE) {
      const result = await this.privatePost("Ledgers", {
        ofs: String(offset),
        start,
      });
      const page = parseKrakenLedgers(result);
      objects.push(...page);
      const count = krakenResultCount(result);
      if (
        page.length < LEDGER_PAGE_SIZE ||
        (count !== null && objects.length >= count)
      ) {
        return objects;
      }
    }
  }

  private async fetchTrades(start: string): Promise<KrakenSourceObject[]> {
    const objects: KrakenSourceObject[] = [];
    for (let offset = 0; ; offset += TRADE_PAGE_SIZE) {
      const result = await this.privatePost("TradesHistory", {
        consolidate_taker: "false",
        ledgers: "true",
        limit: String(TRADE_PAGE_SIZE),
        ofs: String(offset),
        start,
      });
      const page = parseKrakenTrades(result);
      objects.push(...page);
      const count = krakenResultCount(result);
      if (
        page.length < TRADE_PAGE_SIZE ||
        (count !== null && objects.length >= count)
      ) {
        return objects;
      }
    }
  }

  async fetchSnapshot(
    input: {
      sinceLedger?: string | null;
      sinceTrade?: string | null;
      validatedPermissions?: KrakenPermissionCheck;
    } = {},
  ): Promise<KrakenSyncSnapshot> {
    const fetchedAt = runtimeNow(this.runtime);
    const permissions =
      input.validatedPermissions ?? (await this.validateCredentials());
    if (permissions.forbiddenWritePermissions.length > 0) {
      throw new KrakenProviderError(
        "PERMISSION_ERROR",
        "Kraken key has dangerous write permissions; sync was refused.",
      );
    }
    if (permissions.missingRequired.length > 0) {
      throw new KrakenProviderError(
        "PERMISSION_ERROR",
        "Kraken key is missing required read-only permissions.",
      );
    }

    const [assetsResult, displayPairsResult, internalPairsResult] =
      await Promise.all([
        this.publicGet("/0/public/Assets", "1"),
        this.publicGet("/0/public/AssetPairs", "1"),
        this.publicGet("/0/public/AssetPairs"),
      ]);
    const balances = parseKrakenBalances(await this.privatePost("Balance"));
    const ledgers = await this.fetchLedgers(
      startEpochSeconds(fetchedAt, input.sinceLedger),
    );
    const trades = await this.fetchTrades(
      startEpochSeconds(fetchedAt, input.sinceTrade),
    );

    return {
      fetchedAt,
      permissions,
      referenceData: {
        assets: parseKrakenAssets(assetsResult),
        assetPairs: associateKrakenPairAliases(
          parseKrakenAssetPairs(displayPairsResult),
          parseKrakenAssetPairs(internalPairsResult),
        ),
      },
      balances,
      ledgers,
      trades,
    };
  }
}
