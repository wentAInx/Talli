import { and, eq, gt, lte } from "drizzle-orm";

import { balanceAt } from "../../domain/balance";
import { canonicalUtcInstantValue } from "../../domain/time";
import { atomicFromDb } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import { ledgerEntries, ledgerEvents } from "../schema";
import { findLatestSnapshotAtOrBefore } from "./snapshots";

export function queryBalanceAt(
  executor: DatabaseExecutor,
  accountId: string,
  queryTime: string,
): bigint {
  canonicalUtcInstantValue(queryTime);
  const snapshot = findLatestSnapshotAtOrBefore(executor, accountId, queryTime);
  const entries = executor
    .select({
      id: ledgerEntries.id,
      accountId: ledgerEntries.accountId,
      amountAtomic: ledgerEntries.amountAtomic,
      occurredAt: ledgerEvents.occurredAt,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerEvents, eq(ledgerEntries.eventId, ledgerEvents.id))
    .where(
      and(
        eq(ledgerEntries.accountId, accountId),
        lte(ledgerEvents.occurredAt, queryTime),
        snapshot ? gt(ledgerEvents.occurredAt, snapshot.asOf) : undefined,
      ),
    )
    .all();

  return balanceAt({
    accountId,
    queryTime,
    snapshots: snapshot
      ? [
          {
            id: snapshot.id,
            accountId: snapshot.accountId,
            asOf: snapshot.asOf,
            balanceAtomic: atomicFromDb(snapshot.balanceAtomic),
            createdAt: snapshot.createdAt,
          },
        ]
      : [],
    entries: entries.map((entry) => ({
      ...entry,
      amountAtomic: atomicFromDb(entry.amountAtomic),
    })),
  });
}
