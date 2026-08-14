import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { canonicalUtcInstantValue } from "../../domain/time";
import { assertAtomicDbText, PersistenceIntegrityError } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import {
  externalCandidateMatchLinks,
  externalSourceObjects,
  externalTransactionCandidates,
  fileImportBalanceObservationDetails,
  fileImportBatches,
  fileImportBatchSourceObjects,
  fileImportCandidateDetails,
  fileImportProfiles,
  fileImportSourceDetails,
  ledgerEntries,
  ledgerEvents,
} from "../schema";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function assertSha256(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new PersistenceIntegrityError(
      "File-import fingerprint must be lowercase SHA-256 hex.",
    );
  }
}

function assertJsonText(value: string): void {
  try {
    JSON.parse(value);
  } catch {
    throw new PersistenceIntegrityError(
      "File-import parser configuration must be valid JSON text.",
    );
  }
}

export function insertFileImportProfile(
  executor: DatabaseExecutor,
  value: typeof fileImportProfiles.$inferInsert,
): void {
  assertJsonText(value.parserConfigJson);
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  if (value.statementAccountFingerprint) {
    assertSha256(value.statementAccountFingerprint);
  }
  executor.insert(fileImportProfiles).values(value).run();
}

export function findFileImportProfile(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(fileImportProfiles)
    .where(eq(fileImportProfiles.connectionId, connectionId))
    .get();
}

export function listFileImportProfiles(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(fileImportProfiles)
    .orderBy(
      desc(fileImportProfiles.updatedAt),
      asc(fileImportProfiles.connectionId),
    )
    .all();
}

export function updateFileImportProfileIdentity(
  executor: DatabaseExecutor,
  connectionId: string,
  value: Pick<
    typeof fileImportProfiles.$inferInsert,
    | "statementAccountFingerprint"
    | "statementAccountLast4"
    | "statementCurrencyCode"
    | "updatedAt"
  >,
): void {
  if (value.statementAccountFingerprint) {
    assertSha256(value.statementAccountFingerprint);
  }
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .update(fileImportProfiles)
    .set(value)
    .where(eq(fileImportProfiles.connectionId, connectionId))
    .run();
}

export function findFileImportBatchByHash(
  executor: DatabaseExecutor,
  connectionId: string,
  fileSha256: string,
) {
  assertSha256(fileSha256);
  return executor
    .select()
    .from(fileImportBatches)
    .where(
      and(
        eq(fileImportBatches.connectionId, connectionId),
        eq(fileImportBatches.fileSha256, fileSha256),
      ),
    )
    .get();
}

export function listFileTransactionSources(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(externalSourceObjects)
    .where(
      and(
        eq(externalSourceObjects.connectionId, connectionId),
        eq(externalSourceObjects.objectType, "file_transaction"),
      ),
    )
    .orderBy(asc(externalSourceObjects.externalId))
    .all();
}

export function listFileTransactionCandidates(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(externalTransactionCandidates)
    .where(eq(externalTransactionCandidates.connectionId, connectionId))
    .orderBy(asc(externalTransactionCandidates.stableKey))
    .all();
}

export function insertFileImportBatch(
  executor: DatabaseExecutor,
  value: typeof fileImportBatches.$inferInsert,
): void {
  assertSha256(value.fileSha256);
  canonicalUtcInstantValue(value.ingestedAt);
  executor.insert(fileImportBatches).values(value).run();
}

export function listFileImportBatches(
  executor: DatabaseExecutor,
  connectionId: string,
  limit = 20,
) {
  return executor
    .select()
    .from(fileImportBatches)
    .where(eq(fileImportBatches.connectionId, connectionId))
    .orderBy(desc(fileImportBatches.ingestedAt), desc(fileImportBatches.id))
    .limit(limit)
    .all();
}

export function findFileImportBatch(
  executor: DatabaseExecutor,
  batchId: string,
) {
  return executor
    .select()
    .from(fileImportBatches)
    .where(eq(fileImportBatches.id, batchId))
    .get();
}

export function listFileImportBatchesForSource(
  executor: DatabaseExecutor,
  sourceObjectId: string,
) {
  return executor
    .select({ batch: fileImportBatches, link: fileImportBatchSourceObjects })
    .from(fileImportBatchSourceObjects)
    .innerJoin(
      fileImportBatches,
      eq(fileImportBatchSourceObjects.batchId, fileImportBatches.id),
    )
    .where(eq(fileImportBatchSourceObjects.sourceObjectId, sourceObjectId))
    .orderBy(desc(fileImportBatches.ingestedAt), desc(fileImportBatches.id))
    .all();
}

export function insertFileImportSourceDetail(
  executor: DatabaseExecutor,
  value: typeof fileImportSourceDetails.$inferInsert,
): void {
  executor.insert(fileImportSourceDetails).values(value).run();
}

export function updateFileImportSourceDetail(
  executor: DatabaseExecutor,
  sourceObjectId: string,
  value: Omit<typeof fileImportSourceDetails.$inferInsert, "sourceObjectId">,
): void {
  executor
    .update(fileImportSourceDetails)
    .set(value)
    .where(eq(fileImportSourceDetails.sourceObjectId, sourceObjectId))
    .run();
}

export function findFileImportSourceDetail(
  executor: DatabaseExecutor,
  sourceObjectId: string,
) {
  return executor
    .select()
    .from(fileImportSourceDetails)
    .where(eq(fileImportSourceDetails.sourceObjectId, sourceObjectId))
    .get();
}

export function insertFileImportBatchSource(
  executor: DatabaseExecutor,
  value: typeof fileImportBatchSourceObjects.$inferInsert,
): void {
  assertSha256(value.rawRowSha256);
  executor.insert(fileImportBatchSourceObjects).values(value).run();
}

export function insertFileImportCandidateDetail(
  executor: DatabaseExecutor,
  value: typeof fileImportCandidateDetails.$inferInsert,
): void {
  executor.insert(fileImportCandidateDetails).values(value).run();
}

export function updateFileImportCandidateDetail(
  executor: DatabaseExecutor,
  candidateId: string,
  value: Omit<typeof fileImportCandidateDetails.$inferInsert, "candidateId">,
): void {
  executor
    .update(fileImportCandidateDetails)
    .set(value)
    .where(eq(fileImportCandidateDetails.candidateId, candidateId))
    .run();
}

export function findFileImportCandidateDetail(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(fileImportCandidateDetails)
    .where(eq(fileImportCandidateDetails.candidateId, candidateId))
    .get();
}

export function insertFileImportBalanceObservationDetail(
  executor: DatabaseExecutor,
  value: typeof fileImportBalanceObservationDetails.$inferInsert,
): void {
  executor.insert(fileImportBalanceObservationDetails).values(value).run();
}

export function findFileImportBalanceObservationDetail(
  executor: DatabaseExecutor,
  observationId: string,
) {
  return executor
    .select()
    .from(fileImportBalanceObservationDetails)
    .where(eq(fileImportBalanceObservationDetails.observationId, observationId))
    .get();
}

export function findFileImportBalanceObservationDetailByBatch(
  executor: DatabaseExecutor,
  batchId: string,
) {
  return executor
    .select()
    .from(fileImportBalanceObservationDetails)
    .where(eq(fileImportBalanceObservationDetails.batchId, batchId))
    .get();
}

export function findExternalCandidateMatchLink(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(externalCandidateMatchLinks)
    .where(eq(externalCandidateMatchLinks.candidateId, candidateId))
    .get();
}

export function listExternalCandidateMatchLinksByLedgerEvent(
  executor: DatabaseExecutor,
  ledgerEventId: string,
) {
  return executor
    .select()
    .from(externalCandidateMatchLinks)
    .where(eq(externalCandidateMatchLinks.ledgerEventId, ledgerEventId))
    .orderBy(asc(externalCandidateMatchLinks.candidateId))
    .all();
}

export function insertExternalCandidateMatchLink(
  executor: DatabaseExecutor,
  value: typeof externalCandidateMatchLinks.$inferInsert,
): void {
  canonicalUtcInstantValue(value.matchedAt);
  assertSha256(value.matchFingerprint);
  executor.insert(externalCandidateMatchLinks).values(value).run();
}

export function deleteExternalCandidateMatchLink(
  executor: DatabaseExecutor,
  candidateId: string,
): void {
  executor
    .delete(externalCandidateMatchLinks)
    .where(eq(externalCandidateMatchLinks.candidateId, candidateId))
    .run();
}

export function listExactLedgerAccountEntriesInRange(
  executor: DatabaseExecutor,
  input: {
    accountId: string;
    amountAtomic: string;
    startInclusive: string;
    endInclusive: string;
  },
) {
  assertAtomicDbText(input.amountAtomic);
  canonicalUtcInstantValue(input.startInclusive);
  canonicalUtcInstantValue(input.endInclusive);
  return executor
    .select({
      ledgerEventId: ledgerEvents.id,
      bookId: ledgerEvents.bookId,
      eventType: ledgerEvents.eventType,
      occurredAt: ledgerEvents.occurredAt,
      payee: ledgerEvents.payee,
      note: ledgerEvents.note,
      amountAtomic: ledgerEntries.amountAtomic,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerEvents, eq(ledgerEntries.eventId, ledgerEvents.id))
    .where(
      and(
        eq(ledgerEntries.accountId, input.accountId),
        eq(ledgerEntries.amountAtomic, input.amountAtomic),
        gte(ledgerEvents.occurredAt, input.startInclusive),
        lte(ledgerEvents.occurredAt, input.endInclusive),
      ),
    )
    .orderBy(asc(ledgerEvents.occurredAt), asc(ledgerEvents.id))
    .all();
}

export function findExactLedgerAccountEntry(
  executor: DatabaseExecutor,
  input: { ledgerEventId: string; accountId: string; amountAtomic: string },
) {
  assertAtomicDbText(input.amountAtomic);
  return executor
    .select({
      ledgerEventId: ledgerEvents.id,
      bookId: ledgerEvents.bookId,
      occurredAt: ledgerEvents.occurredAt,
      payee: ledgerEvents.payee,
      note: ledgerEvents.note,
      amountAtomic: ledgerEntries.amountAtomic,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerEvents, eq(ledgerEntries.eventId, ledgerEvents.id))
    .where(
      and(
        eq(ledgerEvents.id, input.ledgerEventId),
        eq(ledgerEntries.accountId, input.accountId),
        eq(ledgerEntries.amountAtomic, input.amountAtomic),
      ),
    )
    .get();
}
