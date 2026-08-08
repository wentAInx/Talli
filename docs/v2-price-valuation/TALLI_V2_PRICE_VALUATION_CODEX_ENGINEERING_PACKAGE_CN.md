# Talli V2.0 Price & Valuation Engine — Codex 单文件工程任务包

> Repository: `wentAInx/Talli`  
> Frozen V1 baseline: `9345d8516aaa78495e408d53bb74e03f2f5eaa57`  
> Package date: `2026-08-08`

> 本文件由多文件任务包合并生成。Codex 可使用单文件，但 ZIP 中独立 SQL/TS/JSON 文件更适合直接参考。


---

# FILE: 00_README_CN.md

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


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

# Codex Master Instruction — Talli V2.0

你是本项目的高级全栈工程师。目标是在 `wentAInx/Talli` 的 V1 冻结基线 `9345d8516aaa78495e408d53bb74e03f2f5eaa57` 上，严格实现本任务包定义的 V2.0 Price & Valuation Engine。

# A. 执行原则

1. **先读后写。** 先理解 V1 账本、余额锚点、备份格式、SQLite/Drizzle 迁移、E2E 结构，再开始修改。
2. **V1 语义冻结。** V2 不允许重写 Expense/Income/Transfer/Exchange/Reconciliation 语义。
3. **Additive migration only。** 新增 V2 表/索引；不得无必要修改 V1 表结构。
4. **网络不能成为账本可用性的前置条件。** CoinGecko/ECB 超时或宕机时，用户仍必须可以打开 Talli、记账、查看原生余额和 V1 报表。
5. **行情 API 仅服务器端访问。** API key 不得进入浏览器 bundle、HTML、SQLite、JSON backup、日志正文或错误回显。
6. **默认测试不得访问真实外网。** Provider adapters 使用注入式 HTTP transport / mock fixtures；可另做显式 opt-in live smoke，但不能成为普通 `pnpm test` 的前提。
7. **不要扩大范围。** 本轮只做 V2.0，不实现 V2.1 历史估值、P&L、账户同步等。
8. **不得伪造验证结果。** 只报告实际运行过的命令和真实结果。
9. **不要 push / deploy。** 除非用户另行明确要求。

# B. V1 冻结红线

以下代码行为必须保持：

- `amount_atomic` / `balance_atomic` 仍为 SQLite `TEXT` signed integer。
- V1 领域金额仍使用 `bigint`。
- Transfer 必须同资产等额本金。
- Exchange 必须跨资产、两边数量独立。
- fee 仍是独立负 entry，可使用第三资产。
- Balance 仍是 latest snapshot + `(snapshot.asOf, queryTime]` entries。
- Reconciliation 仍是 snapshot，不是收入/支出。
- V1 原生报表仍排除 Transfer/Exchange 本金，仅 fee 进入支出。
- 删除 `latest_price_quotes` 等 V2 衍生数据后，V1 current balances 和所有 ledger facts 必须完全不变。

# C. V2 精度规则

- Ledger 数量：继续 `bigint`，绝不改变。
- Price/FX rate：持久化为 **positive plain decimal TEXT**，业务计算使用 `decimal.js`。
- 禁止用 JS `number` 做价格乘除、cross rate 或 portfolio sum。
- Provider JSON 在外部 adapter 边界若以 JS number 到达，只允许立即 `String(value)` -> `Decimal`；不得在 number 上做任何财务计算。
- 禁止科学计数法写入 `rate_text`。
- 逐资产估值不要先 round 后再 sum；先保留高精度 Decimal 汇总，最终 UI display 才按 Home Asset scale 四舍五入。

# D. Provider 责任分离

- CoinGecko：只负责已映射 Crypto -> USD 的 current market quote。
- ECB：只负责 EUR reference rates，并由 resolver 计算 fiat cross rate。
- Manual：只负责用户明确输入的 exact pair override。
- Provider adapters 不得依赖 Account、Ledger、Dashboard。
- Quote Resolver 不得发 HTTP。
- Portfolio Valuation Service 不得发 HTTP。

# E. Quote precedence

对 `baseAsset -> homeAsset`：

1. `base == home`：identity rate=1。
2. 存在 active manual exact-pair quote：manual override，最高优先级。
3. base 为 fiat：ECB cross rate。
4. base 为 crypto：CoinGecko `base -> USD`；若 Home != USD，再乘 ECB `USD -> Home`。
5. base 为 custom：V2.0 只支持 manual exact-pair；否则 missing。

**USDT/USDC 不得特殊处理为 1 USD。** 它们必须和 BTC/ETH 一样从 CoinGecko 读取市场价格。

# F. 网络与事务

- 不得在 SQLite write transaction 内执行外部 HTTP。
- Refresh 流程应先短事务登记 attempt/cooldown，再在事务外 fetch，最后短事务写 quote/state。
- 同一 provider 同一进程应有 in-flight dedupe，避免并发重复请求。
- 429 应尊重 `Retry-After`（若有）并设置 cooldown；没有时至少 60 秒。
- Provider failure 不得把 rate 写成 0，也不得删除最后一次成功 cache。

# G. 验证门槛

最终必须运行项目实际可用的等价命令，并报告结果：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

如果环境不允许某项，报告原因及未验证风险。

# H. 最终输出

完成后给出：

1. 当前 HEAD 与分支。
2. V2.0 实现摘要。
3. 新增 migration/table/index 列表。
4. Provider / resolver / valuation 架构说明。
5. Backup v1->v2 兼容策略。
6. 新增/修改文件概览。
7. 实际运行的命令与结果。
8. V1 regression 结果。
9. 未完成项/已知限制。
10. 明确确认未实现 V2.1 和其他非目标。


---

# FILE: 02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md

# Talli V2.0 产品与工程 Brief

# 1. 产品目标

V1 已经能精确记录 CNY、USD、USDT、BTC、ETH 等原生数量，但用户无法快速回答：

> “按我选择的主法币，现在这些账户大概值多少钱？”

V2.0 增加 **Current Valuation**，但不把 Talli 变成交易终端或投资组合 P&L 工具。

# 2. 核心用户故事

## P0

- 用户选择 CNY/USD/EUR/HKD 等非归档 fiat asset 作为 Home Asset。
- Dashboard 继续显示原生余额，同时显示 `≈ Home Asset` 估值。
- Dashboard 可显示一个明确带 `≈` 的估算总资产。
- 用户能看到该总额是否完整、多少非零资产没有可用 quote。
- Crypto 价格来自 CoinGecko，fiat FX 来自 ECB reference rates。
- 用户可为 unsupported/custom asset 输入 manual exact-pair quote。
- 用户可手动刷新行情。
- stale/missing/provider error 时账本仍正常工作。
- API key 不暴露给客户端。
- V1 backup 可以在 V2 恢复。

## P1（V2.0 可做但不得压过 P0）

- Settings 中编辑/启停 provider mapping。
- 显示 quote provenance：provider、provider observation、last fetched。
- Provider health/status：configured / fresh / stale / error / cooldown。
- Manual quote 历史记录与停用。

# 3. 非目标

本轮不是：

- 实时交易行情 terminal。
- investment P&L tracker。
- tax/cost-basis engine。
- exchange/wallet sync。
- historical net worth。

# 4. UX 信息层级

每个资产先显示 V1 fact，再显示估值：

```text
BTC
0.00428137 BTC          <-- primary fact
≈ ¥1,242.78             <-- derived estimate
BTC/USD CoinGecko × USD/CNY ECB
```

总资产必须显示近似标记：

```text
估算总资产
≈ ¥18,426.37 CNY
8 / 9 个非零资产已估值
```

若不完整：

```text
≈ ¥17,183.59 CNY
估值不完整 · 1 个非零资产缺少价格
XYZ：未配置可用价格源
```

**缺失资产不能静默按 0 计入后仍宣称“完整总资产”。**

# 5. 网络容错

- SSR 首屏只读 Ledger + 本地 price cache，不等待外网。
- stale/missing 时页面渲染后再触发同源 refresh。
- refresh 失败：继续显示 V1 原生余额；若有 stale cache，可标记 stale 继续估值。
- 无 cache：该资产 valuation missing。

# 6. 估值一致性

V2.0 使用 USD bridge：

- Crypto quote 始终 CoinGecko -> USD。
- Fiat FX 始终 ECB reference rate。
- Crypto -> 非 USD Home = Crypto/USD × USD/Home。

好处：

- Crypto 与用户持有的 USD 都使用同一套 ECB FX 基准。
- Home Asset 切换不需要重新抓 Crypto quote。
- Provider 职责清晰，未来 V2.1 历史数据也容易复用。

# 7. 安全与隐私

Talli 仍是单用户自托管 App；V2 不引入账户认证。

CoinGecko API key：

- 仅环境变量。
- 仅 server runtime 读取。
- 不写 SQLite。
- 不写 backup。
- 不传给 client component。
- 错误日志中不得打印 request headers / 完整 URL query key。

# 8. 性能目标

个人账本规模下：

- Dashboard cache-only render 不应因行情服务变慢。
- 一次 CoinGecko refresh 批量获取所有 enabled Crypto mappings。
- 一次 ECB refresh 批量获取所需 fiat series。
- portfolio valuation 在内存中使用 Decimal 计算。


---

# FILE: 03_PRICE_VALUATION_DOMAIN_SPEC_CN.md

# Price & Valuation Domain Specification

# 1. 标准 Quote 语义

系统内所有标准 quote 统一定义：

> `1 BASE = rate QUOTE`

例如：

```text
BASE  = BTC
QUOTE = USD
rate  = 68123.456789
```

表示 `1 BTC = 68123.456789 USD`。

不得让不同 Provider 在 domain 内保留相反方向语义。

# 2. 价格不是账本金额

- Ledger quantity：精确事实，atomic bigint。
- Market/reference rate：衍生 decimal。
- Valuation：quantity × resolved rate 的临时结果。

Price refresh 不得：

- update account balance。
- insert ledger entry。
- insert balance snapshot。
- 改 Exchange 历史成交数量。

# 3. Home Asset

- 存在于 `book_valuation_settings`。
- 必须引用非归档 `assetType='fiat'` asset。
- Home Asset 只决定估值展示单位，不改变任何 Ledger fact。
- 若设置无效/缺失，V1 页面仍工作，只是不显示 portfolio valuation，并引导设置。

# 4. External provider mapping

`price_provider_mappings` 仅表示“某个 Talli asset 对应外部 Provider 的什么 key”。

禁止使用 symbol 自动猜测 CoinGecko identity。

示例：

```text
Talli BTC  -> CoinGecko id: bitcoin
Talli ETH  -> CoinGecko id: ethereum
Talli USD  -> ECB currency code: USD
```

# 5. V2.0 Provider 责任

## 5.1 CoinGecko

只生成：

```text
Crypto Talli Asset -> USD Talli Asset
```

例如 BTC/USD、ETH/USD、USDT/USD。

## 5.2 ECB

Provider-native observation 是：

```text
1 EUR = X fiat
```

缓存为标准 quote：

```text
EUR -> USD
EUR -> CNY
EUR -> HKD
```

EUR 本身使用 identity `EUR/EUR = 1`，不请求不存在的 EUR/EUR series。

## 5.3 Manual

Manual quote 是用户明确输入的 exact pair：

```text
BASE -> QUOTE
```

Active manual exact pair 是该 pair 的最高优先级 override。

# 6. Quote Resolution

目标：`resolve(baseAsset, homeAsset, at)`。

V2.0 current valuation 只解析当前 quote，不做历史回填。

## 6.1 Identity

若 `base.id == home.id`：

```text
rate = 1
status = identity
```

不读 cache，不发 HTTP。

## 6.2 Manual override

若存在 active exact pair `base -> home`：

- 使用 manual rate。
- provenance = manual。
- 不继续自动 provider resolution。

不做 reverse-pair 自动倒数；用户若换 Home Asset，需要对应 exact pair，或让自动 provider 处理。

## 6.3 Fiat -> Home Fiat

通过 ECB EUR legs：

若 base=EUR：

```text
EUR -> HOME = ECB(EUR -> HOME)
```

若 home=EUR：

```text
BASE -> EUR = 1 / ECB(EUR -> BASE)
```

否则：

```text
BASE -> HOME
= ECB(EUR -> HOME) / ECB(EUR -> BASE)
```

所有运算使用 Decimal。

## 6.4 Crypto -> Home Fiat

CoinGecko 给：

```text
CRYPTO -> USD = cryptoUsd
```

若 Home=USD：

```text
CRYPTO -> HOME = cryptoUsd
```

否则：

```text
CRYPTO -> HOME
= cryptoUsd × resolveFiat(USD -> HOME)
```

## 6.5 Custom

V2.0：

- active manual exact pair -> usable。
- 否则 missing。

不得自动把 custom code 当 fiat/crypto provider key。

# 7. Stablecoin 红线

以下逻辑禁止存在：

```text
if asset.code == USDT: rate = 1 USD
if asset.code == USDC: rate = 1 USD
```

USDT/USDC 必须通过 CoinGecko market quote，与 BTC/ETH/SOL 同路径。

# 8. Quote Resolution 状态

建议 domain 类型：

```text
identity
manual
fresh
stale
missing_mapping
missing_quote
provider_error
unsupported
```

组成 quote 时状态按最弱 leg 传播：

- 任一 required leg missing/error 且无 usable stale -> overall missing/error。
- 任一 leg stale、其余 usable -> overall stale。
- 所有 external legs fresh -> fresh。
- manual exact override -> manual。

# 9. Portfolio valuation

在同一个 `queryTime`：

1. 用现有 V1 balance engine 获取所有 active account balance。
2. 按 asset 聚合 native quantity atomic。
3. 对每个非零 asset resolve `asset -> home`。
4. quantity Decimal × resolved rate Decimal。
5. 每个 line 保留高精度 Decimal 文本。
6. 对所有 usable line 的 exact Decimal value 求和。
7. 最后 UI display 才按 Home Asset scale round。

# 10. Completeness

- 零余额 asset 即使无 mapping，也不影响 `isComplete`。
- 非零 asset 无 usable quote -> `isComplete=false`。
- 负余额正常估值并减少总值；不要根据 `accountType=credit/loan` 再翻转符号。
- archived account 不进入当前 dashboard valuation，与 V1 dashboard 规则一致。
- archived asset 的 active account 本应被 V1 过滤；V2 不应重新引入。

# 11. Rounding

推荐 Decimal context：precision >= 80。

禁止：

```text
round(each asset to 2dp) -> sum
```

要求：

```text
sum(exact per-asset Decimal) -> final display round to home.scale
```

# 12. Provenance

最终 resolved quote 应保存/返回 leg chain，而不是只有一个 rate：

```text
BTC -> USD : CoinGecko spot
USD -> CNY : ECB reference cross
```

UI 可显示：

```text
CoinGecko BTC/USD × ECB USD/CNY
```

这有助于诊断 stale/missing，也避免把 ECB reference rate 描述成实时成交汇率。


---

# FILE: 04_DATABASE_SCHEMA_V2_DRAFT.sql

```sql
-- Talli V2.0 additive schema design contract.
-- Codex should implement equivalent Drizzle schema + generated/reviewed migration.
-- Do NOT edit historical V1 migration files.

CREATE TABLE `book_valuation_settings` (
  `book_id` text PRIMARY KEY NOT NULL,
  `home_asset_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON DELETE cascade,
  FOREIGN KEY (`home_asset_id`) REFERENCES `assets`(`id`) ON DELETE restrict
);

CREATE INDEX `idx_book_valuation_home_asset`
  ON `book_valuation_settings` (`home_asset_id`);

CREATE TABLE `price_provider_mappings` (
  `asset_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_asset_key` text NOT NULL,
  `is_enabled` integer DEFAULT true NOT NULL,
  `priority` integer DEFAULT 100 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`asset_id`, `provider`),
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade,
  CONSTRAINT `price_provider_mapping_provider_check`
    CHECK (`provider` in ('coingecko', 'ecb')),
  CONSTRAINT `price_provider_mapping_enabled_check`
    CHECK (`is_enabled` in (0, 1)),
  CONSTRAINT `price_provider_mapping_key_nonempty_check`
    CHECK (length(`provider_asset_key`) > 0)
);

CREATE INDEX `idx_price_provider_mappings_provider_enabled`
  ON `price_provider_mappings` (`provider`, `is_enabled`, `priority`);

CREATE TABLE `manual_price_quotes` (
  `id` text PRIMARY KEY NOT NULL,
  `base_asset_id` text NOT NULL,
  `quote_asset_id` text NOT NULL,
  `rate_text` text NOT NULL,
  `observed_at` text NOT NULL,
  `note` text,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON DELETE restrict,
  FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON DELETE restrict,
  CONSTRAINT `manual_quote_distinct_assets_check`
    CHECK (`base_asset_id` <> `quote_asset_id`),
  CONSTRAINT `manual_quote_rate_nonempty_check`
    CHECK (length(`rate_text`) > 0),
  CONSTRAINT `manual_quote_active_check`
    CHECK (`is_active` in (0, 1))
);

CREATE UNIQUE INDEX `manual_price_quotes_one_active_pair`
  ON `manual_price_quotes` (`base_asset_id`, `quote_asset_id`)
  WHERE `is_active` = 1;

CREATE INDEX `idx_manual_price_quotes_pair_observed`
  ON `manual_price_quotes` (`base_asset_id`, `quote_asset_id`, `observed_at` DESC);

-- Derived/rebuildable provider cache. EXCLUDED from JSON backup.
CREATE TABLE `latest_price_quotes` (
  `base_asset_id` text NOT NULL,
  `quote_asset_id` text NOT NULL,
  `provider` text NOT NULL,
  `quote_kind` text NOT NULL,
  `rate_text` text NOT NULL,
  `provider_observed_at` text,
  `provider_observation_date` text,
  `fetched_at` text NOT NULL,
  `source_metadata_json` text,
  PRIMARY KEY (`base_asset_id`, `quote_asset_id`, `provider`),
  FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade,
  FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade,
  CONSTRAINT `latest_quote_distinct_assets_check`
    CHECK (`base_asset_id` <> `quote_asset_id`),
  CONSTRAINT `latest_quote_provider_check`
    CHECK (`provider` in ('coingecko', 'ecb')),
  CONSTRAINT `latest_quote_kind_check`
    CHECK (`quote_kind` in ('spot', 'reference')),
  CONSTRAINT `latest_quote_rate_nonempty_check`
    CHECK (length(`rate_text`) > 0),
  CONSTRAINT `latest_quote_observation_check`
    CHECK (`provider_observed_at` IS NOT NULL OR `provider_observation_date` IS NOT NULL)
);

CREATE INDEX `idx_latest_price_quotes_provider_fetched`
  ON `latest_price_quotes` (`provider`, `fetched_at` DESC);

-- Derived operational state. EXCLUDED from JSON backup.
CREATE TABLE `price_provider_state` (
  `provider` text PRIMARY KEY NOT NULL,
  `last_attempt_at` text,
  `last_success_at` text,
  `last_error_code` text,
  `last_error_message` text,
  `cooldown_until` text,
  `updated_at` text NOT NULL,
  CONSTRAINT `price_provider_state_provider_check`
    CHECK (`provider` in ('coingecko', 'ecb'))
);

-- Application/query boundaries MUST additionally validate:
-- 1. rate_text is positive plain decimal text; no exponent, sign, NaN, Infinity.
-- 2. all timestamps are canonical UTC ISO strings.
-- 3. provider_observation_date is YYYY-MM-DD when present.
-- 4. home_asset_id references a non-archived fiat asset at service boundary.
```


---

# FILE: 05_TYPES_AND_SERVICE_CONTRACTS.ts

```ts
// Design contract for Talli V2.0. Codex may split files but must preserve semantics.

export type PriceProviderId = "coingecko" | "ecb";
export type ExternalQuoteKind = "spot" | "reference";
export type QuoteStatus =
  | "identity"
  | "manual"
  | "fresh"
  | "stale"
  | "missing_mapping"
  | "missing_quote"
  | "provider_error"
  | "unsupported";

// Runtime implementation should validate this as positive plain decimal text.
export type DecimalText = string;

export interface ProviderMapping {
  assetId: string;
  provider: PriceProviderId;
  providerAssetKey: string;
  isEnabled: boolean;
  priority: number;
}

export interface ProviderQuote {
  baseAssetId: string;
  quoteAssetId: string;
  provider: PriceProviderId;
  kind: ExternalQuoteKind;
  rateText: DecimalText;
  providerObservedAt: string | null;
  providerObservationDate: string | null;
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface ManualQuote {
  id: string;
  baseAssetId: string;
  quoteAssetId: string;
  rateText: DecimalText;
  observedAt: string;
  note: string | null;
  isActive: boolean;
}

export interface QuoteLeg {
  baseAssetId: string;
  quoteAssetId: string;
  rateText: DecimalText;
  source: "identity" | "manual" | PriceProviderId;
  status: "identity" | "manual" | "fresh" | "stale";
  label: string;
  providerObservedAt?: string | null;
  providerObservationDate?: string | null;
  fetchedAt?: string | null;
}

export type QuoteResolution =
  | {
      ok: true;
      status: "identity" | "manual" | "fresh" | "stale";
      baseAssetId: string;
      quoteAssetId: string;
      rateText: DecimalText;
      legs: QuoteLeg[];
    }
  | {
      ok: false;
      status:
        | "missing_mapping"
        | "missing_quote"
        | "provider_error"
        | "unsupported";
      baseAssetId: string;
      quoteAssetId: string;
      message: string;
      staleLegs?: QuoteLeg[];
    };

export interface ProviderRefreshState {
  provider: PriceProviderId;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  cooldownUntil: string | null;
}

export interface AssetValuationLine {
  assetId: string;
  quantityAtomic: string;
  quantityDisplay: string;
  resolution: QuoteResolution;
  // Exact Decimal text; null when quote unavailable.
  valueText: DecimalText | null;
  valueDisplay: string | null;
}

export interface PortfolioValuationView {
  queryTime: string;
  homeAssetId: string;
  homeAssetCode: string;
  totalValueText: DecimalText;
  totalValueDisplay: string;
  isComplete: boolean;
  valuedNonZeroAssetCount: number;
  missingNonZeroAssetCount: number;
  lines: AssetValuationLine[];
}

export interface PriceHttpTransport {
  get(input: {
    url: URL;
    headers?: Record<string, string>;
    timeoutMs: number;
  }): Promise<{
    status: number;
    headers: Headers;
    text: string;
  }>;
}

// Provider adapter contracts: no Ledger/Account/Dashboard dependencies.
export interface CoinGeckoPriceProvider {
  fetchCryptoUsdQuotes(input: {
    mappings: ProviderMapping[];
    usdAssetId: string;
    fetchedAt: string;
  }): Promise<ProviderQuote[]>;
}

export interface EcbPriceProvider {
  fetchEurReferenceQuotes(input: {
    mappings: ProviderMapping[];
    eurAssetId: string;
    fetchedAt: string;
  }): Promise<ProviderQuote[]>;
}

export interface PriceRefreshService {
  refreshCurrent(input?: {
    force?: boolean;
    providers?: PriceProviderId[];
  }): Promise<{
    refreshed: PriceProviderId[];
    skipped: PriceProviderId[];
    failed: Array<{ provider: PriceProviderId; code: string; message: string }>;
  }>;
}

// Pure/cache-only: MUST NOT perform HTTP.
export interface QuoteResolver {
  resolve(input: {
    baseAssetId: string;
    homeAssetId: string;
    queryTime: string;
  }): QuoteResolution;
}

// Pure/cache-only with respect to market data: MUST NOT perform HTTP.
export interface PortfolioValuationService {
  current(input: {
    bookId: string;
    queryTime: string;
  }): PortfolioValuationView | null;
}
```


---

# FILE: 06_PROVIDER_IMPLEMENTATION_SPEC_CN.md

# Provider Implementation Specification

# 1. CoinGeckoProvider

## 1.1 Base URL / auth

V2.0 支持：

```text
COINGECKO_MODE=demo
COINGECKO_API_KEY=...
```

Demo：

```text
https://api.coingecko.com/api/v3
Header: x-cg-demo-api-key: <server-only key>
```

开发时可显式：

```text
COINGECKO_MODE=keyless
```

Keyless 仍使用 `https://api.coingecko.com/api/v3`，但不发送 API key。

禁止自动 fallback：如果配置了 demo key 但认证失败，不要悄悄切 keyless；返回清楚 provider error。

## 1.2 Endpoint

仅用 current Simple Price：

```text
GET /simple/price
ids=<comma-separated CoinGecko IDs>
vs_currencies=usd
include_last_updated_at=true
precision=full
```

一次 request 批量抓所有 enabled CoinGecko mappings。

## 1.3 Seed mapping

```text
USDT -> tether
USDC -> usd-coin
BTC  -> bitcoin
ETH  -> ethereum
SOL  -> solana
```

CoinGecko identity 必须使用 `provider_asset_key`，不使用 symbol/name 自动猜。

## 1.4 Response validation

- 必须确认每个 requested ID 的 `usd` 存在且 > 0。
- `last_updated_at` 存在时转 canonical UTC；缺失时 adapter 可使用 fetchedAt 作为 metadata fallback，但应标记 source metadata。
- 不允许 NaN/Infinity/0/negative。
- 外部 JSON 数字若经 `JSON.parse` 成 JS number，只允许 adapter 立即 `String(raw)` -> Decimal normalization；不得用 number 参与算术。
- 最终持久化 `rate_text` 为 positive plain decimal string。

## 1.5 HTTP failure

- timeout：默认 8s。
- 401/403：`AUTH_ERROR`。
- 429：`RATE_LIMITED`，读取 `Retry-After`（若有），否则至少 cooldown 60s。
- 5xx：`UPSTREAM_ERROR`。
- malformed JSON / missing field：`UPSTREAM_PAYLOAD_INVALID`。
- 失败不得清除旧 cache。

## 1.6 Attribution

Settings/About 或估值数据源附近必须显示：

```text
Crypto market data provided by CoinGecko
```

并链接到 CoinGecko 网站；不要把 attribution 藏在开发文档里。

# 2. ECBProvider

## 2.1 角色

ECB 只提供 reference rates，不把它描述为实时成交汇率。

Provider-native语义：

```text
1 EUR = OBS_VALUE CURRENCY
```

## 2.2 API

Base：

```text
https://data-api.ecb.europa.eu/service/
```

Dataflow：`EXR`。

Series key：

```text
D.<CURRENCY+...>.EUR.SP00.A
```

建议当前请求：

```text
GET /data/EXR/D.CNY+HKD+USD.EUR.SP00.A
  ?lastNObservations=1
  &format=csvdata
  &detail=dataonly
```

实际 CURRENCY 列表必须来自 enabled ECB mappings，去重、排序；EUR 不发 series request，内部 identity=1。

## 2.3 CSV parsing

- 不按固定列位置解析；按 header 名读取。
- 至少读取 `CURRENCY`, `TIME_PERIOD`, `OBS_VALUE`。
- 使用健壮 CSV parser（推荐 `csv-parse/sync` 或等价成熟库），避免自己写脆弱 split(',')。
- 对每个 currency 只接受 requested series 的最新 observation。
- `TIME_PERIOD` 保存为 `provider_observation_date`。
- `OBS_VALUE` normalize 为 positive decimal text。

## 2.4 Cache

持久化为标准 source quote：

```text
EUR -> USD
EUR -> CNY
EUR -> HKD
```

`quote_kind=reference`。

EUR/EUR=1 是 identity，不写 `latest_price_quotes`。

## 2.5 Cross rate

不在 ECB adapter 内做任意 base/home cross；adapter 只存 provider-native EUR legs。

QuoteResolver 使用 Decimal：

```text
USD -> CNY = (EUR -> CNY) / (EUR -> USD)
CNY -> USD = (EUR -> USD) / (EUR -> CNY)
USD -> EUR = 1 / (EUR -> USD)
EUR -> CNY = direct source leg
```

# 3. ManualPriceService

- 用户输入 exact `base -> quote`。
- rate > 0 plain decimal。
- base != quote；identity 不需要 manual。
- 创建新 active quote 时，在同一 DB transaction 中停用该 pair 旧 active quote，再插入新 quote。
- active manual exact pair 总是覆盖 automatic providers。
- 删除可实现为停用，不必物理删除历史。
- manual quote 是用户事实/配置，进入 Backup v2。

# 4. Provider Mapping Service

Service 必须验证：

- CoinGecko mapping 只能用于 `assetType=crypto`（V2.0）。
- ECB mapping 只能用于 `assetType=fiat`。
- key 非空、长度有限。
- archived asset mapping 可保留用于历史/恢复，但 current refresh 可跳过无 active non-zero balance 的资产；P0 可以简单刷新所有 enabled seed mappings。

# 5. HTTP / logging security

- API key header 不得出现在 application log。
- 记录 URL 时不得拼接 query key。
- error message 对 UI 可显示 provider/status，但不要回显 response headers 全文。
- 所有 fetch 都从 server-only module 发出；对 provider module 增加 `server-only` 防护或等价边界。


---

# FILE: 07_CACHE_AND_VALUATION_STATE_MACHINE_CN.md

# Cache / Refresh / Valuation State Machine

# 1. 默认时间常量

V2.0 先用代码常量，不做复杂用户配置：

```text
CoinGecko fresh TTL          10 minutes
CoinGecko stale usable       24 hours since last successful fetch
ECB refresh TTL               6 hours
ECB stale usable              7 days since last successful fetch
Manual refresh min cooldown  60 seconds/provider
HTTP timeout                  8 seconds CoinGecko; 10 seconds ECB
```

这些是 Talli 策略，不是 Provider SLA；代码应集中定义，便于以后调整。

# 2. fetchedAt 与 observation

- `fetched_at`：Talli 成功获取并保存该 quote 的时间，用于 refresh TTL/stale fallback。
- CoinGecko `provider_observed_at`：使用 `last_updated_at`。
- ECB `provider_observation_date`：使用 `TIME_PERIOD`。

ECB 周末/节假日可能返回较旧 observation date，但如果 Talli 刚成功确认“这仍是最新 official reference”，cache 可以是 fresh；UI 仍应展示真实 observation date。

# 3. SSR / 首屏

**禁止 SSR 直接 await 外网 provider。**

Dashboard server render：

1. 读取 V1 balances。
2. 读取 Home Asset + manual quote + local cache。
3. 计算 cache-only valuation。
4. 立即 render。
5. 若 missing/stale/provider due，client 在 hydration 后调用 same-origin refresh endpoint/action。
6. refresh 完成后 `router.refresh()` 或等价 revalidation。

# 4. Refresh decision

Auto refresh：

- provider cache missing -> refresh due。
- latest successful fetch 超 TTL -> refresh due。
- provider 正在 cooldown -> skip。
- provider in-flight -> dedupe/skip。

Manual `force=true`：

- 可绕过 fresh TTL。
- 不绕过 60s minimum cooldown / upstream Retry-After cooldown。

# 5. Refresh transaction pattern

禁止：

```text
BEGIN IMMEDIATE
  -> fetch external API
  -> wait seconds
COMMIT
```

要求：

```text
short tx: record attempt/cooldown claim
COMMIT

HTTP outside tx

short tx: upsert quotes + state success/error
COMMIT
```

# 6. Failure behavior

## 有 usable stale quote

```text
status = stale
继续显示估值
UI 标明 stale / 上次成功时间
后台 refresh 失败不破坏页面
```

## 无 usable quote

```text
status = provider_error or missing_quote
该非零资产不计入 complete total
isComplete = false
```

禁止：

- rate=0 fallback。
- stablecoin=1 fallback。
- provider failure 时 delete previous success cache。

# 7. QuoteResolver 只读缓存

Resolver 输入：

- assets。
- external mappings。
- manual active exact-pair。
- latest cache。
- provider state / policy clock。

Resolver 不发 HTTP。

# 8. Fresh/Stale 传播

组合 quote：

```text
BTC/USD fresh × USD/CNY stale -> overall stale
BTC/USD fresh × USD/CNY fresh -> overall fresh
manual BTC/CNY -> manual（不需要自动 legs）
```

若 required leg 超 stale usable window：视为 unusable missing/provider_error，不再参与估值。

# 9. Valuation snapshot consistency

一次 Dashboard 请求必须捕获一个 `queryTime`：

```text
queryTime = now ISO once
```

所有 V1 account balance 都以同一 queryTime 查询，然后使用同一份 local quote cache snapshot 估值。

不要在循环中多次 `new Date()` 造成账户余额和 quote freshness 边界不一致。

# 10. Decimal algorithm

quantity：

```text
atomic / 10^asset.scale
```

不要先转 JS number；直接：

```text
Decimal(atomicText).div(Decimal(10).pow(scale))
```

line value：

```text
quantityDecimal.mul(rateDecimal)
```

portfolio：

```text
Decimal.sum(all usable exact line values)
```

最终 display：Home Asset scale，明确 `≈`。

# 11. Total semantics

返回：

- `totalValueText`：所有 usable nonzero line 的 exact high-precision sum 文本。
- `totalValueDisplay`：rounded display。
- `isComplete`。
- `valuedNonZeroAssetCount`。
- `missingNonZeroAssetCount`。

如果 incomplete，UI 必须称为“已估值部分 / 估算总资产（不完整）”，不得暗示缺失资产值为 0。


---

# FILE: 08_BACKUP_V2_MIGRATION_SPEC_CN.md

# Backup V2 & V1 Compatibility Specification

# 1. 目标

V2 不能让用户已有 V1 JSON backup 失效。

当前 V1 backup `schemaVersion=1`；V2 export 应升级为：

```text
schemaVersion = 2
```

# 2. V2 Backup 必须包含

在 V1 `data` 基础上新增：

```text
bookValuationSettings
priceProviderMappings
manualPriceQuotes
```

这些是用户配置/事实，必须无损备份。

# 3. V2 Backup 明确排除

```text
latestPriceQuotes
priceProviderState
```

原因：它们是外部 provider 可重建 cache/operational state，不是用户账本或配置事实。

API key 也绝不进入 backup。

# 4. Restore 兼容两种输入

```text
schemaVersion=1  -> in-memory upgrade -> validated V2 restore model
schemaVersion=2  -> native V2 validation
```

不要用“先把 V1 JSON 写进 DB，再补救”的方式绕过验证。

# 5. V1 -> V2 in-memory upgrade

V1 数据完整保留；新增字段默认：

```text
bookValuationSettings: []
manualPriceQuotes: []
priceProviderMappings: inferred canonical seed mappings where safe
```

Mapping inference 仅对明确匹配的资产做：

- asset type 与 expected type 相符。
- code case-insensitive 等于 canonical seed code。

若不满足，不猜。

Home Asset：

- 若 default book 存在，优先寻找 non-archived fiat `CNY`。
- 否则 non-archived fiat `USD`。
- 否则按 `(sortOrder, code)` 的第一个 non-archived fiat。
- 若没有 fiat，则不创建 setting；V2 UI 显示“先选择 Home Asset”。

# 6. Restore target

V2 仍保持 V1 原则：

- 仅 empty 或 unchanged seed-only target。
- 不做 merge。
- preview 先全量 validate。
- commit 使用 `BEGIN IMMEDIATE`。
- foreign_key_check。
- row counts / key relations 校验。
- 中途失败完整 rollback。

`clearRestoreTarget()` 必须按 FK 顺序处理 V2 表：

```text
latest_price_quotes          (derived)
price_provider_state         (derived)
manual_price_quotes
price_provider_mappings
book_valuation_settings
... then V1 rows in existing safe order
```

# 7. Seed-only 判定升级

V2 seed-only DB 会多出：

- seed valuation setting（通常 Default Book -> CNY）。
- canonical price provider mappings。
- `seed_schema_version=2`。

Restore target detector 必须识别新的 V2 seed-only 形态，同时不要误把用户改过 Home Asset/mapping 的 DB 当 seed-only。

# 8. Backup validation

V2 新增验证：

- Home asset 属于存在的 book/asset。
- Home asset 必须 fiat；若 archived 可允许 restore 历史配置但 app 启动时要求修复，推荐直接在 backup validation 阻止 active setting 指向 archived asset。
- Provider mapping asset 存在，provider/key 合法。
- CoinGecko mapping assetType=crypto。
- ECB mapping assetType=fiat。
- manual quote pair asset 存在、base != quote、rate positive decimal。
- 每 pair 最多一个 active manual quote。

# 9. 必须测试

- V2 export 中 atomic ledger strings 一字不变。
- V2 export 不含 cache/provider state/API key。
- V1 fixture backup 可以 restore 到空 V2 DB。
- V1 restore 后原 V1 balances/events/snapshots 与 fixture 一致。
- V2 config round-trip exact。
- corrupted V2 config 在任何 write 前拒绝。
- mid-restore failure rollback V1 + V2 所有表。


---

# FILE: 09_UI_UX_SPEC_CN.md

# V2.0 UI / UX Specification

# 1. Dashboard

保留现有 V1 Native Quantities 信息架构，增加估值层。

## 1.1 顶部估值卡

Home configured 且至少可以计算 identity/quote 时：

```text
估算总资产
≈ ¥18,426.37 CNY
8 / 9 个非零资产已估值
价格更新：2 分钟前
[刷新价格]
```

若完整：

```text
估值完整
```

若不完整：

```text
估值不完整 · 1 个非零资产缺少价格
查看缺失项
```

Home 未配置：

```text
尚未设置估值币种
选择 Home Asset 后可查看近似总资产
[前往估值设置]
```

## 1.2 每资产 group

```text
BTC
0.00428137 BTC
≈ ¥1,242.78 CNY
BTC/USD · CoinGecko
USD/CNY · ECB reference
```

Native amount 字号/层级高于 valuation。

## 1.3 状态 badge

- `实时/新鲜`（fresh）
- `已过期`（stale）
- `手动价格`（manual）
- `缺少映射`
- `价格不可用`

不要只靠颜色表达状态。

# 2. Settings → Valuation

建议新增 section：

```text
估值与价格
├─ Home Asset
├─ Data sources
├─ Asset mappings
├─ Manual quotes
└─ Provider status
```

## 2.1 Home Asset

下拉仅列 non-archived fiat assets。

修改 Home Asset：

- 不修改 Ledger。
- 保存后清晰说明“只影响估值显示”。
- 不必删除旧 cache；resolver 自动使用新 Home。

## 2.2 Provider status

CoinGecko：

```text
CoinGecko
Demo key: 已配置 / 未配置
最近成功：...
最近错误：...
Cooldown：...
```

**永远不显示 key 内容。**

ECB：

```text
ECB reference rates
最近成功：...
最新 observation：...
```

## 2.3 Provider mappings

列表：

```text
BTC   CoinGecko   bitcoin    enabled
ETH   CoinGecko   ethereum   enabled
USD   ECB         USD        enabled
```

允许编辑 `provider_asset_key` 和 enabled。

V2.0 不提供 symbol 自动搜索/自动猜 ID。

## 2.4 Manual quote

表单：

```text
Base asset
Quote asset
Rate: 1 BASE = [rate] QUOTE
Observed at
Note
[保存并启用]
```

明确提示：

```text
Active manual quote 会覆盖该 exact pair 的自动价格源。
```

可停用。

# 3. Refresh UX

首次页面 render 不显示全屏 loading 等待外网。

若 due：

```text
正在后台刷新价格…
```

刷新成功后局部/页面 revalidate。

按钮 cooldown 时：

```text
刚刚已请求，请稍后再刷新
```

# 4. Incomplete valuation detail

可展开：

```text
未估值
XYZ 123.45 XYZ · 没有 active manual quote
ABC 2.0 ABC · CoinGecko mapping missing
```

零余额资产不要出现在 missing list。

# 5. Provider wording

CoinGecko：

```text
market price / 市场价格
```

ECB：

```text
reference rate / 参考汇率
```

禁止把 ECB reference rate 写成“实时汇率/成交汇率”。

# 6. Attribution

UI 可在 Settings → Valuation 或页面底部加入：

```text
Crypto market data provided by CoinGecko
```

带正常链接。

# 7. Accessibility / mobile

继承 V1：

- keyboard focus。
- 不靠颜色单独表达 stale/missing。
- mobile 无横向溢出。
- rate/provenance 可换行。
- `≈` 与 Home code 在屏幕阅读器可理解的 label 中体现“估算”。


---

# FILE: 10_TEST_ACCEPTANCE_CN.md

# Talli V2.0 Test & Acceptance Matrix

只有本文件核心红线全部通过，才算 V2.0 完成。

# 1. V1 Regression Gate

所有现有 V1 tests 必须继续通过。

尤其：

- Money atomic precision。
- Transfer/Exchange invariants。
- third-asset fee。
- snapshot balance matrix。
- reports exclude principal。
- backup V1 facts。
- desktop/mobile E2E。

# 2. Price Decimal Unit Tests

## P-001

接受：

```text
1
0.9998
68123.456789
0.000000000000000001
```

拒绝：

```text
0
-1
1e-8
NaN
Infinity
空串
逗号数字
```

## P-002

Decimal normalization round-trip，不经 JS number 算术。

# 3. Quote Resolution Unit Tests

## Q-001 Identity

Home=CNY, base=CNY -> rate=1，不请求/不依赖 cache。

## Q-002 ECB direct

EUR->CNY 使用 EUR/CNY source leg。

## Q-003 ECB cross

给：

```text
EUR/USD = 1.10
EUR/CNY = 7.70
```

应：

```text
USD/CNY = 7.0
```

## Q-004 ECB inverse

USD->EUR = `1 / 1.10`，Decimal 精度正确。

## Q-005 Crypto via USD

给：

```text
BTC/USD = 68000 CoinGecko
USD/CNY = 7 ECB
```

应：

```text
BTC/CNY = 476000
```

provenance 保留两个 legs。

## Q-006 Manual override

存在 active manual BTC/CNY 时，不使用自动 BTC/USD/ECB legs。

## Q-007 Stablecoin redline

USDT/USD CoinGecko fixture = `0.9972`，resolver 必须输出 0.9972 路径，不得变成 1。

## Q-008 Custom

Custom asset 无 manual exact pair -> unsupported/missing。

# 4. Valuation Unit Tests

## V-001

1000.00 CNY -> Home CNY exactly 1000，不需要 external quote。

## V-002

BTC atomic/scale 计算不经 number。

## V-003

负 USD balance 经 FX 后为负估值，并减少 portfolio sum。

## V-004

零余额且 mapping missing 不影响 `isComplete`。

## V-005

非零 asset quote missing -> `isComplete=false`、missing count +1。

## V-006 Rounding drift

构造多个 line，使“逐项 2dp 后求和”与“精确求和后 2dp”不同；必须得到后者。

# 5. CoinGecko Adapter Tests（mock HTTP）

- Batch IDs 正确、`vs_currencies=usd`。
- 使用 provider IDs，不使用 symbol。
- Demo mode header `x-cg-demo-api-key` 正确。
- keyless 不发送 key header。
- 401/403 -> AUTH_ERROR。
- 429 + Retry-After -> cooldown。
- 500 -> UPSTREAM_ERROR。
- malformed/missing quote -> payload invalid。
- 一次失败不删除已有 cache。
- 所有 fixture tests 禁止真实网络。

# 6. ECB Adapter Tests（mock HTTP）

- series key 使用 `D.<OR currencies>.EUR.SP00.A`。
- `lastNObservations=1`。
- CSV 按 header parse，不依赖列序。
- EUR 不请求 series，identity=1。
- observation date 保存。
- invalid OBS_VALUE 拒绝。
- 周末返回上个工作日 observation 时仍可被视为最新 fetched official reference。

# 7. Cache State Tests

## C-001 fresh

10min 内 CoinGecko cache -> 不 auto refresh。

## C-002 stale but usable

超 fresh TTL 但 <24h -> render stale + refresh due。

## C-003 unusable

>24h 且 refresh failure -> missing/provider_error，不继续完整估值。

## C-004 ECB

6h refresh TTL，7d stale usable。

## C-005 manual refresh cooldown

force 不能绕过 60s cooldown / Retry-After。

## C-006 no external call in DB transaction

用 test transport/assertion 验证 provider fetch 发生时没有 active SQLite write transaction（可通过架构/spy 间接验证）。

# 8. DB Migration Integration Tests

- 从 V1 baseline schema migration 到 V2 成功。
- V1 tables/rows 保持。
- 新表存在、FK 开启、WAL 仍开启。
- migration idempotent through Drizzle migrator。
- 不修改历史 migration 文件。

建议 migration test：先按 V1 migration 创建 fixture DB，写入 V1 account/event/snapshot，记录 backup/balance，再应用 V2 migration，结果完全一致。

# 9. Ledger Isolation Tests

## L-001

价格刷新前后：

```text
ledger_events count unchanged
ledger_entries rows unchanged
balance_snapshots rows unchanged
current balances unchanged
```

## L-002

删除 `latest_price_quotes` + `price_provider_state` 后，同样完全不影响 V1 ledger/balance。

# 10. Backup Tests

## B2-001

V2 export `schemaVersion=2`。

## B2-002

包含 valuation settings/mappings/manual quotes。

## B2-003

明确不包含 latest cache/provider state/API key。

## B2-004

V1 `schemaVersion=1` fixture 可恢复到 V2 空 DB，V1 facts/balances 完整。

## B2-005

V2 backup round-trip config exact。

## B2-006

corrupt manual rate/mapping/home asset 在任何 write 前拒绝。

## B2-007

mid-transaction restore error 整库 rollback。

# 11. E2E

至少覆盖 desktop Chromium + mobile WebKit：

1. V1 native dashboard 仍工作。
2. Settings 设置 Home=CNY。
3. 使用 deterministic fake provider/cache fixture（不要 live API）显示 BTC 估值。
4. 显示 estimated total `≈`。
5. USDT fixture 0.9972，不显示固定 1。
6. provider missing 时显示 incomplete，不按 0 静默处理。
7. manual quote 创建后覆盖 exact pair，停用后恢复 automatic path。
8. refresh button 有 pending/cooldown UX。
9. mobile 无横向溢出。
10. CoinGecko attribution 可见。

# 12. Security Acceptance

- client bundle/source 不引用 `COINGECKO_API_KEY` value。
- HTML 不出现 key。
- backup 不出现 key。
- SQLite 不出现 key。
- provider error UI 不回显 header/key。

# 13. Build Gate

必须实际运行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

# 14. Definition of Done

- [ ] V1 regression 全绿。
- [ ] V2 additive schema/migration 完成。
- [ ] Home Asset 完成。
- [ ] CoinGecko current Crypto/USD 完成。
- [ ] ECB reference/cross FX 完成。
- [ ] Manual override 完成。
- [ ] cache/fresh/stale/error state 完成。
- [ ] SSR 不等待外网。
- [ ] portfolio valuation + incomplete semantics 完成。
- [ ] API key server-only。
- [ ] Backup v2 + V1 restore compatibility 完成。
- [ ] Dashboard/Settings UI 完成。
- [ ] Attribution 完成。
- [ ] 未实现 V2.1/non-goals。


---

# FILE: 11_IMPLEMENTATION_PLAN_CN.md

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


---

# FILE: 12_NON_GOALS_AND_V21_BOUNDARY_CN.md

# V2.0 Non-goals & V2.1 Boundary

# 1. V2.0 禁止项

## 1.1 Historical valuation

禁止：

- historical_price_quotes runtime table（可写设计 TODO，但不实现）。
- daily net worth chart。
- transaction-date market conversion。
- historical CoinGecko backfill。
- historical ECB backfill。

## 1.2 Background collectors

禁止：

- cron price collector。
- worker queue。
- Redis。
- message bus。
- WebSocket market stream。

V2.0 只做 on-demand + cache。

## 1.3 Investment accounting

禁止：

- cost basis。
- realized/unrealized P&L。
- tax lots。
- FIFO/LIFO。
- ROI。

## 1.4 External account sync

禁止：

- Coinbase/Kraken/Binance balances。
- exchange API secrets。
- wallet address scan。
- chain RPC。
- transaction import。

## 1.5 Stablecoin shortcut

禁止：

```text
USDT = USD
USDC = USD
```

## 1.6 New market domains

V2.0 不自动接：

- stock。
- ETF。
- gold。
- fund。
- airline miles。

Custom asset 可通过 manual exact quote 估值。

# 2. V2.1 预留方向

V2.1 才考虑：

```text
historical_price_quotes
lazy historical backfill
historical net worth
selected-date portfolio valuation
```

推荐仍保持：

- CoinGecko Crypto/USD historical。
- ECB historical fiat FX。
- manual historical observations。
- lazy backfill，不从 V2.0 开始每日 cron。

# 3. V2.1 兼容要求

V2.0 的 source quote 结构、provider mappings、Home Asset、manual quote history 应足以让 V2.1 additive 扩展，不需要改 V1 Ledger。

# 4. 更后续版本

V3 才讨论：exchange/wallet read-only sync。

P&L/cost basis 应作为独立产品边界另行设计，不要因“已有价格”就在 V2 顺手实现。


---

# FILE: 13_SEED_PROVIDER_MAPPINGS.json

```json
{
  "schemaVersion": 2,
  "note": "V2 valuation seed definitions only. Match by canonical Talli asset code/type; do not guess unknown assets by symbol.",
  "defaultHomeAsset": {
    "bookId": "seed-book-default",
    "assetCode": "CNY"
  },
  "providerMappings": [
    {
      "assetCode": "CNY",
      "expectedAssetType": "fiat",
      "provider": "ecb",
      "providerAssetKey": "CNY",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "USD",
      "expectedAssetType": "fiat",
      "provider": "ecb",
      "providerAssetKey": "USD",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "EUR",
      "expectedAssetType": "fiat",
      "provider": "ecb",
      "providerAssetKey": "EUR",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "HKD",
      "expectedAssetType": "fiat",
      "provider": "ecb",
      "providerAssetKey": "HKD",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "USDT",
      "expectedAssetType": "crypto",
      "provider": "coingecko",
      "providerAssetKey": "tether",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "USDC",
      "expectedAssetType": "crypto",
      "provider": "coingecko",
      "providerAssetKey": "usd-coin",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "BTC",
      "expectedAssetType": "crypto",
      "provider": "coingecko",
      "providerAssetKey": "bitcoin",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "ETH",
      "expectedAssetType": "crypto",
      "provider": "coingecko",
      "providerAssetKey": "ethereum",
      "priority": 100,
      "isEnabled": true
    },
    {
      "assetCode": "SOL",
      "expectedAssetType": "crypto",
      "provider": "coingecko",
      "providerAssetKey": "solana",
      "priority": 100,
      "isEnabled": true
    }
  ]
}
```


---

# FILE: 14_EXTERNAL_API_REFERENCE_20260808_CN.md

# External API Reference Snapshot — 2026-08-08

本文件是 Codex 实现 V2.0 时的外部 API 事实快照。Provider 行为可能未来变化；实现应有 adapters/tests，不要把网页文案散落进领域层。

# 1. CoinGecko

## 1.1 Demo / Keyless

Official docs:

- Setting up API key: https://docs.coingecko.com/docs/setting-up-your-api-key
- Keyless Public API: https://docs.coingecko.com/docs/keyless-public-api
- Simple Price: https://docs.coingecko.com/reference/simple-price
- Pricing: https://www.coingecko.com/en/api/pricing

截至本任务包冻结时：

- Demo root: `https://api.coingecko.com/api/v3/`
- Demo key 可使用 header `x-cg-demo-api-key`。
- Keyless aggregated market API 同样使用 `https://api.coingecko.com/api/v3`，不发送 auth header。
- Demo plan 页面列出 10,000 call credits/month、100 requests/minute、data freshness from ~60 seconds；这是外部 plan 信息，不要写成不可变业务常量。
- Demo attribution required。

## 1.2 Simple Price

Endpoint:

```text
GET /simple/price
```

支持：

- `ids`：CoinGecko unique API IDs。
- `vs_currencies`：逗号分隔 target currencies。
- `include_last_updated_at=true`。
- `precision=full`。

官方提醒 `ids` lookup 优先级高于 names/symbols；本项目固定使用 IDs，避免 symbol collisions。

Talli V2.0 固定 `vs_currencies=usd`，然后由 ECB 做 USD->Home FX。

# 2. ECB Data Portal

Official docs:

- API data: https://data.ecb.europa.eu/help/api/data
- Data examples: https://data.ecb.europa.eu/help/api/data-examples
- Exchange-rate methodology: https://data.ecb.europa.eu/methodology/exchange-rates
- ECB reference rates: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html

API root:

```text
https://data-api.ecb.europa.eu/service/
```

EXR daily reference key shape:

```text
D.USD.EUR.SP00.A
```

OR operator：

```text
D.USD+JPY.EUR.SP00.A
```

Current Talli query pattern：

```text
/data/EXR/D.CNY+HKD+USD.EUR.SP00.A
?lastNObservations=1
&format=csvdata
&detail=dataonly
```

CSV 可按 header `CURRENCY`, `TIME_PERIOD`, `OBS_VALUE` 解析。

ECB 官方说明 reference rates 通常在工作日约 16:00 CET 更新，仅供信息用途，不建议用作实际交易成交汇率。因此 Talli UI 应明确写 `ECB reference rate`。

# 3. Talli 策略 vs Provider 事实

以下是 Talli 自己的产品策略，不是 provider 保证：

```text
CoinGecko fresh TTL = 10min
CoinGecko stale usable = 24h
ECB refresh TTL = 6h
ECB stale usable = 7d
manual refresh min cooldown = 60s
```

若未来 Provider plan/rate limit 改变，只调整 adapter/policy，不改变 Ledger/Valuation domain 语义。


---

# FILE: CODEX_HANDOFF_PROMPT.txt

```text
你正在处理私有仓库 wentAInx/Talli。请把附件中的 Talli V2.0 Price & Valuation Engine 工程任务包视为本轮最高优先级实现规范。

V1 frozen baseline commit: 9345d8516aaa78495e408d53bb74e03f2f5eaa57

先严格按 00_README_CN.md 的顺序完整阅读任务包，再检查当前仓库和 HEAD。若 HEAD 不是该 baseline 或用户明确批准的 descendant，不要擅自 reset，先报告。

本轮只实现 V2.0 Current Price & Valuation Foundation：Home Asset、CoinGecko Crypto/USD、ECB fiat reference/cross FX、manual exact-pair override、provider mapping、current cache/fresh-stale-error state、Quote Resolver、current Portfolio Valuation、Dashboard/Settings UI、Backup v2 + V1 backup compatibility。

V1 Ledger 语义冻结。禁止改写 ledger entries/snapshots，禁止 USDT/USDC=USD 固定假设，禁止 historical valuation、cron、WebSocket、P&L、cost basis、交易所/钱包同步。

默认测试不得调用真实外网；Provider 使用 injectable HTTP + fixtures。API key 必须 server-only。SSR 打开账本不得等待外部行情。

实现完成后，实际运行并报告 format:check、lint、typecheck、db:check、unit、integration、build、e2e；不得伪造结果。不要 push 或 deploy，除非我另行明确要求。
```
