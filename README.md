# Talli

Talli is a single-user, self-hosted, multi-asset personal ledger. Its V1 core
stores exact native-asset quantities; V2.0 adds an optional, current-only price
and valuation layer without changing ledger facts.

## V2.0 implementation status

The frozen V1 ledger remains intact, and the V2.0 task-package phases are implemented:

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
  recent logical ledger events.
- Stable keyset transaction pagination with date, event type, account, asset,
  category, tag, and text filters. Event entries and tags are hydrated in
  batches rather than with per-row queries.
- App-timezone-aware transaction input/display and half-open monthly report
  boundaries, including DST validation.
- Monthly income/expense and category reports in separate native-asset
  sections. Transfer/exchange principal is excluded; fee expense stays in its
  own fee asset.
- Asset, category, tag, timezone, archive, and self-hosted data settings.
- Current valuation with a fiat Home Asset, exact Decimal composition,
  completeness semantics, provenance, and final-display-only rounding.
- CoinGecko crypto/USD market quotes, ECB EUR reference legs/cross rates,
  explicit provider mappings, manual exact-pair override, TTL/stale cache, and
  per-provider cooldown/state.
- Same-origin client refresh after hydration; Server Components never wait for
  external providers and provider credentials remain server-only.
- Lossless schemaVersion 2 JSON backup, guarded preview/restore, and
  human-readable CSV export. V1 schemaVersion 1 payloads are upgraded in memory;
  derived quote cache/provider state and API credentials are excluded.
- Loading/error/404 states, keyboard tab navigation, mobile layouts, indexed
  event pages, and desktop/mobile Playwright coverage.

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

On the first browser visit the app stores the browser IANA timezone, such as
`Asia/Shanghai`. It can be changed under **Settings → Date and timezone**.
All persisted timestamps remain canonical UTC.

For CoinGecko Demo API access, copy `.env.example` and set the key only in the
server runtime environment:

```bash
COINGECKO_MODE=demo
COINGECKO_API_KEY=your-server-only-demo-key
```

`COINGECKO_MODE=keyless` is an explicit local-development option. Talli never
falls back from failed demo-key authentication to keyless mode.

## Current valuation semantics

- Home Asset must be an active fiat asset.
- CoinGecko supplies mapped crypto → USD current market prices. USDT and USDC
  follow this same market path and are never hardcoded to 1 USD.
- ECB supplies provider-native `EUR → fiat` reference legs. Talli composes fiat
  cross rates with `decimal.js` and labels them as reference rates.
- An active manual `base → Home` exact-pair quote overrides the automatic path.
- Fresh/stale/missing/error states are explicit. A missing quote for a nonzero
  asset makes the estimate incomplete; it is never silently treated as zero.
- The dashboard keeps native quantities primary and marks Home values with `≈`.
- Valuation is current-only. V2.0 has no historical chart, cost basis, P&L,
  background collector, external account sync, or stablecoin shortcut.

## Backup, CSV, and restore

- **Settings → Data** downloads a complete JSON backup from
  `GET /api/data/backup`. IDs, UTC timestamps, `amountAtomic`, and
  `balanceAtomic` are preserved exactly.
- `GET /api/data/export.csv` emits one human-readable row per ledger entry.
  CSV is not a restore format.
- The backup wire identifier remains `multi-asset-ledger-backup` after the
  Talli rename so existing V1 backups stay compatible.
- V2 exports use `schemaVersion=2` and include Home settings, provider mappings,
  and manual quotes. V1 `schemaVersion=1` backups are upgraded and fully
  validated before any write.
- `latest_price_quotes`, `price_provider_state`, and API keys are intentionally
  excluded because they are derived or operational data.
- `POST /api/data/restore` supports preview and commit. The complete payload,
  foreign keys, category tree, event roles/signs, and atomic strings are
  validated before any write.
- Restore accepts only a migrated empty database or an unchanged seed-only
  database. A database with user accounts, transactions, snapshots, tags, or
  edited seed or valuation configuration is rejected because restore does not
  merge data.
- Commit rechecks the target inside one `BEGIN IMMEDIATE` transaction and runs
  SQLite foreign-key verification before commit. Any error rolls back all rows.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

## Docker

```bash
docker compose up --build
```

The container listens on port 3000 and stores SQLite data in the named volume
mounted at `/data`. Container startup runs migration and seed automatically;
both operations are repeatable. The app has no built-in authentication layer, so
deploy it only behind a trusted private network or an external access-control
proxy.

Runtime configuration:

| Variable | Container default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `/data/finance.db` | Writable SQLite file in persistent storage. |
| `PORT` | `3000` | Next.js listener inside a direct container run. Compose maps `${PORT:-3000}`. |
| `AUTO_SETUP_DATABASE` | `1` | Run checked migrations and idempotent seed at startup. |
| `COINGECKO_MODE` | `demo` | `demo` sends the server-only Demo key; `keyless` is explicit. |
| `COINGECKO_API_KEY` | empty | Server-only CoinGecko Demo key; never stored in SQLite or backup. |

Before upgrading, download and verify a JSON backup. For an additional raw
volume snapshot, stop writes (normally stop the container) before copying the
SQLite database together with any `-wal`/`-shm` sidecars; copying only the main
file while the app is writing is not a safe backup. Keep the previous image tag
and the pre-upgrade volume snapshot as the rollback pair. Migrations run on a
single startup process; do not start multiple replicas against the same SQLite
file.

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
- Reports never render a combined native-asset total, an implied CNY value, or
  an assumption such as `USDT = USD`. The separate V2 valuation card may show
  an explicit Home estimate only when quote resolution supplies each leg.
- Ledger atomic columns remain SQLite `TEXT` plus TypeScript `bigint`; V2 rate
  columns are positive plain-decimal `TEXT` plus `decimal.js`, never `REAL`.
- Provider HTTP is server-only and outside SQLite write transactions. Resolver,
  portfolio valuation, SSR, backup, and native reports never perform HTTP.
