import type { DatabaseContext } from "../db/connection";
import {
  deactivateManualPriceQuotes,
  deleteLatestPriceQuoteForMapping,
  findActiveManualPriceQuote,
  findAssetById,
  findBookById,
  findBookValuationSetting,
  findManualPriceQuoteById,
  findPriceProviderMapping,
  insertManualPriceQuote,
  listAssets,
  listBookValuationSettings,
  listManualPriceQuotes,
  listLatestPriceQuotes,
  listPriceProviderMappings,
  listPriceProviderStates,
  setManualPriceQuoteActive,
  upsertBookValuationSetting,
  upsertPriceProviderMapping,
} from "../db/queries";
import { normalizePositiveDecimalText } from "../domain/price-decimal";
import type { PriceProviderId } from "../domain/quote-types";
import { canonicalUtcInstantValue } from "../domain/time";
import { assertService, ServiceError } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

const PROVIDERS = new Set<PriceProviderId>(["coingecko", "ecb"]);

function providerId(value: string): PriceProviderId {
  assertService(
    PROVIDERS.has(value as PriceProviderId),
    "PRICE_PROVIDER_INVALID",
    "Price provider must be CoinGecko or ECB.",
  );
  return value as PriceProviderId;
}

function providerKey(value: string, provider: PriceProviderId): string {
  const normalized =
    provider === "ecb" ? value.trim().toUpperCase() : value.trim();
  assertService(
    normalized.length > 0 && normalized.length <= 128,
    "PROVIDER_KEY_INVALID",
    "Provider asset key must contain 1 to 128 characters.",
  );
  if (provider === "ecb") {
    assertService(
      /^[A-Z]{3}$/.test(normalized),
      "PROVIDER_KEY_INVALID",
      "ECB provider keys must be three-letter currency codes.",
    );
  }
  return normalized;
}

export class ValuationSettingsService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  getHomeAsset(bookId: string) {
    const setting = findBookValuationSetting(this.context.db, bookId);
    if (!setting) return null;
    const asset = findAssetById(this.context.db, setting.homeAssetId);
    return asset ? { setting, asset } : null;
  }

  async setHomeAsset(bookId: string, homeAssetId: string): Promise<void> {
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        assertService(
          Boolean(findBookById(transaction, bookId)),
          "BOOK_NOT_FOUND",
          "Book was not found.",
        );
        const asset = findAssetById(transaction, homeAssetId);
        assertService(
          Boolean(asset),
          "HOME_ASSET_NOT_FOUND",
          "Home Asset was not found.",
        );
        assertService(
          asset!.assetType === "fiat" && !asset!.isArchived,
          "HOME_ASSET_INVALID",
          "Home Asset must be a non-archived fiat asset.",
        );
        upsertBookValuationSetting(transaction, {
          bookId,
          homeAssetId,
          createdAt: now,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
  }
}

export class ProviderMappingService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  list() {
    return listPriceProviderMappings(this.context.db);
  }

  async update(input: {
    assetId: string;
    provider: string;
    providerAssetKey: string;
    isEnabled: boolean;
    priority: number;
  }): Promise<void> {
    const provider = providerId(input.provider);
    const key = providerKey(input.providerAssetKey, provider);
    assertService(
      Number.isSafeInteger(input.priority),
      "PROVIDER_PRIORITY_INVALID",
      "Provider priority must be an integer.",
    );
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        const asset = findAssetById(transaction, input.assetId);
        const previous = findPriceProviderMapping(
          transaction,
          input.assetId,
          provider,
        );
        assertService(
          Boolean(asset),
          "ASSET_NOT_FOUND",
          "Asset was not found.",
        );
        assertService(
          provider === "coingecko"
            ? asset!.assetType === "crypto"
            : asset!.assetType === "fiat",
          "PROVIDER_ASSET_TYPE_INVALID",
          provider === "coingecko"
            ? "CoinGecko mappings require a crypto asset."
            : "ECB mappings require a fiat asset.",
        );
        upsertPriceProviderMapping(transaction, {
          assetId: input.assetId,
          provider,
          providerAssetKey: key,
          isEnabled: input.isEnabled,
          priority: input.priority,
          createdAt: now,
          updatedAt: now,
        });
        if (previous && previous.providerAssetKey !== key) {
          deleteLatestPriceQuoteForMapping(
            transaction,
            input.assetId,
            provider,
          );
        }
      },
      { behavior: "immediate" },
    );
  }
}

export class ManualPriceService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  list() {
    return listManualPriceQuotes(this.context.db);
  }

  activeForPair(baseAssetId: string, quoteAssetId: string) {
    return findActiveManualPriceQuote(
      this.context.db,
      baseAssetId,
      quoteAssetId,
    );
  }

  async create(input: {
    baseAssetId: string;
    quoteAssetId: string;
    rateText: string;
    observedAt: string;
    note?: string | null;
  }): Promise<string> {
    assertService(
      input.baseAssetId !== input.quoteAssetId,
      "MANUAL_QUOTE_IDENTITY",
      "Manual quote assets must be different.",
    );
    const rateText = normalizePositiveDecimalText(input.rateText);
    canonicalUtcInstantValue(input.observedAt);
    const note = input.note?.trim() || null;
    assertService(
      !note || note.length <= 1000,
      "MANUAL_QUOTE_NOTE_TOO_LONG",
      "Manual quote note is limited to 1000 characters.",
    );
    const id = this.runtime.id();
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        assertService(
          Boolean(findAssetById(transaction, input.baseAssetId)),
          "BASE_ASSET_NOT_FOUND",
          "Manual quote base asset was not found.",
        );
        assertService(
          Boolean(findAssetById(transaction, input.quoteAssetId)),
          "QUOTE_ASSET_NOT_FOUND",
          "Manual quote quote asset was not found.",
        );
        deactivateManualPriceQuotes(
          transaction,
          input.baseAssetId,
          input.quoteAssetId,
          now,
        );
        insertManualPriceQuote(transaction, {
          id,
          baseAssetId: input.baseAssetId,
          quoteAssetId: input.quoteAssetId,
          rateText,
          observedAt: input.observedAt,
          note,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
    return id;
  }

  async deactivate(id: string): Promise<void> {
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        const quote = findManualPriceQuoteById(transaction, id);
        if (!quote) {
          throw new ServiceError(
            "MANUAL_QUOTE_NOT_FOUND",
            "Manual quote was not found.",
          );
        }
        setManualPriceQuoteActive(transaction, id, false, now);
      },
      { behavior: "immediate" },
    );
  }
}

export function readValuationConfiguration(context: DatabaseContext) {
  return {
    assets: listAssets(context.db),
    settings: listBookValuationSettings(context.db),
    mappings: listPriceProviderMappings(context.db),
    manualQuotes: listManualPriceQuotes(context.db),
    latestQuotes: listLatestPriceQuotes(context.db),
    providerStates: listPriceProviderStates(context.db),
  };
}
