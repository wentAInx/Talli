import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import {
  externalConnections,
  externalTransactionCandidates,
  externalTransactionLegs,
  fileImportCandidateDetails,
  ledgerEntries,
  ledgerEvents,
  recurringItems,
  recurringItemTags,
  recurringOccurrenceLinks,
  recurringOccurrenceSkips,
} from "../schema";

export function findRecurringItemRow(
  executor: DatabaseExecutor,
  recurringItemId: string,
) {
  return executor
    .select()
    .from(recurringItems)
    .where(eq(recurringItems.id, recurringItemId))
    .get();
}

export function listRecurringItemRowsForBook(
  executor: DatabaseExecutor,
  bookId: string,
  activeOnly = false,
) {
  return executor
    .select()
    .from(recurringItems)
    .where(
      activeOnly
        ? and(
            eq(recurringItems.bookId, bookId),
            eq(recurringItems.isActive, true),
          )
        : eq(recurringItems.bookId, bookId),
    )
    .orderBy(asc(recurringItems.name), asc(recurringItems.id))
    .all();
}

export function listRecurringItemRowsForAccount(
  executor: DatabaseExecutor,
  accountId: string,
  activeOnly = false,
) {
  return executor
    .select()
    .from(recurringItems)
    .where(
      activeOnly
        ? and(
            eq(recurringItems.accountId, accountId),
            eq(recurringItems.isActive, true),
          )
        : eq(recurringItems.accountId, accountId),
    )
    .orderBy(asc(recurringItems.name), asc(recurringItems.id))
    .all();
}

export function accountHasRecurringItems(
  executor: DatabaseExecutor,
  accountId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: recurringItems.id })
      .from(recurringItems)
      .where(eq(recurringItems.accountId, accountId))
      .get(),
  );
}

export function accountHasActiveRecurringItems(
  executor: DatabaseExecutor,
  accountId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: recurringItems.id })
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.accountId, accountId),
          eq(recurringItems.isActive, true),
        ),
      )
      .get(),
  );
}

export function activeRecurringItemsReferenceCategory(
  executor: DatabaseExecutor,
  bookId: string,
  categoryId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: recurringItems.id })
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.bookId, bookId),
          eq(recurringItems.categoryId, categoryId),
          eq(recurringItems.isActive, true),
        ),
      )
      .get(),
  );
}

export function activeRecurringItemsReferenceTag(
  executor: DatabaseExecutor,
  bookId: string,
  tagId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: recurringItems.id })
      .from(recurringItemTags)
      .innerJoin(
        recurringItems,
        eq(recurringItems.id, recurringItemTags.recurringItemId),
      )
      .where(
        and(
          eq(recurringItems.bookId, bookId),
          eq(recurringItems.isActive, true),
          eq(recurringItemTags.tagId, tagId),
        ),
      )
      .get(),
  );
}

export function insertRecurringItem(
  executor: DatabaseExecutor,
  value: typeof recurringItems.$inferInsert,
): void {
  executor.insert(recurringItems).values(value).run();
}

export function updateRecurringItem(
  executor: DatabaseExecutor,
  recurringItemId: string,
  value: Partial<typeof recurringItems.$inferInsert>,
): void {
  executor
    .update(recurringItems)
    .set(value)
    .where(eq(recurringItems.id, recurringItemId))
    .run();
}

export function replaceRecurringItemTags(
  executor: DatabaseExecutor,
  recurringItemId: string,
  tagIds: readonly string[],
): void {
  executor
    .delete(recurringItemTags)
    .where(eq(recurringItemTags.recurringItemId, recurringItemId))
    .run();
  if (tagIds.length > 0) {
    executor
      .insert(recurringItemTags)
      .values(tagIds.map((tagId) => ({ recurringItemId, tagId })))
      .run();
  }
}

export function listRecurringItemTagIds(
  executor: DatabaseExecutor,
  recurringItemId: string,
): string[] {
  return executor
    .select({ tagId: recurringItemTags.tagId })
    .from(recurringItemTags)
    .where(eq(recurringItemTags.recurringItemId, recurringItemId))
    .orderBy(asc(recurringItemTags.tagId))
    .all()
    .map((row) => row.tagId);
}

export function findRecurringOccurrenceLink(
  executor: DatabaseExecutor,
  recurringItemId: string,
  occurrenceDate: string,
) {
  return executor
    .select()
    .from(recurringOccurrenceLinks)
    .where(
      and(
        eq(recurringOccurrenceLinks.recurringItemId, recurringItemId),
        eq(recurringOccurrenceLinks.occurrenceDate, occurrenceDate),
      ),
    )
    .get();
}

export function findRecurringOccurrenceLinkByLedgerEvent(
  executor: DatabaseExecutor,
  ledgerEventId: string,
) {
  return executor
    .select()
    .from(recurringOccurrenceLinks)
    .where(eq(recurringOccurrenceLinks.ledgerEventId, ledgerEventId))
    .get();
}

export function listRecurringOccurrenceLinks(
  executor: DatabaseExecutor,
  recurringItemId: string,
) {
  return executor
    .select()
    .from(recurringOccurrenceLinks)
    .where(eq(recurringOccurrenceLinks.recurringItemId, recurringItemId))
    .orderBy(asc(recurringOccurrenceLinks.occurrenceDate))
    .all();
}

export function insertRecurringOccurrenceLink(
  executor: DatabaseExecutor,
  value: typeof recurringOccurrenceLinks.$inferInsert,
): void {
  executor.insert(recurringOccurrenceLinks).values(value).run();
}

export function deleteRecurringOccurrenceLink(
  executor: DatabaseExecutor,
  recurringItemId: string,
  occurrenceDate: string,
): void {
  executor
    .delete(recurringOccurrenceLinks)
    .where(
      and(
        eq(recurringOccurrenceLinks.recurringItemId, recurringItemId),
        eq(recurringOccurrenceLinks.occurrenceDate, occurrenceDate),
      ),
    )
    .run();
}

export function findRecurringOccurrenceSkip(
  executor: DatabaseExecutor,
  recurringItemId: string,
  occurrenceDate: string,
) {
  return executor
    .select()
    .from(recurringOccurrenceSkips)
    .where(
      and(
        eq(recurringOccurrenceSkips.recurringItemId, recurringItemId),
        eq(recurringOccurrenceSkips.occurrenceDate, occurrenceDate),
      ),
    )
    .get();
}

export function listRecurringOccurrenceSkips(
  executor: DatabaseExecutor,
  recurringItemId: string,
) {
  return executor
    .select()
    .from(recurringOccurrenceSkips)
    .where(eq(recurringOccurrenceSkips.recurringItemId, recurringItemId))
    .orderBy(asc(recurringOccurrenceSkips.occurrenceDate))
    .all();
}

export function insertRecurringOccurrenceSkip(
  executor: DatabaseExecutor,
  value: typeof recurringOccurrenceSkips.$inferInsert,
): void {
  executor.insert(recurringOccurrenceSkips).values(value).run();
}

export function deleteRecurringOccurrenceSkip(
  executor: DatabaseExecutor,
  recurringItemId: string,
  occurrenceDate: string,
): void {
  executor
    .delete(recurringOccurrenceSkips)
    .where(
      and(
        eq(recurringOccurrenceSkips.recurringItemId, recurringItemId),
        eq(recurringOccurrenceSkips.occurrenceDate, occurrenceDate),
      ),
    )
    .run();
}

export function listRecurringLedgerCandidates(
  executor: DatabaseExecutor,
  input: {
    accountId: string;
    eventType: "expense" | "income";
    startInclusive: string;
    endExclusive: string;
  },
) {
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
    .innerJoin(ledgerEvents, eq(ledgerEvents.id, ledgerEntries.eventId))
    .where(
      and(
        eq(ledgerEntries.accountId, input.accountId),
        eq(ledgerEntries.entryRole, "main"),
        eq(ledgerEvents.eventType, input.eventType),
        gte(ledgerEvents.occurredAt, input.startInclusive),
        lt(ledgerEvents.occurredAt, input.endExclusive),
      ),
    )
    .orderBy(asc(ledgerEvents.occurredAt), asc(ledgerEvents.id))
    .all();
}

export function listRecurringFileCandidates(
  executor: DatabaseExecutor,
  input: {
    accountId: string;
    startInclusive: string;
    endExclusive: string;
  },
) {
  return executor
    .select({
      candidateId: externalTransactionCandidates.id,
      bookId: externalConnections.bookId,
      occurredAt: externalTransactionCandidates.occurredAt,
      status: externalTransactionCandidates.status,
      direction: fileImportCandidateDetails.direction,
      payee: fileImportCandidateDetails.normalizedPayee,
      memo: fileImportCandidateDetails.memo,
      amountAtomic: externalTransactionLegs.amountAtomic,
    })
    .from(externalTransactionCandidates)
    .innerJoin(
      externalConnections,
      eq(externalConnections.id, externalTransactionCandidates.connectionId),
    )
    .innerJoin(
      fileImportCandidateDetails,
      eq(
        fileImportCandidateDetails.candidateId,
        externalTransactionCandidates.id,
      ),
    )
    .innerJoin(
      externalTransactionLegs,
      eq(externalTransactionLegs.candidateId, externalTransactionCandidates.id),
    )
    .where(
      and(
        eq(externalConnections.provider, "file_import"),
        eq(fileImportCandidateDetails.targetAccountId, input.accountId),
        inArray(externalTransactionCandidates.status, [
          "pending",
          "needs_mapping",
        ]),
        gte(externalTransactionCandidates.occurredAt, input.startInclusive),
        lt(externalTransactionCandidates.occurredAt, input.endExclusive),
      ),
    )
    .orderBy(
      asc(externalTransactionCandidates.occurredAt),
      asc(externalTransactionCandidates.id),
    )
    .all();
}
