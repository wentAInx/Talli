import { asc, eq } from "drizzle-orm";

import { assertAtomicDbText } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import { eventTags, ledgerEntries, ledgerEvents } from "../schema";

export function findLedgerEventById(executor: DatabaseExecutor, id: string) {
  return executor
    .select()
    .from(ledgerEvents)
    .where(eq(ledgerEvents.id, id))
    .get();
}

export function findEntriesForEvent(
  executor: DatabaseExecutor,
  eventId: string,
) {
  return executor
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.eventId, eventId))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id))
    .all();
}

export function findTagIdsForEvent(
  executor: DatabaseExecutor,
  eventId: string,
) {
  return executor
    .select({ tagId: eventTags.tagId })
    .from(eventTags)
    .where(eq(eventTags.eventId, eventId))
    .orderBy(asc(eventTags.tagId))
    .all()
    .map((row) => row.tagId);
}

export function insertLedgerEvent(
  executor: DatabaseExecutor,
  value: typeof ledgerEvents.$inferInsert,
): void {
  executor.insert(ledgerEvents).values(value).run();
}

export function updateLedgerEvent(
  executor: DatabaseExecutor,
  id: string,
  value: Pick<
    typeof ledgerEvents.$inferInsert,
    "eventType" | "occurredAt" | "categoryId" | "payee" | "note" | "updatedAt"
  >,
): void {
  executor.update(ledgerEvents).set(value).where(eq(ledgerEvents.id, id)).run();
}

export function insertLedgerEntries(
  executor: DatabaseExecutor,
  values: (typeof ledgerEntries.$inferInsert)[],
): void {
  if (values.length > 0) {
    executor
      .insert(ledgerEntries)
      .values(
        values.map((value) => ({
          ...value,
          amountAtomic: assertAtomicDbText(value.amountAtomic),
        })),
      )
      .run();
  }
}

export function insertEventTags(
  executor: DatabaseExecutor,
  values: (typeof eventTags.$inferInsert)[],
): void {
  if (values.length > 0) {
    executor.insert(eventTags).values(values).run();
  }
}

export function deleteEntriesForEvent(
  executor: DatabaseExecutor,
  eventId: string,
): void {
  executor
    .delete(ledgerEntries)
    .where(eq(ledgerEntries.eventId, eventId))
    .run();
}

export function deleteTagsForEvent(
  executor: DatabaseExecutor,
  eventId: string,
): void {
  executor.delete(eventTags).where(eq(eventTags.eventId, eventId)).run();
}

export function deleteLedgerEvent(
  executor: DatabaseExecutor,
  eventId: string,
): void {
  executor.delete(ledgerEvents).where(eq(ledgerEvents.id, eventId)).run();
}
