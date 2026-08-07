import { canonicalUtcInstantValue } from "./time";
import type { BalanceSnapshotFact, TimedLedgerEntry } from "./types";

function compareSnapshotTieBreakers(
  left: BalanceSnapshotFact,
  right: BalanceSnapshotFact,
): number {
  const createdDifference =
    canonicalUtcInstantValue(left.createdAt) -
    canonicalUtcInstantValue(right.createdAt);
  if (createdDifference !== 0) {
    return createdDifference;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function latestSnapshotAtOrBefore(
  accountId: string,
  queryTime: string,
  snapshots: readonly BalanceSnapshotFact[],
): BalanceSnapshotFact | null {
  const queryInstant = canonicalUtcInstantValue(queryTime);
  let latest: BalanceSnapshotFact | null = null;

  for (const snapshot of snapshots) {
    if (snapshot.accountId !== accountId) {
      continue;
    }

    const snapshotInstant = canonicalUtcInstantValue(snapshot.asOf);
    if (snapshotInstant > queryInstant) {
      continue;
    }

    if (!latest) {
      latest = snapshot;
      continue;
    }

    const latestInstant = canonicalUtcInstantValue(latest.asOf);
    if (
      snapshotInstant > latestInstant ||
      (snapshotInstant === latestInstant &&
        compareSnapshotTieBreakers(snapshot, latest) > 0)
    ) {
      latest = snapshot;
    }
  }

  return latest;
}

export function sumEntriesAfterSnapshot(
  accountId: string,
  fromExclusive: string | null,
  queryTime: string,
  entries: readonly TimedLedgerEntry[],
): bigint {
  const queryInstant = canonicalUtcInstantValue(queryTime);
  const lowerBound =
    fromExclusive === null ? null : canonicalUtcInstantValue(fromExclusive);
  let sum = 0n;

  for (const entry of entries) {
    if (entry.accountId !== accountId) {
      continue;
    }

    const occurredAt = canonicalUtcInstantValue(entry.occurredAt);
    if (
      occurredAt <= queryInstant &&
      (lowerBound === null || occurredAt > lowerBound)
    ) {
      sum += entry.amountAtomic;
    }
  }

  return sum;
}

export function balanceAt(input: {
  accountId: string;
  queryTime: string;
  snapshots: readonly BalanceSnapshotFact[];
  entries: readonly TimedLedgerEntry[];
}): bigint {
  const snapshot = latestSnapshotAtOrBefore(
    input.accountId,
    input.queryTime,
    input.snapshots,
  );
  const base = snapshot?.balanceAtomic ?? 0n;
  const delta = sumEntriesAfterSnapshot(
    input.accountId,
    snapshot?.asOf ?? null,
    input.queryTime,
    input.entries,
  );

  return base + delta;
}
