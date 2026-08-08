import { and, asc, desc, eq } from "drizzle-orm";

import { normalizePositiveDecimalText } from "../../domain/price-decimal";
import { canonicalUtcInstantValue } from "../../domain/time";
import type { PriceProviderId, ProviderQuote } from "../../domain/quote-types";
import { PersistenceIntegrityError } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import {
  bookValuationSettings,
  latestPriceQuotes,
  manualPriceQuotes,
  priceProviderMappings,
  priceProviderState,
} from "../schema";

function assertObservationDate(value: string | null): void {
  if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PersistenceIntegrityError(
      "Provider observation date must use YYYY-MM-DD format.",
    );
  }
}

function assertJsonText(value: string | null): void {
  if (value === null) return;
  try {
    JSON.parse(value);
  } catch {
    throw new PersistenceIntegrityError(
      "Provider source metadata must be valid JSON text.",
    );
  }
}

function assertOptionalInstant(value: string | null): void {
  if (value !== null) canonicalUtcInstantValue(value);
}

export function findBookValuationSetting(
  executor: DatabaseExecutor,
  bookId: string,
) {
  return executor
    .select()
    .from(bookValuationSettings)
    .where(eq(bookValuationSettings.bookId, bookId))
    .get();
}

export function listBookValuationSettings(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(bookValuationSettings)
    .orderBy(asc(bookValuationSettings.bookId))
    .all();
}

export function upsertBookValuationSetting(
  executor: DatabaseExecutor,
  value: typeof bookValuationSettings.$inferInsert,
): void {
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .insert(bookValuationSettings)
    .values(value)
    .onConflictDoUpdate({
      target: bookValuationSettings.bookId,
      set: {
        homeAssetId: value.homeAssetId,
        updatedAt: value.updatedAt,
      },
    })
    .run();
}

export function findPriceProviderMapping(
  executor: DatabaseExecutor,
  assetId: string,
  provider: PriceProviderId,
) {
  return executor
    .select()
    .from(priceProviderMappings)
    .where(
      and(
        eq(priceProviderMappings.assetId, assetId),
        eq(priceProviderMappings.provider, provider),
      ),
    )
    .get();
}

export function listPriceProviderMappings(
  executor: DatabaseExecutor,
  provider?: PriceProviderId,
) {
  const query = executor.select().from(priceProviderMappings);
  return (
    provider ? query.where(eq(priceProviderMappings.provider, provider)) : query
  )
    .orderBy(
      asc(priceProviderMappings.provider),
      asc(priceProviderMappings.priority),
      asc(priceProviderMappings.assetId),
    )
    .all();
}

export function upsertPriceProviderMapping(
  executor: DatabaseExecutor,
  value: typeof priceProviderMappings.$inferInsert,
): void {
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .insert(priceProviderMappings)
    .values(value)
    .onConflictDoUpdate({
      target: [priceProviderMappings.assetId, priceProviderMappings.provider],
      set: {
        providerAssetKey: value.providerAssetKey,
        isEnabled: value.isEnabled,
        priority: value.priority,
        updatedAt: value.updatedAt,
      },
    })
    .run();
}

export function listManualPriceQuotes(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(manualPriceQuotes)
    .orderBy(
      desc(manualPriceQuotes.observedAt),
      desc(manualPriceQuotes.createdAt),
      desc(manualPriceQuotes.id),
    )
    .all();
}

export function findManualPriceQuoteById(
  executor: DatabaseExecutor,
  id: string,
) {
  return executor
    .select()
    .from(manualPriceQuotes)
    .where(eq(manualPriceQuotes.id, id))
    .get();
}

export function findActiveManualPriceQuote(
  executor: DatabaseExecutor,
  baseAssetId: string,
  quoteAssetId: string,
) {
  return executor
    .select()
    .from(manualPriceQuotes)
    .where(
      and(
        eq(manualPriceQuotes.baseAssetId, baseAssetId),
        eq(manualPriceQuotes.quoteAssetId, quoteAssetId),
        eq(manualPriceQuotes.isActive, true),
      ),
    )
    .get();
}

export function deactivateManualPriceQuotes(
  executor: DatabaseExecutor,
  baseAssetId: string,
  quoteAssetId: string,
  updatedAt: string,
): void {
  canonicalUtcInstantValue(updatedAt);
  executor
    .update(manualPriceQuotes)
    .set({ isActive: false, updatedAt })
    .where(
      and(
        eq(manualPriceQuotes.baseAssetId, baseAssetId),
        eq(manualPriceQuotes.quoteAssetId, quoteAssetId),
        eq(manualPriceQuotes.isActive, true),
      ),
    )
    .run();
}

export function insertManualPriceQuote(
  executor: DatabaseExecutor,
  value: typeof manualPriceQuotes.$inferInsert,
): void {
  canonicalUtcInstantValue(value.observedAt);
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .insert(manualPriceQuotes)
    .values({
      ...value,
      rateText: normalizePositiveDecimalText(value.rateText),
    })
    .run();
}

export function setManualPriceQuoteActive(
  executor: DatabaseExecutor,
  id: string,
  isActive: boolean,
  updatedAt: string,
): void {
  canonicalUtcInstantValue(updatedAt);
  executor
    .update(manualPriceQuotes)
    .set({ isActive, updatedAt })
    .where(eq(manualPriceQuotes.id, id))
    .run();
}

export function listLatestPriceQuotes(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(latestPriceQuotes)
    .orderBy(
      asc(latestPriceQuotes.provider),
      asc(latestPriceQuotes.baseAssetId),
      asc(latestPriceQuotes.quoteAssetId),
    )
    .all();
}

export function upsertLatestPriceQuotes(
  executor: DatabaseExecutor,
  values: readonly ProviderQuote[],
): void {
  for (const value of values) {
    canonicalUtcInstantValue(value.fetchedAt);
    assertOptionalInstant(value.providerObservedAt);
    assertObservationDate(value.providerObservationDate);
    assertJsonText(value.sourceMetadataJson);
    const row = {
      ...value,
      quoteKind: value.kind,
      rateText: normalizePositiveDecimalText(value.rateText),
    };
    executor
      .insert(latestPriceQuotes)
      .values(row)
      .onConflictDoUpdate({
        target: [
          latestPriceQuotes.baseAssetId,
          latestPriceQuotes.quoteAssetId,
          latestPriceQuotes.provider,
        ],
        set: {
          quoteKind: row.quoteKind,
          rateText: row.rateText,
          providerObservedAt: row.providerObservedAt,
          providerObservationDate: row.providerObservationDate,
          fetchedAt: row.fetchedAt,
          sourceMetadataJson: row.sourceMetadataJson,
        },
      })
      .run();
  }
}

export function deleteLatestPriceQuotes(
  executor: DatabaseExecutor,
  provider?: PriceProviderId,
): void {
  if (provider) {
    executor
      .delete(latestPriceQuotes)
      .where(eq(latestPriceQuotes.provider, provider))
      .run();
    return;
  }
  executor.delete(latestPriceQuotes).run();
}

export function deleteLatestPriceQuoteForMapping(
  executor: DatabaseExecutor,
  assetId: string,
  provider: PriceProviderId,
): void {
  executor
    .delete(latestPriceQuotes)
    .where(
      and(
        eq(latestPriceQuotes.provider, provider),
        provider === "coingecko"
          ? eq(latestPriceQuotes.baseAssetId, assetId)
          : eq(latestPriceQuotes.quoteAssetId, assetId),
      ),
    )
    .run();
}

export function findPriceProviderState(
  executor: DatabaseExecutor,
  provider: PriceProviderId,
) {
  return executor
    .select()
    .from(priceProviderState)
    .where(eq(priceProviderState.provider, provider))
    .get();
}

export function listPriceProviderStates(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(priceProviderState)
    .orderBy(asc(priceProviderState.provider))
    .all();
}

export function upsertPriceProviderState(
  executor: DatabaseExecutor,
  value: typeof priceProviderState.$inferInsert,
): void {
  assertOptionalInstant(value.lastAttemptAt ?? null);
  assertOptionalInstant(value.lastSuccessAt ?? null);
  assertOptionalInstant(value.cooldownUntil ?? null);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .insert(priceProviderState)
    .values(value)
    .onConflictDoUpdate({
      target: priceProviderState.provider,
      set: {
        lastAttemptAt: value.lastAttemptAt,
        lastSuccessAt: value.lastSuccessAt,
        lastErrorCode: value.lastErrorCode,
        lastErrorMessage: value.lastErrorMessage,
        cooldownUntil: value.cooldownUntil,
        updatedAt: value.updatedAt,
      },
    })
    .run();
}
