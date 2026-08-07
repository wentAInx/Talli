---
name: ledger-domain-guard
description: Implement or audit money parsing/formatting, expense/income/transfer/exchange semantics, fees, balance snapshots/reconciliation, balances, reports, executed exchange ratios, timezone-sensitive financial behavior, and lossless financial serialization. Trigger for any change that can alter ledger facts or balances.
---

# Ledger Domain Guard

This skill protects the canonical financial semantics. If a requested implementation conflicts with the canonical task package, preserve the package unless the user explicitly changes the specification.

Read `03_DOMAIN_LEDGER_SPEC_CN.md` and the relevant acceptance cases in `07_TEST_ACCEPTANCE_CN.md` before editing core behavior.

## 1. Exact money

- Asset `scale` defines accepted decimal precision.
- Parse decimal text manually/string-wise into atomic units or by another exact approach that never routes through binary floating point.
- Domain amount type is `bigint`.
- DB amount type is canonical base-10 integer string.
- Reject scientific notation, malformed separators, NaN/Infinity-like input, and excess fractional digits.
- Formatting may trim display zeros, but persistence/round-trip precision is never lost.
- Executed exchange ratios use decimal arithmetic/string results, never JS `number`.

## 2. Event invariants

### Expense

Exactly one `main` entry, amount < 0. No source/destination entries.

### Income

Exactly one `main` entry, amount > 0.

### Transfer

- source account != destination account;
- same source/destination asset;
- one source < 0 and one destination > 0;
- absolute principal quantities equal;
- optional fee entry < 0, and fee account may use any asset;
- principal is not report income/expense; fee is expense in the fee asset.

### Exchange

- source/destination assets differ;
- source < 0, destination > 0;
- quantities are independent and need not match;
- optional fee < 0, fee account/asset independent;
- source/destination principal is not report income/expense;
- executed ratio is derived from user-entered quantities only and is not a market quote.

Every event mutation is atomic with its entries/tags.

## 3. Snapshot / reconciliation

A snapshot at time `S.asOf` is a strong balance anchor.

For query time Q:

1. choose the latest snapshot with `asOf <= Q`;
2. base = snapshot balance, or 0 if absent;
3. add only entries satisfying `occurredAt > snapshot.asOf && occurredAt <= Q`, or all entries `<= Q` if no snapshot.

An event exactly at snapshot time is covered by the snapshot and is not added again.

Backfilling/editing/deleting events before a later snapshot must not leak across the anchor. Editing or deleting snapshots may change later derived balances and requires explicit UX warning.

Initial account balance is implemented as a snapshot at account creation, never as income.

Negative account balances are valid.

## 4. Reports

Income counts only `income/main` positive amounts.

Expense counts:

- `expense/main` absolute amount;
- `transfer/fee` absolute amount;
- `exchange/fee` absolute amount.

Exclude transfer source/destination, exchange source/destination, all snapshots, and opening balances.

Group by the entry account's asset. Never sum unlike assets.

Monthly boundaries use app timezone converted to UTC query boundaries; do not use server local timezone implicitly.

## 5. Backup / restore

- Atomic amounts stay strings.
- Preserve IDs and timestamps.
- Include schemaVersion.
- Restore V1 only into an empty business database.
- Validate the complete payload before writes.
- Restore all related rows atomically in a transaction.
- Reject wrong schema version or invalid references without partial data.

## 6. Mandatory test mapping

For changes in this skill's scope, map behavior to the relevant canonical IDs:

- Money: M-001..M-006
- Events: E-001..E-008
- Fees: F-001..F-002
- Snapshots: B-001..B-007
- Backup: D-001..D-004

Do not weaken a canonical assertion to make an implementation pass.
