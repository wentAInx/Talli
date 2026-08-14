# Talli

Talli is a single-user, self-hosted, multi-asset personal ledger. Its V1 core
stores exact native-asset quantities; V2.0 adds an optional, current-only price
and valuation layer without changing ledger facts. V3 adds an external-sync
observation and review layer with Kraken Spot read-only integration; it still
cannot post ledger facts without an explicit Import or Reconcile confirmation.
V4 adds Ethereum Mainnet public-address wallet observations, finalized on-chain
activity, and separate movement/gas review candidates under the same boundary.
V4.1 extends that read-only model to Base Mainnet and Arbitrum One with exact
debug-traced native movement and chain-specific fee provenance. V5 adds
account-first financial-file import for CSV, OFX/QFX banking and credit-card
statements, and ISO 20022 camt.053 while keeping file commit outside Ledger.
V5.1 adds deterministic rule projections for file-import review and date-only
recurring expectations; neither becomes a Ledger fact automatically.

## V5.1 implementation status

The frozen V1 ledger and additive V2/V3/V4/V4.1 baselines remain intact; the V5
task-package phases are implemented:

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
- V3 external connection, operational state, raw source, append-only balance
  observation, mapping, candidate, normalized-leg, and import-provenance tables.
- Kraken Spot read-only authentication, persisted monotonic nonce, permission
  deny-list, Assets/AssetPairs metadata, Balance, paginated Ledgers, and
  paginated Trades History through an injectable transport.
- `/sync` connection status, asset/account mapping, observed-vs-ledger balance,
  explicit snapshot reconciliation, candidate queues, candidate review, and
  imported-event provenance UI on desktop and mobile.
- Same-origin mutation routes for sync, candidate import/ignore, and observation
  reconciliation. Provider errors are categorized without returning signed
  request details or credentials.
- Atomic explicit Import through the same executor-scoped V1 writer, with a
  unique candidate/event provenance link and no duplicate posting on re-sync.
- Lossless `schemaVersion=3` backup of V1/V2 user facts and V3 fetched/provenance
  data, with V1/V2 in-memory upgrade compatibility. Nonce, cursor, permission
  state, sync runs, provider cache, and credentials remain excluded.
- Ethereum Mainnet (`chainId=1`) wallet connections accept public addresses
  only. Address, native asset, and ERC-20 chain/contract identities are
  canonical; symbol is display metadata and never an auto-mapping key.
- Alchemy access uses a fixed server-only chain registry and a read-method
  allowlist through an injectable transport. Current native/ERC-20 balances,
  finalized paginated transfers, transaction/receipt enrichment, and a 32-block
  reorg overlap are supported without provider I/O inside SQLite transactions.
- On-chain movement is netted per transaction from raw atomic values. Simple
  in/out/exchange candidates require review; complex DeFi remains unsupported.
  Exact execution/blob gas is a separate expense candidate, including gas from
  failed transactions.
- `/sync` groups movement and network fee by transaction hash, keeps contract
  addresses visible, and compares append-only on-chain observations with Talli
  Ledger balances. Sync itself never creates Ledger events or snapshots.
- Lossless `schemaVersion=4` backup adds EVM wallet, raw balance-detail, and
  candidate-detail user facts while continuing to restore versions 1/2/3/4.
  Alchemy secrets, sync runs, and finalized cursors remain excluded.
- Base Mainnet (`chainId=8453`) and Arbitrum One (`chainId=42161`) reuse the
  public-address-only wallet boundary. Wallet, native asset, ERC-20, movement,
  and fee identities always include the chain; bridge activity is never
  automatically correlated across chains.
- L2 activity discovery requests only `external` and `erc20` Transfers rows and
  is permanently labeled `discovery_limited`. Every discovered transaction
  requires an exact sanitized `debug_traceTransaction` projection before a
  movement candidate can be reviewed. If Debug is unavailable, balance facts
  remain usable while activity facts and the finalized cursor remain unchanged.
- Base exact fees combine execution, historical GasPriceOracle `getL1Fee`, and
  historical `getOperatorFee` after Isthmus. Arbitrum decomposes the receipt
  total with `gasUsedForL1` and never adds the parent component twice.
- Lossless `schemaVersion=5` backup adds L2 gas-fee component/evidence rows and
  accepts versions 1/2/3/4/5. Operational trace capability, cursors, sync runs,
  provider cache, and all credentials remain excluded.
- `/import` uses an immutable, explicit target-account profile. Asset mapping is
  never inferred from a statement symbol, code, filename, or account number.
- CSV, OFX 1 SGML, OFX 2 XML/QFX, banking and credit-card statement subsets, and
  camt.053.001.01 through `.14` are parsed with bounded file/row/text limits.
  Exact signed amounts use the target asset scale with no rounding.
- Preview is read-only. Commit reparses the full file before one atomic database
  transaction and creates only source, batch, candidate, observation, and
  provenance facts. It never creates a Ledger event or balance snapshot.
- Strong statement IDs and deterministic weak occurrence ordinals provide
  dedupe without collapsing identical weak rows. Reimport and changed-source
  states remain auditable and cannot duplicate Ledger facts.
- Match suggestions are informational. Only explicit Match Existing creates a
  provenance link, requires an exact signed entry in the target account and
  same book, and leaves Ledger untouched. Matched events must be unlinked before
  edit or delete.
- Explicit Import reuses the transactional V1 expense/income/transfer writer.
  OFX `LEDGERBAL` and camt.053 `CLBD` remain observations until a separate
  explicit Reconcile creates a snapshot.
- Raw files and full statement account numbers are never persisted. Structured
  XML rejects DTD, ENTITY, and XInclude input; parser code remains server-only
  and performs no network access.
- Lossless `schemaVersion=6` backup adds file profile, batch, selected source,
  candidate, match, and balance-observation provenance. Restore accepts versions
  1 through 6 and validates all relationships before its atomic write.
- Rules evaluate unresolved `file_import` candidates only, in deterministic
  `pre` / `default` / `post` order with `all` / `any` matching and condition
  negation. The evaluator performs no HTTP and exposes no user regex.
- Rule actions are limited to projected payee, category, tags, note, and an
  expense/income suggestion. Candidate amount, date, account, source identity,
  normalized legs, and Ledger facts remain unchanged until explicit Import.
- Recurring definitions support Expense and Income with date-only daily,
  weekly, monthly, and yearly recurrence. Missing fixed month days and non-leap
  February 29 are skipped; `last` month day is explicit.
- Exact, approximate, and range expectations use `bigint` atomic amounts.
  Occurrences are generated in memory, matching stays suggestive, and only an
  explicit Post, Import, or Link creates the corresponding persisted facts.
- Explicit recurring Post reuses the V1 transactional writer. Candidate Import
  plus recurring link, and Ledger event plus recurring link, each commit in one
  SQLite transaction.
- Lossless `schemaVersion=7` backup includes rule definitions, recurring
  definitions, tags, links, and skips while excluding derived projections,
  match suggestions, and generated future occurrence caches. Restore accepts
  versions 1 through 7.

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

Kraken sync requires a separate, dedicated Spot API key in the server runtime:

```bash
KRAKEN_API_KEY=your-dedicated-read-only-key
KRAKEN_API_SECRET=your-dedicated-read-only-secret
```

Grant only `query-funds`, `query-ledger`, and `query-closed-trades`. Talli
rejects missing required permissions and known write permissions. The key and
secret never enter SQLite, backup JSON, React props, HTML, client bundles,
logs, or source fixtures. Tests use an injected deterministic transport and do
not call Kraken.

Ethereum wallet sync uses one server-only Alchemy key and a fixed Ethereum
Mainnet endpoint:

```bash
ALCHEMY_API_KEY=your-server-only-alchemy-key
```

Only public wallet addresses are entered in Talli. Never enter a private key,
mnemonic, or seed phrase. Talli has no signing, sending, or configurable write
RPC path. Automated tests use an injected fixture and do not call Alchemy.

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
  background price collector, or stablecoin shortcut. V3/V4.1 external sync
  remains a separate native-asset observation/review layer and never supplies
  valuation prices.

## Backup, CSV, and restore

- **Settings → Data** downloads a complete JSON backup from
  `GET /api/data/backup`. IDs, UTC timestamps, `amountAtomic`, and
  `balanceAtomic` are preserved exactly.
- `GET /api/data/export.csv` emits one human-readable row per ledger entry.
  CSV is not a restore format.
- The backup wire identifier remains `multi-asset-ledger-backup` after the
  Talli rename so existing V1 backups stay compatible.
- V5.1 exports use `schemaVersion=7`. They retain V2/V3/V4/V4.1/V5 user facts,
  add Rules and Recurring definitions/links/skips, and continue to exclude raw
  file bytes and full statement account numbers. Backups from schema versions 1
  through 6 are upgraded in memory and fully validated before any write.
- `latest_price_quotes`, `price_provider_state`, and API keys are intentionally
  excluded because they are derived or operational data. V4.1 also excludes
  `external_connection_state`, `external_sync_runs`, and
  `evm_wallet_connection_state`.
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
pnpm security:check
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
| `KRAKEN_API_KEY` | empty | Dedicated server-only Kraken Spot read-only API key. |
| `KRAKEN_API_SECRET` | empty | Dedicated server-only Kraken signing secret. |
| `ALCHEMY_API_KEY` | empty | Server-only Alchemy key for fixed Ethereum/Base/Arbitrum Mainnet origins. |

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
- External API, on-chain, and imported financial-file data are not Ledger data.
  Sync/file commit writes only external source, batch, observation, candidate,
  mapping, provenance, and operational rows. Only an explicit Import may call
  the V1 ledger writer, and only an explicit Reconcile may call the V1 snapshot
  writer.
