import { and, asc, desc, eq } from "drizzle-orm";

import { validatedExternalDecimalText } from "../../domain/external-sync";
import { canonicalUtcInstantValue } from "../../domain/time";
import { assertAtomicDbText, PersistenceIntegrityError } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import {
  externalAccountMappings,
  externalAssetMappings,
  externalBalanceObservations,
  externalCandidateSourceObjects,
  externalConnections,
  externalConnectionState,
  externalImportLinks,
  externalSourceObjects,
  externalSyncRuns,
  externalTransactionCandidates,
  externalTransactionLegs,
} from "../schema";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

function assertJsonText(value: string | null | undefined): void {
  if (value === null || value === undefined) return;
  try {
    JSON.parse(value);
  } catch {
    throw new PersistenceIntegrityError(
      "External provider metadata must be valid JSON text.",
    );
  }
}

function assertOptionalInstant(value: string | null | undefined): void {
  if (value !== null && value !== undefined) canonicalUtcInstantValue(value);
}

function assertSha256(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new PersistenceIntegrityError(
      "External payload fingerprint must be a lowercase SHA-256 hex string.",
    );
  }
}

function assertUnsignedIntegerText(value: string): void {
  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new PersistenceIntegrityError(
      "External nonce must be unsigned base-10 integer text.",
    );
  }
  BigInt(value);
}

export function insertExternalConnection(
  executor: DatabaseExecutor,
  value: typeof externalConnections.$inferInsert,
): void {
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor.insert(externalConnections).values(value).run();
}

export function findExternalConnection(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(externalConnections)
    .where(eq(externalConnections.id, connectionId))
    .get();
}

export function listExternalConnections(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(externalConnections)
    .orderBy(asc(externalConnections.provider), asc(externalConnections.name))
    .all();
}

export function updateExternalConnection(
  executor: DatabaseExecutor,
  connectionId: string,
  value: {
    name?: string;
    isEnabled?: boolean;
    updatedAt: string;
  },
): void {
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .update(externalConnections)
    .set(value)
    .where(eq(externalConnections.id, connectionId))
    .run();
}

export function ensureExternalConnectionState(
  executor: DatabaseExecutor,
  connectionId: string,
  updatedAt: string,
): void {
  canonicalUtcInstantValue(updatedAt);
  executor
    .insert(externalConnectionState)
    .values({ connectionId, lastNonceText: "0", updatedAt })
    .onConflictDoNothing({ target: externalConnectionState.connectionId })
    .run();
}

export function findExternalConnectionState(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(externalConnectionState)
    .where(eq(externalConnectionState.connectionId, connectionId))
    .get();
}

export function updateExternalConnectionState(
  executor: DatabaseExecutor,
  connectionId: string,
  value: Partial<
    Omit<
      typeof externalConnectionState.$inferInsert,
      "connectionId" | "lastNonceText" | "updatedAt"
    >
  > & { updatedAt: string },
): void {
  assertOptionalInstant(value.lastAttemptAt);
  assertOptionalInstant(value.lastSuccessAt);
  assertOptionalInstant(value.permissionCheckedAt);
  assertOptionalInstant(value.cooldownUntil);
  assertOptionalInstant(value.lastLedgerSyncAt);
  assertOptionalInstant(value.lastTradeSyncAt);
  canonicalUtcInstantValue(value.updatedAt);
  assertJsonText(value.permissionSummaryJson);
  executor
    .update(externalConnectionState)
    .set(value)
    .where(eq(externalConnectionState.connectionId, connectionId))
    .run();
}

export function setExternalConnectionNonce(
  executor: DatabaseExecutor,
  connectionId: string,
  lastNonceText: string,
  updatedAt: string,
): void {
  assertUnsignedIntegerText(lastNonceText);
  canonicalUtcInstantValue(updatedAt);
  executor
    .update(externalConnectionState)
    .set({ lastNonceText, updatedAt })
    .where(eq(externalConnectionState.connectionId, connectionId))
    .run();
}

export function findExternalAssetMapping(
  executor: DatabaseExecutor,
  connectionId: string,
  providerAssetKey: string,
) {
  return executor
    .select()
    .from(externalAssetMappings)
    .where(
      and(
        eq(externalAssetMappings.connectionId, connectionId),
        eq(externalAssetMappings.providerAssetKey, providerAssetKey),
      ),
    )
    .get();
}

export function listExternalAssetMappings(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(externalAssetMappings)
    .where(eq(externalAssetMappings.connectionId, connectionId))
    .orderBy(asc(externalAssetMappings.providerAssetKey))
    .all();
}

export function upsertExternalAssetMapping(
  executor: DatabaseExecutor,
  value: typeof externalAssetMappings.$inferInsert,
): void {
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  assertJsonText(value.providerMetadataJson);
  executor
    .insert(externalAssetMappings)
    .values(value)
    .onConflictDoUpdate({
      target: [
        externalAssetMappings.connectionId,
        externalAssetMappings.providerAssetKey,
      ],
      set: {
        providerDisplayCode: value.providerDisplayCode,
        talliAssetId: value.talliAssetId,
        mappingStatus: value.mappingStatus,
        providerMetadataJson: value.providerMetadataJson,
        updatedAt: value.updatedAt,
      },
    })
    .run();
}

export function findExternalAccountMapping(
  executor: DatabaseExecutor,
  connectionId: string,
  providerAssetKey: string,
) {
  return executor
    .select()
    .from(externalAccountMappings)
    .where(
      and(
        eq(externalAccountMappings.connectionId, connectionId),
        eq(externalAccountMappings.providerAssetKey, providerAssetKey),
      ),
    )
    .get();
}

export function listExternalAccountMappings(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(externalAccountMappings)
    .where(eq(externalAccountMappings.connectionId, connectionId))
    .orderBy(asc(externalAccountMappings.providerAssetKey))
    .all();
}

export function findExternalAccountMappingByAccountId(
  executor: DatabaseExecutor,
  accountId: string,
) {
  return executor
    .select()
    .from(externalAccountMappings)
    .where(eq(externalAccountMappings.talliAccountId, accountId))
    .get();
}

export function upsertExternalAccountMapping(
  executor: DatabaseExecutor,
  value: typeof externalAccountMappings.$inferInsert,
): void {
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .insert(externalAccountMappings)
    .values(value)
    .onConflictDoUpdate({
      target: [
        externalAccountMappings.connectionId,
        externalAccountMappings.providerAssetKey,
      ],
      set: {
        talliAccountId: value.talliAccountId,
        isEnabled: value.isEnabled,
        updatedAt: value.updatedAt,
      },
    })
    .run();
}

export function deleteExternalAccountMapping(
  executor: DatabaseExecutor,
  connectionId: string,
  providerAssetKey: string,
): void {
  executor
    .delete(externalAccountMappings)
    .where(
      and(
        eq(externalAccountMappings.connectionId, connectionId),
        eq(externalAccountMappings.providerAssetKey, providerAssetKey),
      ),
    )
    .run();
}

export function insertExternalSyncRun(
  executor: DatabaseExecutor,
  value: typeof externalSyncRuns.$inferInsert,
): void {
  canonicalUtcInstantValue(value.startedAt);
  assertOptionalInstant(value.finishedAt);
  executor.insert(externalSyncRuns).values(value).run();
}

export function finishExternalSyncRun(
  executor: DatabaseExecutor,
  runId: string,
  value: Pick<
    typeof externalSyncRuns.$inferInsert,
    | "finishedAt"
    | "status"
    | "balancesSeen"
    | "sourceObjectsSeen"
    | "candidatesCreated"
    | "candidatesUpdated"
    | "errorCode"
    | "errorMessage"
  >,
): void {
  assertOptionalInstant(value.finishedAt);
  executor
    .update(externalSyncRuns)
    .set(value)
    .where(eq(externalSyncRuns.id, runId))
    .run();
}

export function listExternalSyncRuns(
  executor: DatabaseExecutor,
  connectionId: string,
  limit = 20,
) {
  return executor
    .select()
    .from(externalSyncRuns)
    .where(eq(externalSyncRuns.connectionId, connectionId))
    .orderBy(desc(externalSyncRuns.startedAt), desc(externalSyncRuns.id))
    .limit(limit)
    .all();
}

export function findExternalSourceObject(
  executor: DatabaseExecutor,
  connectionId: string,
  objectType: "kraken_ledger" | "kraken_trade",
  externalId: string,
) {
  return executor
    .select()
    .from(externalSourceObjects)
    .where(
      and(
        eq(externalSourceObjects.connectionId, connectionId),
        eq(externalSourceObjects.objectType, objectType),
        eq(externalSourceObjects.externalId, externalId),
      ),
    )
    .get();
}

export function findExternalSourceObjectById(
  executor: DatabaseExecutor,
  sourceObjectId: string,
) {
  return executor
    .select()
    .from(externalSourceObjects)
    .where(eq(externalSourceObjects.id, sourceObjectId))
    .get();
}

export function insertExternalSourceObject(
  executor: DatabaseExecutor,
  value: typeof externalSourceObjects.$inferInsert,
): void {
  canonicalUtcInstantValue(value.occurredAt);
  canonicalUtcInstantValue(value.firstSeenAt);
  canonicalUtcInstantValue(value.lastSeenAt);
  assertJsonText(value.payloadJson);
  assertSha256(value.payloadHash);
  executor.insert(externalSourceObjects).values(value).run();
}

export function updateExternalSourceObject(
  executor: DatabaseExecutor,
  sourceObjectId: string,
  value: Pick<
    typeof externalSourceObjects.$inferInsert,
    "occurredAt" | "payloadJson" | "payloadHash" | "lastSeenAt"
  >,
): void {
  canonicalUtcInstantValue(value.occurredAt);
  canonicalUtcInstantValue(value.lastSeenAt);
  assertJsonText(value.payloadJson);
  assertSha256(value.payloadHash);
  executor
    .update(externalSourceObjects)
    .set(value)
    .where(eq(externalSourceObjects.id, sourceObjectId))
    .run();
}

export function findExternalBalanceObservation(
  executor: DatabaseExecutor,
  observationId: string,
) {
  return executor
    .select()
    .from(externalBalanceObservations)
    .where(eq(externalBalanceObservations.id, observationId))
    .get();
}

export function insertExternalBalanceObservation(
  executor: DatabaseExecutor,
  value: typeof externalBalanceObservations.$inferInsert,
): void {
  validatedExternalDecimalText(value.providerAmountText);
  if (
    value.mappedAmountAtomic !== null &&
    value.mappedAmountAtomic !== undefined
  ) {
    assertAtomicDbText(value.mappedAmountAtomic);
  }
  canonicalUtcInstantValue(value.observedAt);
  canonicalUtcInstantValue(value.createdAt);
  assertSha256(value.payloadHash);
  executor.insert(externalBalanceObservations).values(value).run();
}

export function listExternalBalanceObservations(
  executor: DatabaseExecutor,
  connectionId: string,
  limit = 200,
) {
  return executor
    .select()
    .from(externalBalanceObservations)
    .where(eq(externalBalanceObservations.connectionId, connectionId))
    .orderBy(
      desc(externalBalanceObservations.observedAt),
      desc(externalBalanceObservations.createdAt),
      desc(externalBalanceObservations.id),
    )
    .limit(limit)
    .all();
}

export function findExternalCandidate(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(externalTransactionCandidates)
    .where(eq(externalTransactionCandidates.id, candidateId))
    .get();
}

export function findExternalCandidateByStableKey(
  executor: DatabaseExecutor,
  connectionId: string,
  stableKey: string,
) {
  return executor
    .select()
    .from(externalTransactionCandidates)
    .where(
      and(
        eq(externalTransactionCandidates.connectionId, connectionId),
        eq(externalTransactionCandidates.stableKey, stableKey),
      ),
    )
    .get();
}

export function insertExternalCandidate(
  executor: DatabaseExecutor,
  value: typeof externalTransactionCandidates.$inferInsert,
): void {
  canonicalUtcInstantValue(value.occurredAt);
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  canonicalUtcInstantValue(value.lastSeenAt);
  assertSha256(value.sourceFingerprint);
  executor.insert(externalTransactionCandidates).values(value).run();
}

export function updateExternalCandidate(
  executor: DatabaseExecutor,
  candidateId: string,
  value: Partial<
    Pick<
      typeof externalTransactionCandidates.$inferInsert,
      | "suggestedEventType"
      | "status"
      | "occurredAt"
      | "title"
      | "normalizationVersion"
      | "sourceFingerprint"
      | "updatedAt"
      | "lastSeenAt"
    >
  >,
): void {
  assertOptionalInstant(value.occurredAt);
  assertOptionalInstant(value.updatedAt);
  assertOptionalInstant(value.lastSeenAt);
  if (value.sourceFingerprint !== undefined) {
    assertSha256(value.sourceFingerprint);
  }
  executor
    .update(externalTransactionCandidates)
    .set(value)
    .where(eq(externalTransactionCandidates.id, candidateId))
    .run();
}

export function listExternalCandidates(
  executor: DatabaseExecutor,
  connectionId: string,
  status?: typeof externalTransactionCandidates.$inferSelect.status,
  limit = 100,
) {
  return executor
    .select()
    .from(externalTransactionCandidates)
    .where(
      status
        ? and(
            eq(externalTransactionCandidates.connectionId, connectionId),
            eq(externalTransactionCandidates.status, status),
          )
        : eq(externalTransactionCandidates.connectionId, connectionId),
    )
    .orderBy(
      desc(externalTransactionCandidates.occurredAt),
      desc(externalTransactionCandidates.id),
    )
    .limit(limit)
    .all();
}

export function replaceExternalCandidateDetails(
  executor: DatabaseExecutor,
  candidateId: string,
  sourceLinks: ReadonlyArray<
    Omit<typeof externalCandidateSourceObjects.$inferInsert, "candidateId">
  >,
  legs: ReadonlyArray<
    Omit<typeof externalTransactionLegs.$inferInsert, "candidateId">
  >,
): void {
  executor
    .delete(externalCandidateSourceObjects)
    .where(eq(externalCandidateSourceObjects.candidateId, candidateId))
    .run();
  executor
    .delete(externalTransactionLegs)
    .where(eq(externalTransactionLegs.candidateId, candidateId))
    .run();

  if (sourceLinks.length > 0) {
    executor
      .insert(externalCandidateSourceObjects)
      .values(sourceLinks.map((value) => ({ ...value, candidateId })))
      .run();
  }
  if (legs.length > 0) {
    for (const leg of legs) {
      validatedExternalDecimalText(leg.amountText);
      if (leg.amountAtomic !== null && leg.amountAtomic !== undefined) {
        assertAtomicDbText(leg.amountAtomic);
      }
    }
    executor
      .insert(externalTransactionLegs)
      .values(legs.map((value) => ({ ...value, candidateId })))
      .run();
  }
}

export function listExternalCandidateLegs(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(externalTransactionLegs)
    .where(eq(externalTransactionLegs.candidateId, candidateId))
    .orderBy(asc(externalTransactionLegs.legIndex))
    .all();
}

export function listExternalCandidateSourceLinks(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(externalCandidateSourceObjects)
    .where(eq(externalCandidateSourceObjects.candidateId, candidateId))
    .orderBy(asc(externalCandidateSourceObjects.relation))
    .all();
}

export function findExternalImportLink(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(externalImportLinks)
    .where(eq(externalImportLinks.candidateId, candidateId))
    .get();
}

export function findExternalImportLinkByLedgerEvent(
  executor: DatabaseExecutor,
  ledgerEventId: string,
) {
  return executor
    .select()
    .from(externalImportLinks)
    .where(eq(externalImportLinks.ledgerEventId, ledgerEventId))
    .get();
}

export function insertExternalImportLink(
  executor: DatabaseExecutor,
  value: typeof externalImportLinks.$inferInsert,
): void {
  canonicalUtcInstantValue(value.importedAt);
  assertSha256(value.importFingerprint);
  executor.insert(externalImportLinks).values(value).run();
}
