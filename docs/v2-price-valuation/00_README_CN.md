# Talli V2.0 Price & Valuation Engine — Codex 工程任务包

## 1. 用途

本任务包用于在已经通过 V1 Final Audit 的 Talli 仓库上实现 **V2.0 Current Price & Valuation Foundation**。

- Repository: `wentAInx/Talli`
- V1 frozen baseline commit: `9345d8516aaa78495e408d53bb74e03f2f5eaa57`
- Baseline commit message: `fix: close Asset Ledger V1 final audit gaps`
- 本任务包冻结日期: `2026-08-08`

V2.0 不是重写记账系统，而是在 V1 Ledger 外增加可替换的行情与估值层。

核心原则：

> **Ledger quantities are facts. Market prices are derived data. Valuation must never mutate ledger facts.**
>
> 原生资产数量是账本事实；行情价格是衍生数据；估值系统不得修改任何 V1 Ledger 事实。

## 2. Codex 开工前必须做的检查

1. `git status --short`：确认工作树状态并报告。
2. `git rev-parse HEAD`：应为上述 V1 baseline，或用户明确批准的 descendant；若不一致，不要擅自 reset，先报告差异。
3. 阅读当前仓库的：
   - `README.md`
   - `src/db/schema.ts`
   - `src/domain/money.ts`
   - `src/domain/ledger.ts`
   - `src/domain/balance.ts`
   - `src/domain/reports.ts`
   - `src/services/ledger-read-service.ts`
   - `src/services/backup-service.ts`
   - V1 unit/integration/e2e tests
4. 运行并记录 baseline 可行的验证命令；若环境缺少浏览器或依赖，明确报告，不得伪造。
5. 建议从 `feat/v2-valuation` 分支开发。不要 push、部署或修改远端设置，除非用户明确要求。

## 3. 本包阅读顺序

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md`
3. `03_PRICE_VALUATION_DOMAIN_SPEC_CN.md`
4. `04_DATABASE_SCHEMA_V2_DRAFT.sql`
5. `05_TYPES_AND_SERVICE_CONTRACTS.ts`
6. `06_PROVIDER_IMPLEMENTATION_SPEC_CN.md`
7. `07_CACHE_AND_VALUATION_STATE_MACHINE_CN.md`
8. `08_BACKUP_V2_MIGRATION_SPEC_CN.md`
9. `09_UI_UX_SPEC_CN.md`
10. `10_TEST_ACCEPTANCE_CN.md`
11. `11_IMPLEMENTATION_PLAN_CN.md`
12. `12_NON_GOALS_AND_V21_BOUNDARY_CN.md`
13. `13_SEED_PROVIDER_MAPPINGS.json`
14. `14_EXTERNAL_API_REFERENCE_20260808_CN.md`

`MANIFEST.tsv` 用于完整性检查；`CODEX_HANDOFF_PROMPT.txt` 是用户把任务包交给 Codex 后可直接发送的启动提示词。

## 4. V2.0 必须交付

- Home Asset（仅 fiat）配置。
- CoinGecko 当前 Crypto→USD 市场价格。
- ECB 最新 EUR reference rates，并支持任意已映射 fiat 之间的 cross rate。
- Manual exact-pair quote override。
- Provider mapping。
- Current quote cache + provider refresh state。
- fresh / stale / missing / provider-error 明确状态。
- 统一 Quote Resolver。
- 当前 Portfolio Valuation。
- Dashboard 每资产估值与近似总估值。
- 手动刷新 + 页面加载后的非阻塞自动刷新。
- 估值不完整警告。
- Backup schemaVersion 2。
- V1 schemaVersion 1 backup 向后兼容恢复。
- CoinGecko attribution。
- 全量 V1 regression tests 保持通过。

## 5. V2.0 明确不做

- 历史净资产曲线。
- historical quote backfill。
- 每日 cron。
- WebSocket 行情。
- P&L / cost basis / tax。
- Kraken/Coinbase/Binance 账户同步。
- 钱包地址扫描、链上交易同步。
- stablecoin 固定 1:1。
- 股票/ETF/黄金自动行情。
- 多用户、认证、组织权限。

## 6. 关键架构约束

V1 现有表和语义必须保持冻结：

```text
books
assets
accounts
categories
tags
ledger_events
ledger_entries
event_tags
balance_snapshots
app_settings
app_meta
```

V2 只做 additive migration。不得把 `price`、`valuation`、`base currency` 字段塞进 `ledger_entries` 或 `balance_snapshots`。

## 7. 估值链路

V2.0 采用统一 USD bridge：

```text
Crypto
  CoinGecko: CRYPTO -> USD
                     |
                     v
                  USD bridge
                     |
                     v
Fiat  <-------- ECB fiat cross rate --------> Home Fiat
```

例如 Home=CNY：

```text
BTC -> USD (CoinGecko)
USD -> CNY (ECB)
BTC -> CNY = BTC/USD × USD/CNY
```

这样所有 Crypto 使用同一 FX 基准，不依赖 CoinGecko 自己的 CNY 换算；切换 Home Currency 时也不必重新抓 Crypto 行情。
