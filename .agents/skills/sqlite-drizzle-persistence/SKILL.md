---
name: sqlite-drizzle-persistence
description: Implement or review SQLite/Drizzle schema, migrations, DB initialization, indexes, query modules, transaction handling, pagination, backup/restore persistence, and exact atomic amount storage for this ledger app.
---

# SQLite + Drizzle Persistence

Read `04_DATABASE_SCHEMA.sql`, `03_DOMAIN_LEDGER_SPEC_CN.md`, and `08_IMPLEMENTATION_PLAN_CN.md` before schema or migration changes.

## Canonical persistence choices

- SQLite is local/self-hosted V1 persistence.
- Drizzle owns the application schema/migrations.
- Enable foreign keys and WAL on the application connection.
- Use explicit migrations and idempotent seed behavior.
- Keep a default Book while preserving `book_id` where specified.

## Amount storage

`amount_atomic` and `balance_atomic` are signed base-10 integer TEXT.

Application validation must ensure their representation is an integer string. Do not change these columns to INTEGER/REAL merely for convenient aggregation: 64-bit SQLite integer range is not a safe universal representation for arbitrary asset scale/quantity, and REAL violates exactness.

Convert DB strings to `BigInt` at a controlled application boundary.

## Transaction discipline

A ledger command transaction contains all mutation steps that constitute one logical event, including event metadata, entries, and tags. An error in any entry/relationship must roll back the whole command.

Updating an event keeps the event ID while atomically updating metadata and replacing/updating related entries/tags according to the chosen implementation.

Restore performs full validation before opening/writing the transactional restore operation and cannot partially commit.

## Query discipline

- Add/use indexes corresponding to canonical access paths.
- Transaction list is paginated; avoid full-history reads.
- Stable order: `occurredAt DESC`, `createdAt DESC`, then `id` as deterministic tiebreaker.
- Prefer a cursor/keyset aligned with stable ordering for deep history.
- Asset filters match events when any entry belongs to an account with that asset.
- Avoid N+1 account/asset/category/tag hydration.
- Balance query selects latest applicable snapshot, then only the bounded post-snapshot entry range.
- Because atomic values are TEXT, sum financial values with Node `BigInt` when SQL cannot guarantee exact arbitrary-size integer arithmetic.
- Month reports should bound rows by UTC instants derived from app timezone before grouping/classification.

## Schema change guardrails

Do not add:

- account source-of-truth balance column;
- price/quote/history tables in V1 runtime;
- user/org/auth tables unless the V1 spec is explicitly changed;
- sync state/event bus/outbox tables speculatively;
- floating-point financial columns.

When a requested schema change modifies canonical semantics, stop treating it as an implementation detail and surface it as a specification change.

## Backup/restore ordering

Choose an insertion order that satisfies FKs, preserving IDs/timestamps. Validate relationships and schemaVersion before mutation. Restore is allowed only when the target business tables are empty.

## Verification

At minimum, persistence changes should cover:

- migration from empty DB;
- FK enforcement;
- command rollback on mid-write failure;
- snapshot boundary balance queries;
- exact large/18-decimal atomic values;
- backup/restore identity and rollback on invalid input.
