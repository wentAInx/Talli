# Asset Ledger

Asset Ledger is a single-user, self-hosted, multi-asset personal ledger. V1
stores exact asset quantities and deliberately does not perform market pricing,
FX conversion, stablecoin assumptions, or cross-asset totals.

## Current implementation status

Phases 0–6 are implemented:

- Next.js 16, strict TypeScript, Tailwind CSS, ESLint, Prettier, Vitest, and
  Playwright tooling.
- Exact decimal parsing and formatting with `bigint` domain amounts.
- Expense, income, transfer, exchange, fee, and snapshot invariants.
- Drizzle schema and repeatable SQLite migration with WAL and foreign keys.
- Atomic account, ledger event, and reconciliation command services.
- Idempotent first-run seed for one default book, 9 assets, and 13 categories.
- Responsive product shell with desktop navigation and phone bottom navigation.
- Account list, create/edit/archive, initial balance, detail, and reconciliation UI.
- Expense, income, same-asset transfer, cross-asset exchange, fee, edit, and
  delete flows through Server Actions and the existing transactional services.
- Dashboard balances grouped by native asset with per-account breakdown and
  recent logical ledger events; no cross-asset total is calculated or shown.

Transaction search/filtering, reports, backup/export/restore, and final V1
hardening remain later phases and are not claimed complete here.

## Local development

Requirements: Node.js 22 and pnpm 10.11.0.

```bash
pnpm install --frozen-lockfile
DATABASE_PATH=./data/finance.db pnpm db:setup
DATABASE_PATH=./data/finance.db pnpm dev
```

`db:setup` runs the migration and idempotent seed. It creates no accounts,
balances, or transactions. Do not point tests at a development or production
database; integration tests create their own file-backed temporary databases.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm exec playwright test --list
```

## Docker

```bash
docker compose up --build
```

The container listens on port 3000 and stores SQLite data in the named volume
mounted at `/data`. Container startup runs migration and seed automatically;
both operations are repeatable. The app has no V1 authentication layer, so
deploy it only behind a trusted private network or an external access-control
proxy.

## Core boundaries

- Persisted monetary amounts are signed base-10 integer strings in SQLite
  `TEXT` columns; database codecs are the only `string`/`bigint` boundary.
- Each event, its entries, and its tags are written in one synchronous SQLite
  transaction.
- A balance uses the latest snapshot at or before the query time, then includes
  only entries in `(snapshot.asOf, queryTime]`.
- Transfer and exchange principals never become income or expense report data;
  optional fee entries remain separate and may use another asset.
- Initial balances and reconciliation facts are snapshots, never synthetic
  income events.
