import { describe, expect, it } from "vitest";

import { balanceAt } from "../../../domain/balance";
import type {
  BalanceSnapshotFact,
  TimedLedgerEntry,
} from "../../../domain/types";

const accountId = "wise-usd";

function entry(
  id: string,
  occurredAt: string,
  amountAtomic: bigint,
): TimedLedgerEntry {
  return { id, accountId, occurredAt, amountAtomic };
}

function snapshot(
  id: string,
  asOf: string,
  balanceAtomic: bigint,
  createdAt = asOf,
): BalanceSnapshotFact {
  return { id, accountId, asOf, balanceAtomic, createdAt };
}

function query(
  queryTime: string,
  snapshots: readonly BalanceSnapshotFact[],
  entries: readonly TimedLedgerEntry[],
): bigint {
  return balanceAt({ accountId, queryTime, snapshots, entries });
}

describe("snapshot balance engine", () => {
  it("B-001 sums history from zero when no snapshot exists", () => {
    const entries = [
      entry("income", "2026-08-01T12:00:00.000Z", 10000n),
      entry("expense", "2026-08-02T12:00:00.000Z", -2000n),
      entry("future", "2026-08-04T12:00:00.000Z", 999n),
    ];

    expect(query("2026-08-03T23:59:59.999Z", [], entries)).toBe(8000n);
  });

  it("B-002 snapshot covers entries before its asOf", () => {
    const anchor = snapshot("anchor", "2026-08-07T10:00:00.000Z", 50000n);
    const backfilled = entry("old-expense", "2026-08-01T12:00:00.000Z", -2000n);

    expect(query("2026-08-07T12:00:00.000Z", [anchor], [backfilled])).toBe(
      50000n,
    );
  });

  it("B-003 applies entries after a snapshot", () => {
    const anchor = snapshot("anchor", "2026-08-07T10:00:00.000Z", 50000n);
    const later = entry("later-expense", "2026-08-08T12:00:00.000Z", -2000n);

    expect(query("2026-08-08T23:59:59.999Z", [anchor], [later])).toBe(48000n);
  });

  it("B-004 treats snapshot time as an exclusive lower bound", () => {
    const at = "2026-08-07T10:00:00.000Z";
    const anchor = snapshot("anchor", at, 50000n);
    const sameInstant = entry("same-instant", at, -2000n);

    expect(query("2026-08-07T12:00:00.000Z", [anchor], [sameInstant])).toBe(
      50000n,
    );
  });

  it("B-005 selects the latest applicable snapshot", () => {
    const snapshots = [
      snapshot("first", "2026-08-01T00:00:00.000Z", 10000n),
      snapshot("second", "2026-08-03T00:00:00.000Z", 9000n),
      snapshot("future", "2026-08-10T00:00:00.000Z", 99999n),
    ];
    const entries = [
      entry("day-two", "2026-08-02T12:00:00.000Z", -2000n),
      entry("day-four", "2026-08-04T12:00:00.000Z", -1000n),
    ];

    expect(query("2026-08-02T23:59:59.999Z", snapshots, entries)).toBe(8000n);
    expect(query("2026-08-03T00:00:00.000Z", snapshots, entries)).toBe(9000n);
    expect(query("2026-08-04T23:59:59.999Z", snapshots, entries)).toBe(8000n);
  });

  it("B-006 recalculates when an edited event crosses a snapshot", () => {
    const anchor = snapshot("anchor", "2026-08-07T10:00:00.000Z", 50000n);
    const after = entry("edited", "2026-08-08T12:00:00.000Z", -2000n);
    const before = { ...after, occurredAt: "2026-08-01T12:00:00.000Z" };
    const queryTime = "2026-08-09T00:00:00.000Z";

    expect(query(queryTime, [anchor], [after])).toBe(48000n);
    expect(query(queryTime, [anchor], [before])).toBe(50000n);
    expect(
      query(queryTime, [anchor], [{ ...before, occurredAt: after.occurredAt }]),
    ).toBe(48000n);
  });

  it("B-007 falls back after deleting the latest snapshot", () => {
    const first = snapshot("first", "2026-08-01T00:00:00.000Z", 10000n);
    const latest = snapshot("latest", "2026-08-03T00:00:00.000Z", 9000n);
    const entries = [
      entry("day-two", "2026-08-02T12:00:00.000Z", -2000n),
      entry("day-four", "2026-08-04T12:00:00.000Z", -1000n),
    ];
    const queryTime = "2026-08-04T23:59:59.999Z";

    expect(query(queryTime, [first, latest], entries)).toBe(8000n);
    expect(query(queryTime, [first], entries)).toBe(7000n);
  });

  it("uses a deterministic tie-breaker for snapshots with the same asOf", () => {
    const asOf = "2026-08-07T10:00:00.000Z";
    const older = snapshot("a", asOf, 100n, "2026-08-07T10:01:00.000Z");
    const newer = snapshot("b", asOf, 200n, "2026-08-07T10:02:00.000Z");

    expect(query("2026-08-07T12:00:00.000Z", [older, newer], [])).toBe(200n);
  });

  it("allows a negative derived account balance", () => {
    expect(
      query(
        "2026-08-02T00:00:00.000Z",
        [],
        [entry("overdraft", "2026-08-01T00:00:00.000Z", -30000n)],
      ),
    ).toBe(-30000n);
  });

  it.each(["2026-02-30T00:00:00.000Z", "2026-08-07 10:00:00Z"])(
    "rejects non-canonical or impossible UTC timestamp %s",
    (queryTime) => {
      expect(() => query(queryTime, [], [])).toThrowError(
        expect.objectContaining({ code: "INVALID_UTC_TIMESTAMP" }),
      );
    },
  );
});
