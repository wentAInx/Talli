import { and, desc, eq, lte, ne } from "drizzle-orm";

import { assertAtomicDbText } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import { balanceSnapshots } from "../schema";

export function findSnapshotById(executor: DatabaseExecutor, id: string) {
  return executor
    .select()
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.id, id))
    .get();
}

export function findLatestSnapshotAtOrBefore(
  executor: DatabaseExecutor,
  accountId: string,
  queryTime: string,
) {
  return executor
    .select()
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.accountId, accountId),
        lte(balanceSnapshots.asOf, queryTime),
      ),
    )
    .orderBy(
      desc(balanceSnapshots.asOf),
      desc(balanceSnapshots.createdAt),
      desc(balanceSnapshots.id),
    )
    .get();
}

export function findSnapshotAtTime(
  executor: DatabaseExecutor,
  accountId: string,
  asOf: string,
  excludingId?: string,
) {
  return executor
    .select()
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.accountId, accountId),
        eq(balanceSnapshots.asOf, asOf),
        excludingId ? ne(balanceSnapshots.id, excludingId) : undefined,
      ),
    )
    .get();
}

export function insertSnapshot(
  executor: DatabaseExecutor,
  value: typeof balanceSnapshots.$inferInsert,
): void {
  executor
    .insert(balanceSnapshots)
    .values({
      ...value,
      balanceAtomic: assertAtomicDbText(value.balanceAtomic),
    })
    .run();
}

export function updateSnapshot(
  executor: DatabaseExecutor,
  id: string,
  value: Pick<
    typeof balanceSnapshots.$inferInsert,
    "asOf" | "balanceAtomic" | "note" | "updatedAt"
  >,
): void {
  executor
    .update(balanceSnapshots)
    .set({
      ...value,
      balanceAtomic: assertAtomicDbText(value.balanceAtomic),
    })
    .where(eq(balanceSnapshots.id, id))
    .run();
}

export function deleteSnapshot(executor: DatabaseExecutor, id: string): void {
  executor.delete(balanceSnapshots).where(eq(balanceSnapshots.id, id)).run();
}
