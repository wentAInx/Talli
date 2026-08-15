import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  lte,
  min,
  max,
  sql,
} from "drizzle-orm";

import type {
  HistoricalFxObservation,
  HistoricalPriceObservation,
} from "../../domain/historical-quote-types";
import { normalizePositiveDecimalText } from "../../domain/price-decimal";
import {
  canonicalLocalDate,
  canonicalUtcInstantValue,
} from "../../domain/time";
import { PersistenceIntegrityError } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import {
  accounts,
  assets,
  historicalFxQuotes,
  historicalManualQuotes,
  historicalPriceQuotes,
  historicalRefreshRuns,
  ledgerEntries,
  ledgerEvents,
} from "../schema";

const WRITE_CHUNK_SIZE = 50;

export function listHistoricalLedgerEntryFacts(
  executor: DatabaseExecutor,
  input: {
    bookId: string;
    fromInclusive?: string;
    afterExclusive?: string;
    toInclusive: string;
  },
) {
  if (input.fromInclusive) canonicalUtcInstantValue(input.fromInclusive);
  if (input.afterExclusive) canonicalUtcInstantValue(input.afterExclusive);
  if (input.fromInclusive && input.afterExclusive) {
    throw new PersistenceIntegrityError(
      "Historical Ledger query cannot combine inclusive and exclusive starts.",
    );
  }
  canonicalUtcInstantValue(input.toInclusive);
  return executor
    .select({
      entryId: ledgerEntries.id,
      eventId: ledgerEvents.id,
      occurredAt: ledgerEvents.occurredAt,
      eventType: ledgerEvents.eventType,
      entryRole: ledgerEntries.entryRole,
      assetId: assets.id,
      amountAtomic: ledgerEntries.amountAtomic,
    })
    .from(ledgerEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, ledgerEvents.id))
    .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
    .innerJoin(assets, eq(accounts.assetId, assets.id))
    .where(
      and(
        eq(ledgerEvents.bookId, input.bookId),
        input.fromInclusive
          ? gte(ledgerEvents.occurredAt, input.fromInclusive)
          : undefined,
        input.afterExclusive
          ? gt(ledgerEvents.occurredAt, input.afterExclusive)
          : undefined,
        lte(ledgerEvents.occurredAt, input.toInclusive),
      ),
    )
    .orderBy(
      asc(ledgerEvents.occurredAt),
      asc(ledgerEvents.id),
      asc(ledgerEntries.id),
    )
    .all();
}

function assertJsonText(value: string | null): void {
  if (value === null) return;
  try {
    JSON.parse(value);
  } catch {
    throw new PersistenceIntegrityError(
      "Historical provider metadata must be valid JSON text.",
    );
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function listHistoricalPriceObservations(
  executor: DatabaseExecutor,
  input: {
    fromInclusive: string;
    toInclusive: string;
    assetIds?: readonly string[];
  },
): HistoricalPriceObservation[] {
  canonicalUtcInstantValue(input.fromInclusive);
  canonicalUtcInstantValue(input.toInclusive);
  if (input.assetIds?.length === 0) return [];
  return executor
    .select()
    .from(historicalPriceQuotes)
    .where(
      and(
        gte(historicalPriceQuotes.providerObservedAt, input.fromInclusive),
        lte(historicalPriceQuotes.providerObservedAt, input.toInclusive),
        input.assetIds
          ? inArray(historicalPriceQuotes.baseAssetId, [...input.assetIds])
          : undefined,
      ),
    )
    .orderBy(
      asc(historicalPriceQuotes.baseAssetId),
      asc(historicalPriceQuotes.quoteAssetId),
      asc(historicalPriceQuotes.providerObservedAt),
      asc(historicalPriceQuotes.id),
    )
    .all()
    .map((row) => ({
      id: row.id,
      baseAssetId: row.baseAssetId,
      quoteAssetId: row.quoteAssetId,
      provider: row.provider,
      granularity: row.granularity,
      rateText: row.rateText,
      providerObservedAt: row.providerObservedAt,
      firstFetchedAt: row.firstFetchedAt,
      fetchedAt: row.lastFetchedAt,
      sourceMetadataJson: row.sourceMetadataJson,
    }));
}

export function listHistoricalFxObservations(
  executor: DatabaseExecutor,
  input: {
    fromDate: string;
    toDate: string;
    assetIds?: readonly string[];
  },
): HistoricalFxObservation[] {
  const fromDate = canonicalLocalDate(input.fromDate);
  const toDate = canonicalLocalDate(input.toDate);
  if (input.assetIds?.length === 0) return [];
  return executor
    .select()
    .from(historicalFxQuotes)
    .where(
      and(
        gte(historicalFxQuotes.providerObservationDate, fromDate),
        lte(historicalFxQuotes.providerObservationDate, toDate),
        input.assetIds
          ? inArray(historicalFxQuotes.quoteAssetId, [...input.assetIds])
          : undefined,
      ),
    )
    .orderBy(
      asc(historicalFxQuotes.quoteAssetId),
      asc(historicalFxQuotes.providerObservationDate),
      asc(historicalFxQuotes.id),
    )
    .all()
    .map((row) => ({
      id: row.id,
      baseAssetId: row.baseAssetId,
      quoteAssetId: row.quoteAssetId,
      provider: row.provider,
      rateText: row.rateText,
      providerObservationDate: row.providerObservationDate,
      firstFetchedAt: row.firstFetchedAt,
      fetchedAt: row.lastFetchedAt,
      sourceMetadataJson: row.sourceMetadataJson,
    }));
}

export function listHistoricalManualQuotes(
  executor: DatabaseExecutor,
  input?: { fromDate?: string; toDate?: string },
) {
  const fromDate = input?.fromDate
    ? canonicalLocalDate(input.fromDate)
    : undefined;
  const toDate = input?.toDate ? canonicalLocalDate(input.toDate) : undefined;
  return executor
    .select()
    .from(historicalManualQuotes)
    .where(
      and(
        fromDate
          ? gte(historicalManualQuotes.valuationDate, fromDate)
          : undefined,
        toDate ? lte(historicalManualQuotes.valuationDate, toDate) : undefined,
      ),
    )
    .orderBy(
      asc(historicalManualQuotes.valuationDate),
      asc(historicalManualQuotes.baseAssetId),
      asc(historicalManualQuotes.quoteAssetId),
      asc(historicalManualQuotes.id),
    )
    .all();
}

export function findHistoricalManualQuoteById(
  executor: DatabaseExecutor,
  id: string,
) {
  return executor
    .select()
    .from(historicalManualQuotes)
    .where(eq(historicalManualQuotes.id, id))
    .get();
}

export function findHistoricalManualQuoteForPairDate(
  executor: DatabaseExecutor,
  baseAssetId: string,
  quoteAssetId: string,
  valuationDate: string,
) {
  return executor
    .select()
    .from(historicalManualQuotes)
    .where(
      and(
        eq(historicalManualQuotes.baseAssetId, baseAssetId),
        eq(historicalManualQuotes.quoteAssetId, quoteAssetId),
        eq(
          historicalManualQuotes.valuationDate,
          canonicalLocalDate(valuationDate),
        ),
      ),
    )
    .get();
}

export function upsertHistoricalManualQuote(
  executor: DatabaseExecutor,
  value: typeof historicalManualQuotes.$inferInsert,
): void {
  const valuationDate = canonicalLocalDate(value.valuationDate);
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .insert(historicalManualQuotes)
    .values({
      ...value,
      valuationDate,
      rateText: normalizePositiveDecimalText(value.rateText),
    })
    .onConflictDoUpdate({
      target: [
        historicalManualQuotes.baseAssetId,
        historicalManualQuotes.quoteAssetId,
        historicalManualQuotes.valuationDate,
      ],
      set: {
        rateText: normalizePositiveDecimalText(value.rateText),
        note: value.note,
        updatedAt: value.updatedAt,
      },
    })
    .run();
}

export function deleteHistoricalManualQuote(
  executor: DatabaseExecutor,
  id: string,
): void {
  executor
    .delete(historicalManualQuotes)
    .where(eq(historicalManualQuotes.id, id))
    .run();
}

export function upsertHistoricalPriceObservations(
  executor: DatabaseExecutor,
  values: readonly HistoricalPriceObservation[],
  id: () => string,
): void {
  const rows = values.map((value) => {
    canonicalUtcInstantValue(value.providerObservedAt);
    canonicalUtcInstantValue(value.fetchedAt);
    if (value.firstFetchedAt) canonicalUtcInstantValue(value.firstFetchedAt);
    assertJsonText(value.sourceMetadataJson);
    return {
      id: value.id ?? id(),
      baseAssetId: value.baseAssetId,
      quoteAssetId: value.quoteAssetId,
      provider: "coingecko" as const,
      quoteKind: "market" as const,
      granularity: value.granularity,
      rateText: normalizePositiveDecimalText(value.rateText),
      providerObservedAt: value.providerObservedAt,
      firstFetchedAt: value.firstFetchedAt ?? value.fetchedAt,
      lastFetchedAt: value.fetchedAt,
      sourceMetadataJson: value.sourceMetadataJson,
    };
  });
  for (const batch of chunks(rows, WRITE_CHUNK_SIZE)) {
    executor
      .insert(historicalPriceQuotes)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          historicalPriceQuotes.provider,
          historicalPriceQuotes.baseAssetId,
          historicalPriceQuotes.quoteAssetId,
          historicalPriceQuotes.providerObservedAt,
        ],
        set: {
          granularity: sql.raw(
            "case when excluded.last_fetched_at >= last_fetched_at then excluded.granularity else granularity end",
          ),
          rateText: sql.raw(
            "case when excluded.last_fetched_at >= last_fetched_at then excluded.rate_text else rate_text end",
          ),
          lastFetchedAt: sql.raw(
            "max(last_fetched_at, excluded.last_fetched_at)",
          ),
          sourceMetadataJson: sql.raw(
            "case when excluded.last_fetched_at >= last_fetched_at then excluded.source_metadata_json else source_metadata_json end",
          ),
        },
      })
      .run();
  }
}

export function upsertHistoricalFxObservations(
  executor: DatabaseExecutor,
  values: readonly HistoricalFxObservation[],
  id: () => string,
): void {
  const rows = values.map((value) => {
    const providerObservationDate = canonicalLocalDate(
      value.providerObservationDate,
    );
    canonicalUtcInstantValue(value.fetchedAt);
    if (value.firstFetchedAt) canonicalUtcInstantValue(value.firstFetchedAt);
    assertJsonText(value.sourceMetadataJson);
    return {
      id: value.id ?? id(),
      baseAssetId: value.baseAssetId,
      quoteAssetId: value.quoteAssetId,
      provider: "ecb" as const,
      quoteKind: "reference" as const,
      rateText: normalizePositiveDecimalText(value.rateText),
      providerObservationDate,
      firstFetchedAt: value.firstFetchedAt ?? value.fetchedAt,
      lastFetchedAt: value.fetchedAt,
      sourceMetadataJson: value.sourceMetadataJson,
    };
  });
  for (const batch of chunks(rows, WRITE_CHUNK_SIZE)) {
    executor
      .insert(historicalFxQuotes)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          historicalFxQuotes.provider,
          historicalFxQuotes.baseAssetId,
          historicalFxQuotes.quoteAssetId,
          historicalFxQuotes.providerObservationDate,
        ],
        set: {
          rateText: sql.raw(
            "case when excluded.last_fetched_at >= last_fetched_at then excluded.rate_text else rate_text end",
          ),
          lastFetchedAt: sql.raw(
            "max(last_fetched_at, excluded.last_fetched_at)",
          ),
          sourceMetadataJson: sql.raw(
            "case when excluded.last_fetched_at >= last_fetched_at then excluded.source_metadata_json else source_metadata_json end",
          ),
        },
      })
      .run();
  }
}

export function deleteHistoricalProviderCacheForMapping(
  executor: DatabaseExecutor,
  assetId: string,
  provider: "coingecko" | "ecb",
): void {
  if (provider === "coingecko") {
    executor
      .delete(historicalPriceQuotes)
      .where(eq(historicalPriceQuotes.baseAssetId, assetId))
      .run();
  } else {
    executor
      .delete(historicalFxQuotes)
      .where(eq(historicalFxQuotes.quoteAssetId, assetId))
      .run();
  }
}

export function purgeHistoricalProviderCache(executor: DatabaseExecutor): void {
  executor.delete(historicalRefreshRuns).run();
  executor.delete(historicalPriceQuotes).run();
  executor.delete(historicalFxQuotes).run();
}

export function historicalCoverage(executor: DatabaseExecutor) {
  const crypto = executor
    .select({
      assetId: historicalPriceQuotes.baseAssetId,
      from: min(historicalPriceQuotes.providerObservedAt),
      to: max(historicalPriceQuotes.providerObservedAt),
    })
    .from(historicalPriceQuotes)
    .groupBy(historicalPriceQuotes.baseAssetId)
    .orderBy(asc(historicalPriceQuotes.baseAssetId))
    .all();
  const fx = executor
    .select({
      assetId: historicalFxQuotes.quoteAssetId,
      from: min(historicalFxQuotes.providerObservationDate),
      to: max(historicalFxQuotes.providerObservationDate),
    })
    .from(historicalFxQuotes)
    .groupBy(historicalFxQuotes.quoteAssetId)
    .orderBy(asc(historicalFxQuotes.quoteAssetId))
    .all();
  return { crypto, fx };
}
