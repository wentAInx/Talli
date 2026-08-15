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

interface HistoricalEntryPrefix {
  occurredAt: string;
  total: bigint;
}

function latestSnapshotIndexAtOrBefore(
  snapshots: readonly { asOf: string }[],
  queryTime: string,
): number {
  let low = 0;
  let high = snapshots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (snapshots[middle]!.asOf <= queryTime) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low - 1;
}

function prefixTotalAtOrBefore(
  entries: readonly HistoricalEntryPrefix[],
  queryTime: string,
): bigint {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle]!.occurredAt <= queryTime) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low === 0 ? 0n : entries[low - 1]!.total;
}

export function queryBalancesAtInstants(
  executor: DatabaseExecutor,
  accountIds: readonly string[],
  queryTimes: readonly string[],
): Map<string, Map<string, bigint>> {
  for (const queryTime of queryTimes) canonicalUtcInstantValue(queryTime);
  const result = new Map(
    queryTimes.map((queryTime) => [
      queryTime,
      new Map(accountIds.map((accountId) => [accountId, 0n])),
    ]),
  );
  if (accountIds.length === 0 || queryTimes.length === 0) return result;

  const maxQueryTime = [...queryTimes].sort().at(-1)!;
  const snapshots = executor
    .select({
      id: balanceSnapshots.id,
      accountId: balanceSnapshots.accountId,
      asOf: balanceSnapshots.asOf,
      balanceAtomic: balanceSnapshots.balanceAtomic,
      createdAt: balanceSnapshots.createdAt,
    })
    .from(balanceSnapshots)
    .where(
      and(
        inArray(balanceSnapshots.accountId, [...accountIds]),
        lte(balanceSnapshots.asOf, maxQueryTime),
      ),
    )
    .orderBy(
      asc(balanceSnapshots.accountId),
      asc(balanceSnapshots.asOf),
      asc(balanceSnapshots.createdAt),
      asc(balanceSnapshots.id),
    )
    .all();
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
        inArray(ledgerEntries.accountId, [...accountIds]),
        lte(ledgerEvents.occurredAt, maxQueryTime),
      ),
    )
    .orderBy(
      asc(ledgerEntries.accountId),
      asc(ledgerEvents.occurredAt),
      asc(ledgerEntries.id),
    )
    .all();

  const snapshotsByAccount = new Map<
    string,
    Array<(typeof snapshots)[number]>
  >();
  for (const snapshot of snapshots) {
    const rows = snapshotsByAccount.get(snapshot.accountId) ?? [];
    rows.push(snapshot);
    snapshotsByAccount.set(snapshot.accountId, rows);
  }

  const entriesByAccount = new Map<string, HistoricalEntryPrefix[]>();
  const runningTotals = new Map<string, bigint>();
  for (const entry of entries) {
    const next =
      (runningTotals.get(entry.accountId) ?? 0n) +
      atomicFromDb(entry.amountAtomic);
    runningTotals.set(entry.accountId, next);
    const rows = entriesByAccount.get(entry.accountId) ?? [];
    rows.push({ occurredAt: entry.occurredAt, total: next });
    entriesByAccount.set(entry.accountId, rows);
  }

  for (const queryTime of queryTimes) {
    const balances = result.get(queryTime)!;
    for (const accountId of accountIds) {
      const accountSnapshots = snapshotsByAccount.get(accountId) ?? [];
      const accountEntries = entriesByAccount.get(accountId) ?? [];
      const snapshotIndex = latestSnapshotIndexAtOrBefore(
        accountSnapshots,
        queryTime,
      );
      const totalAtQuery = prefixTotalAtOrBefore(accountEntries, queryTime);
      if (snapshotIndex < 0) {
        balances.set(accountId, totalAtQuery);
        continue;
      }
      const snapshot = accountSnapshots[snapshotIndex]!;
      const coveredEntryTotal = prefixTotalAtOrBefore(
        accountEntries,
        snapshot.asOf,
      );
      balances.set(
        accountId,
        atomicFromDb(snapshot.balanceAtomic) + totalAtQuery - coveredEntryTotal,
      );
    }
  }
  return result;
}
