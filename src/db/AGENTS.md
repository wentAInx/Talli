# Persistence-specific Codex rules

These rules apply to `src/db/**`.

- SQLite + Drizzle is the V1 ledger and additive V2 valuation persistence boundary.
- Enable `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on opened application connections.
- Schema changes use explicit Drizzle migrations.
- Amount and snapshot atomic quantities persist as signed base-10 integer TEXT, never REAL/float.
- V2 price/rate columns persist as validated positive plain-decimal TEXT; derived quote cache/state never becomes a ledger fact.
- Preserve the logical schema and FK/on-delete semantics from `04_DATABASE_SCHEMA.sql` unless the canonical spec is explicitly changed.
- Event plus entries/tag mutations are one DB transaction. Restore is one DB transaction after full pre-validation.
- Do not maintain `account.balance` as source of truth.
- Avoid unsafe SQL SUM over arbitrary-size amount TEXT. Use bounded reads and Node `BigInt` aggregation where specified.
- Queries for transaction history must be bounded/paginated and avoid N+1 access patterns.
- Keep persistence row shapes from leaking through the UI; map at query/service boundaries where needed.
