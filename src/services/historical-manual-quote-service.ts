import type { DatabaseContext } from "../db/connection";
import {
  deleteHistoricalManualQuote,
  findAssetById,
  findHistoricalManualQuoteById,
  findHistoricalManualQuoteForPairDate,
  listHistoricalManualQuotes,
  purgeHistoricalProviderCache,
  upsertHistoricalManualQuote,
} from "../db/queries";
import { normalizePositiveDecimalText } from "../domain/price-decimal";
import { canonicalLocalDate } from "../domain/time";
import { assertService } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

export class HistoricalManualQuoteService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  list() {
    return listHistoricalManualQuotes(this.context.db);
  }

  async save(input: {
    id?: string | null;
    baseAssetId: string;
    quoteAssetId: string;
    valuationDate: string;
    rateText: string;
    note?: string | null;
  }): Promise<string> {
    assertService(
      input.baseAssetId !== input.quoteAssetId,
      "HISTORICAL_MANUAL_QUOTE_IDENTITY",
      "Historical manual quote assets must be different.",
    );
    const valuationDate = canonicalLocalDate(input.valuationDate);
    const rateText = normalizePositiveDecimalText(input.rateText);
    const note = input.note?.trim() || null;
    assertService(
      !note || note.length <= 1000,
      "HISTORICAL_MANUAL_QUOTE_NOTE_TOO_LONG",
      "Historical manual quote note is limited to 1000 characters.",
    );
    const now = runtimeNow(this.runtime);
    return this.context.db.transaction(
      (transaction) => {
        assertService(
          Boolean(findAssetById(transaction, input.baseAssetId)),
          "BASE_ASSET_NOT_FOUND",
          "Historical quote base asset was not found.",
        );
        assertService(
          Boolean(findAssetById(transaction, input.quoteAssetId)),
          "QUOTE_ASSET_NOT_FOUND",
          "Historical quote target asset was not found.",
        );
        const requested = input.id
          ? findHistoricalManualQuoteById(transaction, input.id)
          : null;
        assertService(
          !input.id || Boolean(requested),
          "HISTORICAL_MANUAL_QUOTE_NOT_FOUND",
          "Historical manual quote was not found.",
        );
        const existing = findHistoricalManualQuoteForPairDate(
          transaction,
          input.baseAssetId,
          input.quoteAssetId,
          valuationDate,
        );
        assertService(
          !requested || !existing || existing.id === requested.id,
          "HISTORICAL_MANUAL_QUOTE_CONFLICT",
          "Another historical manual quote already uses this pair and date.",
        );
        const id = requested?.id ?? existing?.id ?? this.runtime.id();
        if (
          requested &&
          (requested.baseAssetId !== input.baseAssetId ||
            requested.quoteAssetId !== input.quoteAssetId ||
            requested.valuationDate !== valuationDate)
        ) {
          deleteHistoricalManualQuote(transaction, requested.id);
        }
        upsertHistoricalManualQuote(transaction, {
          id,
          baseAssetId: input.baseAssetId,
          quoteAssetId: input.quoteAssetId,
          valuationDate,
          rateText,
          note,
          createdAt: requested?.createdAt ?? existing?.createdAt ?? now,
          updatedAt: now,
        });
        return id;
      },
      { behavior: "immediate" },
    );
  }

  async delete(id: string): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        assertService(
          Boolean(findHistoricalManualQuoteById(transaction, id)),
          "HISTORICAL_MANUAL_QUOTE_NOT_FOUND",
          "Historical manual quote was not found.",
        );
        deleteHistoricalManualQuote(transaction, id);
      },
      { behavior: "immediate" },
    );
  }
}

export class HistoricalProviderCacheService {
  constructor(private readonly context: DatabaseContext) {}

  async purge(): Promise<void> {
    this.context.db.transaction(
      (transaction) => purgeHistoricalProviderCache(transaction),
      { behavior: "immediate" },
    );
  }
}
