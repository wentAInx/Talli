import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import { balanceAt } from "../../domain/balance";
import { canonicalUtcInstantValue } from "../../domain/time";
import { atomicFromDb } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import { balanceSnapshots, ledgerEntries, ledgerEvents } from "../schema";
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

export function queryBalancesAt(
  executor: DatabaseExecutor,
  accountIds: readonly string[],
  queryTime: string,
): Map<string, bigint> {
  canonicalUtcInstantValue(queryTime);
  const balances = new Map(accountIds.map((accountId) => [accountId, 0n]));
  if (accountIds.length === 0) {
    return balances;
  }
  const snapshots = executor
    .select()
    .from(balanceSnapshots)
    .where(
      and(
        inArray(balanceSnapshots.accountId, [...accountIds]),
        lte(balanceSnapshots.asOf, queryTime),
      ),
    )
    .orderBy(
      asc(balanceSnapshots.accountId),
      desc(balanceSnapshots.asOf),
      desc(balanceSnapshots.createdAt),
      desc(balanceSnapshots.id),
    )
    .all();
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.accountId)) {
      latest.set(snapshot.accountId, snapshot);
      balances.set(snapshot.accountId, atomicFromDb(snapshot.balanceAtomic));
    }
  }
  const accountConditions: SQL[] = accountIds.map((accountId) => {
    const snapshot = latest.get(accountId);
    return and(
      eq(ledgerEntries.accountId, accountId),
      snapshot ? gt(ledgerEvents.occurredAt, snapshot.asOf) : undefined,
    )!;
  });
  const entries = executor
    .select({
      accountId: ledgerEntries.accountId,
      amountAtomic: ledgerEntries.amountAtomic,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerEvents, eq(ledgerEntries.eventId, ledgerEvents.id))
    .where(
      and(lte(ledgerEvents.occurredAt, queryTime), or(...accountConditions)),
    )
    .all();
  for (const entry of entries) {
    balances.set(
      entry.accountId,
      (balances.get(entry.accountId) ?? 0n) + atomicFromDb(entry.amountAtomic),
    );
  }
  return balances;
}
