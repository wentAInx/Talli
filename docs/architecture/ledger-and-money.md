# Ledger and money

This document defines the accounting core that every Talli feature must
preserve.

## Ledger quantities are the source of truth

**Design rule.** Accounts, events, entries, and snapshots determine native
asset quantities. Prices, provider observations, imported statements,
projections, expectations, and analytics are separate facts.

**Invariant.** No provider or derived-data path may create, replace, or adjust a
Ledger fact automatically.

**Reason.** External data can be stale, incomplete, duplicated, unavailable, or
mapped incorrectly. Keeping it separate makes every accounting mutation
intentional and auditable.

**Implementation consequence.** Only explicit Ledger command services create
or change events and entries. External candidates use explicit Import;
observed balances use explicit Reconcile.

## Exact atomic money

**Design rule.** A persisted monetary quantity is a signed base-10 integer
string in SQLite `TEXT`. Domain arithmetic uses TypeScript `bigint`.

**Invariant.** Persisted money, balances, fees, and executed quantities never
use SQLite `REAL`, JavaScript `number`, `Number()`, `parseFloat()`, or
floating-point arithmetic. Input with more fractional digits than an asset's
scale is rejected rather than rounded.

**Reason.** Decimal floating point cannot represent many financial quantities
exactly and can silently change values across parsing, calculation, and backup
round trips.

**Implementation consequence.** Conversion between display decimals and atomic
units happens at explicit codecs. Formatting occurs only at the presentation
boundary and always retains the asset code, scale, and sign.

## Logical events

**Design rule.** One logical event owns its complete set of entries and tags.

**Invariant.** Event creation, editing, and deletion are atomic SQLite
transactions. An account belongs to one asset.

Transaction semantics are explicit:

- `income` adds one principal entry.
- `expense` subtracts one principal entry.
- `transfer` moves the same asset between distinct accounts with equal absolute
  source and destination quantities.
- `exchange` moves different assets with independently entered source and
  destination quantities.
- transfer and exchange fees are separate expense entries and may use another
  asset.

**Reason.** A logical transaction must never be partially written, and transfer
or exchange principal must not be misclassified as income or expense.

**Implementation consequence.** UI and API boundaries submit commands; domain
builders validate entry roles and signs; the service layer owns the database
transaction.

## Snapshot balance rule

**Design rule.** Initial balances and reconciliations are balance snapshots, not
synthetic income or expense.

**Invariant.** For a query instant `T`, choose the latest snapshot with
`asOf <= T`, then add only entries in `(snapshot.asOf, T]`. Without an
applicable snapshot, sum entries through `T`.

**Reason.** Including entries already represented by a snapshot would double
count them. Lowering event timestamp precision can also place a new event on the
covered side of a snapshot boundary.

**Implementation consequence.** Snapshot and event timestamps retain full UTC
precision. Balance tests cover equal-time and immediately-after-snapshot cases.

## Reports and archives

**Invariant.** Reports count income principal, expense principal, and explicit
fees according to their asset. Transfer/exchange principal and snapshots are
excluded. Unlike assets are never summed into an implicit native total.

Referenced accounts, assets, and categories are archived instead of
destructively removed. Historical queries continue to include archived entities
when they had exposure during the requested period.

## Current source pointers

- `src/domain/money.ts`
- `src/domain/ledger.ts`
- `src/domain/balance.ts`
- `src/domain/reports.ts`
- `src/services/ledger-command-service.ts`
- `src/services/reconciliation-service.ts`
