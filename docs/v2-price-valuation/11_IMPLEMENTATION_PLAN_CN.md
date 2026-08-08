# V2.0 Implementation Plan

建议 Codex 依序推进；每阶段完成后先测试再继续，不要先堆 UI。

# Phase 0 — Freeze V1 / Branch / Baseline

- 记录 `9345d8516aaa78495e408d53bb74e03f2f5eaa57`。
- 确认工作树。
- 建议分支 `feat/v2-valuation`。
- 运行 baseline verification。
- 不改历史 V1 migrations。

Gate：确认 V1 regression 当前可运行状态。

# Phase 1 — Price Decimal Domain

新增纯 domain：

```text
price-decimal.ts
quote-types.ts
quote-math.ts
```

实现：

- positive plain decimal parser/normalizer。
- Decimal precision policy。
- multiply/divide/invert/compose。
- rate display helpers。

Gate：P/Q unit tests。

# Phase 2 — Additive V2 Schema

修改 `src/db/schema.ts` 并生成新 migration：

```text
book_valuation_settings
price_provider_mappings
manual_price_quotes
latest_price_quotes
price_provider_state
```

新增 query modules。

Gate：V1->V2 migration integration test，V1 facts unchanged。

# Phase 3 — V2 Seed / Config Services

- `SEED_SCHEMA_VERSION` -> 2。
- Home CNY seed（若 canonical seed context）。
- canonical provider mappings seed。
- idempotent seed upgrade。
- ValuationSettingsService。
- ProviderMappingService。
- ManualPriceService。

Gate：seed idempotency + config validation。

# Phase 4 — Provider Adapters

- injectable HTTP transport。
- CoinGecko adapter + fixtures。
- ECB adapter + CSV parser + fixtures。
- server-only boundaries。
- structured error types。

Gate：完全 offline adapter tests。

# Phase 5 — Refresh / Cache Service

- TTL policy。
- provider state。
- in-flight dedupe。
- no-network-in-transaction flow。
- cache upsert。
- 429 cooldown。

Gate：cache state integration tests。

# Phase 6 — Quote Resolver

只读 local DB/cache：

- identity。
- manual exact override。
- ECB fiat cross。
- Crypto/USD + USD/Home compose。
- status/provenance propagation。

Gate：Q-001~Q-008。

# Phase 7 — Portfolio Valuation Service

复用 V1 LedgerRead/balance semantics：

- same queryTime。
- asset aggregation。
- Decimal valuation。
- negative balances。
- completeness。
- final rounding only。

Gate：V-001~V-006 + ledger isolation。

# Phase 8 — Backup v2 / v1 Adapter

尽早完成，避免新增 config 无备份：

- schemaVersion 2。
- V1 payload upgrade adapter。
- V2 config include。
- derived cache exclude。
- restore target/seed-only v2。

Gate：B2 tests。

# Phase 9 — Server Refresh Endpoint/Action

- same-origin POST refresh。
- force/manual refresh semantics。
- server-only key。
- safe error DTO。

不要让 Server Component 在 render path 直接 fetch external API。

# Phase 10 — Dashboard & Settings UI

- estimated total card。
- per-asset valuation。
- stale/missing indicators。
- Settings → Valuation。
- mappings/manual quote/provider status。
- attribution。
- mobile/a11y。

Gate：E2E。

# Phase 11 — Hardening

- full V1 + V2 tests。
- build/lint/typecheck/db:check。
- Docker env docs。
- `.env.example` 增加：

```text
COINGECKO_MODE=demo
COINGECKO_API_KEY=
```

不要写真实 key。

- README 更新 V2.0、数据源语义、cache/stale、backup v2、V1 compatibility。

# Phase 12 — Final Audit

最终自行检查：

- `git diff 9345d8516aaa78495e408d53bb74e03f2f5eaa57...HEAD`。
- 没有 V1 ledger semantic drift。
- 没有 `USDT=USD` hardcode。
- 没有 client key leakage。
- 没有 historical/cron/P&L/sync scope expansion。
- 报告实际验证命令。
