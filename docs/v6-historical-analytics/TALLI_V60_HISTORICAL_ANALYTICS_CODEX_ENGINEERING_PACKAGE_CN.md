# TALLI V6.0 HISTORICAL NET WORTH & ANALYTICS — CODEX ENGINEERING PACKAGE

Repository: `wentAInx/Talli`  
Base: `v5.1.0` / `dd39ff06aa52c681f42a0165b2e7a0552c022d09`  
Frozen: 2026-08-15

> This consolidated file mirrors the split package. When conflicts exist, `01_CODEX_MASTER_INSTRUCTION_CN.md` and the numbered canonical specs take precedence.


---

# FILE: `00_README_CN.md`

# Talli V6.0 — Historical Net Worth & Analytics

## 任务包定位

本目录是 **Talli V6.0 — Historical Net Worth & Analytics** 的自包含 Codex 工程任务包。

- Repository: `wentAInx/Talli`
- Canonical base release: `v5.1.0`
- Canonical base SHA: `dd39ff06aa52c681f42a0165b2e7a0552c022d09`
- 建议 feature branch: `feat/v6-historical-analytics`
- 任务包冻结日期: 2026-08-15

V6.0 的目标不是把 Talli 改造成交易平台开户、税务软件或成本基础系统，而是在已经冻结的 V1 Ledger + V2 current valuation 之上增加：

1. historical crypto / FX quote observations；
2. App-timezone 日级净资产序列；
3. historical completeness / provenance；
4. asset / asset-class / fiat-currency allocation；
5. home-asset cash-flow trend；
6. income / expense trend；
7. net-worth change decomposition：cash flow / market & FX / trade-rebalance / reconciliation；
8. 显式、可恢复、可中断的 historical refresh workflow。

## 最重要的边界

```text
Ledger quantities
    = source of truth

Historical quotes
    = external / derived observations

Historical net worth
    = Ledger balance at time T
    × historical quote resolution at T

Historical analytics
    = derived read model

Historical quote refresh
    != Ledger mutation
```

任何 provider response、历史价格、历史汇率、图表缓存、分析结果都不得修改：

- `ledger_events`
- `ledger_entries`
- `balance_snapshots`
- transaction semantics
- account native quantity

## 阅读顺序

Codex 在编辑代码前必须按以下顺序阅读：

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `03_ARCHITECTURE_INVARIANTS_CN.md`
3. `04_PROVIDER_RESEARCH_20260815_CN.md`
4. `05_TIME_AND_DAILY_VALUATION_SEMANTICS_CN.md`
5. `06_HISTORICAL_QUOTE_DOMAIN_SPEC_CN.md`
6. `07_HISTORICAL_REFRESH_PIPELINE_CN.md`
7. `08_ANALYTICS_MATH_AND_DECOMPOSITION_CN.md`
8. `09_DATABASE_TARGET_SCHEMA_V60_DRAFT.sql`
9. `11_TYPES_SERVICE_CONTRACTS.ts`
10. `14_BACKUP_V8_SPEC_CN.md`
11. `17_TEST_ACCEPTANCE_CN.md`
12. `18_IMPLEMENTATION_PLAN_CN.md`
13. `21_FINAL_AUDIT_CHECKLIST_CN.md`

同时读取当前 repo 的：

- root `AGENTS.md`
- `src/services/AGENTS.md`
- `src/db/AGENTS.md`
- `src/app/AGENTS.md`
- V1/V2/V5.1 canonical specs
- 当前 source code，而不是只看本文档。

## Phase 0 特别提醒：旧 AGENTS 冲突

当前 release SHA 上：

- root `AGENTS.md` 仍写着 `No historical pricing`；
- `src/services/AGENTS.md` 仍写着 `Do not add ... historical valuation`。

这些是 V2/V4 时代的 scope guard，而 V6 已被正式批准为 derived historical valuation。

**V6 的第一阶段必须更新这些 AGENTS 文字，使它们允许 V6 derived historical valuation，同时保留：**

- Ledger 不变；
- provider I/O 不进入 resolver；
- no background collector；
- no tax / cost basis；
- no auto-post；
- no JS float financial arithmetic；
- no secrets leakage。

不得简单删除这些 guard。

## Definition of Done

V6 只有在以下全部成立时才可进入 Final Audit：

```text
format        PASS
lint          PASS
typecheck     PASS
db:check      PASS
unit          PASS
integration   PASS
build         PASS
security      PASS
Playwright    PASS
source audit  PASS
```

CI 全绿不能替代 source audit。


---

# FILE: `01_CODEX_MASTER_INSTRUCTION_CN.md`

# Codex Master Instruction — Talli V6.0

你正在实现 `Talli V6.0 — Historical Net Worth & Analytics`。

## 0. 起点必须精确

开始前执行并报告：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse v5.1.0^{commit}
git log --oneline --decorate -8
```

预期 base：

```text
v5.1.0
dd39ff06aa52c681f42a0165b2e7a0552c022d09
```

如果工作区不是这个 base，先判断是否用户已经明确给出新的 canonical base。不得猜。

建议创建：

```text
feat/v6-historical-analytics
```

禁止：

- rewrite `v5.1.0`
- force push
- squash/rebase 已发布 release history
- 为“整理 release”制造无关 commit

## 1. Canonical precedence

V6 工作发生冲突时，按以下优先级：

1. 本文件
2. `03_ARCHITECTURE_INVARIANTS_CN.md`
3. `05_TIME_AND_DAILY_VALUATION_SEMANTICS_CN.md`
4. `06_HISTORICAL_QUOTE_DOMAIN_SPEC_CN.md`
5. `08_ANALYTICS_MATH_AND_DECOMPOSITION_CN.md`
6. `17_TEST_ACCEPTANCE_CN.md`
7. SQL / TS target drafts
8. UI / implementation guidance
9. 旧版本中仅仅因为“当时尚未实现”而写下的 non-goal

但 V6 **无权覆盖**已经冻结的 V1 Ledger、snapshot、money precision、V3–V5 provenance、安全和显式写入边界。

## 2. V6 必须实现

### P0 Core

- CoinGecko historical crypto/USD observations。
- ECB historical EUR reference observations。
- manual historical exact-pair quote。
- resumable explicit historical refresh。
- historical quote resolver。
- batched historical balance series。
- daily historical net worth。
- completeness + provenance。
- positive asset / liability breakdown。
- asset / asset-class / fiat-currency allocation。
- income / expense / net cash-flow historical trend。
- net-worth change decomposition。
- `/analytics` UI。
- Backup schema V8。
- migration + deterministic tests + E2E。

## 3. 明确不做

V6.0 禁止顺手加入：

- tax lots
- FIFO / LIFO
- realized / unrealized tax P&L
- wash sale
- jurisdiction tax rules
- performance IRR / TWR unless separately designed later
- benchmark comparison
- DeFi accounting
- stock/bond brokerage sync
- automatic provider fallback mixing
- stablecoin peg assumptions
- cron/background collectors
- provider data -> Ledger
- auto-post / auto-link
- multi-user auth/SaaS
- Redis/queue/microservice/event bus

## 4. Provider I/O rule

历史 provider fetch 必须：

```text
explicit user action
→ claim bounded refresh unit in DB
→ HTTP outside DB transaction
→ validate complete provider payload
→ re-check mapping fingerprint
→ atomic quote-cache write + unit status
```

Resolver / analytics reads必须 cache-only。

Server Component 不能 await CoinGecko / ECB。

## 5. Exact arithmetic rule

Ledger quantities：

```text
SQLite TEXT <-> bigint
```

Price/rate/value：

```text
positive decimal TEXT
+ decimal.js / existing PriceDecimal
```

禁止使用 JS `number` / `parseFloat` / SQLite REAL 做任何 authoritative financial arithmetic。

唯一允许 `number` 的地方：

- timestamps / durations；
- chart pixel geometry after server-side exact decimal values have already been computed；
- provider JSON number → existing external-decimal normalization boundary。

Chart geometry 的 number 绝不能反馈到 financial result / tooltip exact value / persisted value。

## 6. History must include archived facts

V6 historical read 不得复制 V2 current valuation 的“只看 active accounts/assets”行为。

只要某个 archived account / asset 在历史 cutoff 有非零余额或区间内有相关活动，它必须参与历史结果。

当前 Home Asset 仍必须是 active fiat；历史图统一按“当前 Home Asset”重估历史。

## 7. Incomplete is first-class

任意 nonzero exposure 缺 quote：

- 不得填 0；
- 不得 carry crypto beyond policy；
- 不得假设 USDT/USDC=USD；
- 不得把 known subtotal 冒充完整 net worth。

返回：

- known subtotal；
- missing asset list；
- `isComplete=false`；
- chart complete series 用 gap/null；
- UI 清楚显示 provider/date/provenance。

## 8. Implementation discipline

每阶段：

1. 先读现有 source。
2. 列出受影响 invariant。
3. 先写/更新 domain tests。
4. 再实现最小代码。
5. targeted tests。
6. full gate。
7. diff audit。

禁止删除、skip 或弱化 regression test 来换绿灯。


---

# FILE: `02_PRODUCT_ENGINEERING_BRIEF_CN.md`

# Product & Engineering Brief

## 用户问题

V6 应回答以下问题：

### Net Worth
- “过去一年我的净资产怎么变化？”
- “某一天我大概值多少钱？”
- “这个日期为什么是 incomplete？”

### Allocation
- “当前/某历史日期我的资产主要分布在哪里？”
- “正资产和负债分别是什么？”
- “法币部分主要暴露在哪些币种？”

### Flow
- “每月收入、支出、净现金流怎么变化？”
- “这些值换算到 Home Asset 后大概是多少？”

### Bridge
- “净资产变化主要来自我存入/花掉的钱，还是市场与汇率变化？”
- “Exchange / reconciliation 对变化有什么影响？”

## 产品语义

V6 所有 home-denominated 数值都是 derived estimate，UI 继续使用 `≈`。

Historical Analytics 不是新的财务事实层。

```text
native Ledger quantity
+ provider/manual historical quote
+ deterministic valuation math
= derived analytical view
```

## 第一版用户体验

`/analytics`：

- Date range: 30D / 90D / 1Y / 3Y / 5Y / All / Custom
- Historical data status
- Explicit `Refresh history`
- Net Worth chart
- Gross Assets / Liabilities / Net Worth
- Asset allocation
- Asset class allocation
- Fiat currency allocation
- Monthly income / expense / net flow
- Net-worth bridge / decomposition
- Missing coverage details

默认 historical daily series 只到 **最后一个完整 App-timezone local day**。
“今天”继续由 V2 current valuation 负责，不把 current-now 与 historical EOD 混成同一 daily semantic。


---

# FILE: `03_ARCHITECTURE_INVARIANTS_CN.md`

# V6 Architecture Invariants

## A. Ledger remains the only financial fact layer

```text
historical quote
historical analytics
historical refresh run
chart
allocation
decomposition
```

全部禁止写 Ledger。

## B. Snapshot semantics cannot drift

V6 必须与现有 `queryBalanceAt/queryBalancesAt` 等价：

```text
latest snapshot S <= Q
balance(Q)
=
S.balance
+
entries in (S.asOf, Q]
```

若没有 snapshot：

```text
0 + entries <= Q
```

新 batched series 必须用 randomized / fixture differential test 与现有 query function 对拍。

## C. Natural date = App timezone

- range labels
- daily cutoff
- monthly bucket
- “last completed day”
- cash-flow day/month

统一使用 App timezone。

禁止 browser UTC date / server local date 偷偷进入 accounting calendar。

## D. Historical provider observations are replaceable derived data

Provider quote cache：

- 可删除；
- 可重新抓；
- 不进入 Backup；
- 不进入 Ledger CSV；
- 不改变 native balances。

Manual historical quote 是 user-authored valuation fact，必须进 Backup。

## E. Provider resolution has provenance

每个 resolved leg 至少保留：

- source
- provider
- base/quote asset
- rateText
- provider observed time/date
- fetched time
- granularity
- carry/fallback kind

## F. Missing != zero

对非零 quantity：
- no mapping → incomplete
- no observation → incomplete
- too-old crypto quote → incomplete
- ECB carry > policy → incomplete
- provider error without cached quote → incomplete

## G. No implicit stablecoin peg

USDT / USDC / future stablecoin 都按 crypto mapping + market quote。

## H. Historical views include archived accounts/assets

Archive 是当前 availability/UI state，不是“删除历史”。

## I. Current V2 remains intact

不要把 current `latestPriceQuotes` 改造成 history table。
V2 current resolver/API/UI 继续工作。

V6 新增独立 historical observations/resolver，允许共享：

- decimal math
- asset/mapping semantics
- HTTP transport
- provider error mapping

## J. Provider HTTP never inside write transaction

遵守：

```text
claim
COMMIT
HTTP
validate
BEGIN IMMEDIATE
re-check mapping/run state
write
COMMIT
```

## K. No background collector

V6 refresh 只能是：
- user explicitly starts;
- foreground client may issue bounded continuation steps;
- interrupted run may be resumed manually/foreground.

没有 cron / queue / daemon。

## L. Normal reachable state must be Backup-valid

新增 manual historical quote 的每个正常 mutation 都必须满足 V8 exporter/validator。


---

# FILE: `04_PROVIDER_RESEARCH_20260815_CN.md`

# Provider Research Snapshot — 2026-08-15

> 本文件是设计输入快照。Provider capability / plan / terms 会变化；实现或发布前若官方文档发生变化，以最新官方文档为准，并更新此文件。

## 1. CoinGecko

### P0 endpoint

`GET /coins/{id}/market_chart/range`

官方文档：
- https://docs.coingecko.com/reference/coins-id-market-chart-range
- https://docs.coingecko.com/reference/coins-id-market-chart

关键能力：

- `from` / `to` 支持 ISO date/datetime 或 Unix timestamp；
- `interval=hourly`；
- `interval=daily`；
- explicit hourly 单 request 最多 100-day range；
- hourly observation available from 2018-01-30；
- 5m 是 Enterprise-only，V6 不需要；
- >90d auto granularity 会变 daily，因此 V6 **不能依赖 auto**，必须显式 interval。

2026-03-24 changelog：
- hourly interval 已开放给 Demo / Basic / Analyst+；
- 100-day range/request 约束仍存在。

官方：
https://docs.coingecko.com/v3.0.1/changelog/23032023

### Historical depth

CoinGecko 当前说明：
- historical data 可超过 10 年，具体 coin 与 plan 可用范围不同；
- all plans 具有 daily/hourly historical capability，但可访问的历史年数由 plan 决定。

官方：
https://www.coingecko.com/en/api/pricing
https://www.coingecko.com/en/api

**设计结论：不要在代码里硬编码“Demo=1y / Plan X=N years”。**
请求失败/权限不足要转成 coverage status。

### Authentication

当前 repo 只有：
- `demo`
- `keyless`

V6 允许扩为：

```text
COINGECKO_MODE=demo|pro|keyless
COINGECKO_API_KEY=<server-only>
```

- Demo header: `x-cg-demo-api-key`
- Pro header: `x-cg-pro-api-key`
- Pro origin: `https://pro-api.coingecko.com/api/v3/`
- keyless/demo origin: `https://api.coingecko.com/api/v3/`

官方：
https://docs.coingecko.com/reference/authentication

### Usage/rate visibility

Paid Pro `/key` endpoint 可返回：
- plan
- per-minute limits
- monthly credit
- remaining usage

官方：
https://docs.coingecko.com/reference/api-usage

这只是 observability，不应成为 resolver 依赖。

### Terms / attribution

CoinGecko API terms 与 commercial-plan说明包含：
- API/data 使用、复制、存储、再分发限制；
- 商业集成 attribution 要求；
- raw API/data redistribution 限制。

官方：
https://www.coingecko.com/en/api_terms
https://www.coingecko.com/en/api/pricing

V6 的保守策略：
- provider history 始终标记为 derived/rebuildable cache；
- 不进入 Talli Backup；
- 不进入 Ledger CSV；
- 提供 purge provider cache；
- UI 显示 `Data provided by CoinGecko` source attribution；
- 不提供 raw CoinGecko history export / redistribution endpoint；
- 发布/对外分发前重新核对使用计划/terms。

这不是法律意见；若实际部署方式超出个人内部使用，需按当前条款确认许可。

## 2. ECB

### P0 dataset

ECB Data Portal `EXR`。

Daily EUR reference key：

```text
D.<CURRENCY>.EUR.SP00.A
```

例如：

```text
D.USD.EUR.SP00.A
```

官方 API：
https://data.ecb.europa.eu/help/api/data
https://data.ecb.europa.eu/help/api/data-examples

支持：
- `startPeriod`
- `endPeriod`
- `updatedAfter`
- `includeHistory`
- `format=csvdata`
- OR operator，例如 `USD+GBP+JPY`

V6 初始 backfill 使用 explicit start/end + csvdata。

### Reference semantics

ECB：
- working days around 16:00 CET/CEST 发布；
- reference rates for information purposes；
- rate 是 currency units per EUR；
- 周末/TARGET closing days 没有新 daily observation。

官方：
https://data.ecb.europa.eu/key-figures/ecb-interest-rates-and-exchange-rates/exchange-rates
https://data.ecb.europa.eu/methodology/exchange-rates

因此：

```text
EUR -> USD = ECB USD-per-EUR
USD -> CNY = CNY-per-EUR / USD-per-EUR
```

使用 existing decimal division；禁止 float cross-rate。

### Revisions

ECB 明确支持 `updatedAfter` 获取 added/revised/deleted observations。
V6 P0 first backfill 可用 range query；后续 explicit correction refresh 可使用 `updatedAfter` 优化，但不得假设数据永不 revision。

### Reuse

ESCB publicly available statistics 可在注明来源等条件下 reuse；如果 Talli 做了 cross-rate/derived calculation，UI/source detail 要说明是 derived calculation。

官方：
https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html
https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html

## 3. Fallback decision

V6.0 P0：
- CoinGecko = only automatic crypto historical provider；
- ECB = only automatic fiat historical provider；
- manual historical exact pair = user override/fill path。

**不实现 automatic CoinMarketCap/DefiLlama fallback。**

原因：
- 自动混 provider 会改变 provenance 与 daily anchor semantics；
- fallback 必须独立设计 freshness/selection/licensing；
- 缺 provider 时显示 incomplete 比 silent provider substitution 更符合 Talli 原则。

未来版本可以新增 provider interface implementation，但必须显式标识 source。


---

# FILE: `05_TIME_AND_DAILY_VALUATION_SEMANTICS_CN.md`

# Time & Daily Valuation Semantics

## 1. Daily cutoff

对 App timezone `TZ` 中 local date `D`：

```text
range(D) = [D 00:00:00.000, next(D) 00:00:00.000)
cutoff(D) = endExclusive - 1 millisecond
```

复用现有：
- `localDateRangeToUtc`
- `localDateTimeToUtc`
- `canonicalUtcInstantValue`

新增纯 helper：

```ts
localDateEndInclusiveUtc(date, timeZone): string
```

实现应由 `localDateRangeToUtc({from: date, to: date}, TZ).endExclusive - 1ms` 得到。

这样可以继续使用现有 inclusive `queryBalancesAt(..., cutoff)`，无需更改 V1 balance semantics。

DST 23/25-hour day 必须测试。

## 2. Last completed day

Historical daily chart 默认 end：

```text
App-timezone today - 1 calendar day
```

“今天现在值多少”继续属于 V2 Current Valuation。

不得在同一 daily series 里把：
- yesterday = EOD
- today = current-now

混在一起。

## 3. Crypto quote selection

历史 observation 存真实 `providerObservedAt`。

给 cutoff `T`：

1. 优先选择 latest hourly observation `<= T`；
2. age <= 2h → usable `hourly_prior`；
3. 如果没有 hourly，允许 latest daily observation `<= T`；
4. daily age <= 26h → usable `daily_fallback`；
5. 否则 missing。

不得使用 future observation (`observedAt > T`)。

`daily_fallback` 必须在 provenance/UI 显示，不能伪装 hourly。

## 4. ECB selection

对 local date D：

1. 找 `observationDate <= D` 的最近 ECB observation；
2. same day → `fx_reference_same_day`；
3. earlier <= 7 calendar days → `fx_carry_forward`；
4. >7 days → missing。

周末/holiday carry-forward 是显式 resolution kind。

## 5. Cash-flow event-time

Income/Expense/Fee 的 home value 使用 event `occurredAt`：
- crypto：latest prior hourly/daily quote；
- fiat：event 在 App timezone 所属 local date 的 ECB reference/carry；
- manual historical：该 local date exact-pair。

因此 monthly cash-flow trend 不使用“当前价格”。

## 6. Timezone changes

Provider crypto observations存 UTC instant，不绑定 App timezone；
ECB 存 observation date。

因此用户更改 App timezone 时：
- 不改 Ledger；
- 不改 provider observation；
- historical day cutoff / buckets 重新计算；
- derived series重新计算；
- manual historical quote 的 `valuationDate` 仍是用户明确输入的 calendar date。

## 7. Range lookback

为了能 resolve 首日：

- CoinGecko fetch planner 给 range 前增加至少 26h lookback；
- ECB 给 start date 增加 7 calendar days lookback。

UI 展示 requested range，不展示 lookback 作为额外 chart days。


---

# FILE: `06_HISTORICAL_QUOTE_DOMAIN_SPEC_CN.md`

# Historical Quote Domain Specification

## 1. Observation vs Resolution

必须区分：

```text
Observation
= provider/manual 给出的一个 quote fact

Resolution
= 在 query time/date 为某资产找到的一条或多条 quote legs
```

不要把 resolution 结果持久化为 Ledger 或 financial fact。

## 2. Automatic observation tables

### Crypto observation

```text
base asset
quote asset (P0 = USD)
provider = coingecko
granularity = hourly | daily
rateText
providerObservedAt UTC instant
firstFetchedAt
lastFetchedAt
metadata
```

同一 provider/base/quote/observedAt 是同一 observation identity。
provider 后续修订同 timestamp 的 rate：允许 upsert 当前 cache value，并更新 `lastFetchedAt`。

### FX observation

```text
base asset = EUR
quote asset = target fiat
provider = ecb
rateText
providerObservationDate
firstFetchedAt
lastFetchedAt
metadata
```

unique by provider/base/quote/date。

## 3. Manual historical quote

用户可为：

```text
baseAssetId
quoteAssetId
valuationDate
```

保存一个 exact-pair positive decimal quote。

优先级：

```text
manual historical exact-pair
> automatic historical provider
```

它：
- 不改 Ledger；
- 必须进 Backup V8；
- 允许 custom asset；
- 不代表 stablecoin peg；
- edit/delete 必须显式。

## 4. Historical resolver

输入：

```ts
{
  baseAssetId,
  homeAssetId,
  queryTime,
  localDate
}
```

输出包含：
- ok
- rateText
- resolution quality
- legs
- missing reason

### Fiat

沿用 V2 math：
- identity
- ECB EUR bridge
- home/base cross-rate using decimal division

### Crypto

沿用 V2 bridge：
- CoinGecko crypto/USD
- USD/home through historical ECB
- exact decimal multiplication

### Custom

P0 only manual exact base/home historical quote。

## 5. Resolver status

建议：

```text
identity
manual
hourly
daily_fallback
fx_reference
fx_carry_forward
missing_mapping
missing_quote
provider_error
unsupported
```

不要把 completeness 与 freshness 混成一个 boolean。

## 6. Zero balance rule

quantity == 0：
- 缺 quote 不影响 portfolio completeness；
- 仍可返回 line/provenance if needed。

quantity != 0：
- resolution fail → portfolio incomplete。

## 7. Archived asset rule

Historical resolver 不因为 `asset.isArchived=true` 自动拒绝。
如果 asset identity 仍存在且有 historical exposure，应该 resolve。

Home Asset 仍必须是当前 active fiat。

## 8. Known subtotal vs complete total

Historical portfolio result：

```text
knownValueText
completeValueText: string | null
isComplete
```

若 missing nonzero asset：
- `knownValueText` 允许展示；
- `completeValueText=null`；
- chart main series point = gap/null。

不要把 known subtotal 命名为“Net Worth”而不标 incomplete。


---

# FILE: `07_HISTORICAL_REFRESH_PIPELINE_CN.md`

# Historical Refresh Pipeline

## 1. Why resumable foreground refresh

5Y hourly crypto history：
- each CoinGecko range request max 100 days；
- 多资产会产生几十到上百 fetch units。

不得：
- 在 SSR 阻塞；
- 建 background queue/cron；
- 把 100+ provider calls 塞进一个 DB transaction。

因此 V6 使用显式 resumable run。

## 2. Lifecycle

```text
User clicks Refresh History
        ↓
create run + deterministic units
        ↓
client calls step(runId)
        ↓
claim <= 4 pending units
        ↓
HTTP outside transaction
        ↓
validate complete payload
        ↓
mapping fingerprint check
        ↓
atomic cache upsert + unit complete
        ↓
repeat while foreground page is active
```

中断：
- run 保留 pending units；
- 用户可 Resume；
- 不自动后台继续。

## 3. Run states

```text
pending
running
partial
success
failed
invalidated
cancelled
```

Unit：

```text
pending
running
success
failed
```

## 4. Mapping fingerprint

Run start 固化：
- assetId
- provider
- providerAssetKey
- enabled
- priority

在 provider HTTP response 写入 DB 前重新计算。

变化则：
- discard response
- mark run invalidated
- no cache write from that unit

复用 current PriceRefreshService 的 race-defense思想。

## 5. CoinGecko planning

每个 crypto mapping：

- required UTC interval = requested local-date range + 26h lookback；
- >= 2018-01-30 采用 explicit `interval=hourly`；
- each unit <= 100 days；
- 更早范围用 `interval=daily` bounded chunks；
- `precision=full`；
- store only `prices`；
- do not store market cap / volume。

不依赖 auto granularity。

## 6. ECB planning

- required start = requested start - 7 calendar days；
- `D.<CURRENCIES>.EUR.SP00.A`
- `startPeriod`
- `endPeriod`
- `format=csvdata`
- `detail=dataonly`
- large ranges可按 calendar year / <=366d chunk；
- 一个 unit 可批量多个 currency codes。

## 7. Failure semantics

HTTP / parse / config failure：

- current unit zero quote writes；
- unit failed；
- safe error code/message；
- run partial/failed；
- cached old history继续可读；
- no Ledger effect。

429 / Retry-After：
- respect cooldown；
- 不 busy-loop。

## 8. Payload validation

CoinGecko:
- top object shape；
- `prices` array；
- each point exactly usable timestamp/rate；
- timestamp safe integer ms；
- positive decimal；
- timestamp within requested unit tolerance；
- sort/dedupe deterministically。

ECB:
- CSV parse strict；
- CURRENCY requested；
- TIME_PERIOD valid date；
- OBS_VALUE positive decimal；
- no unsafe currency key；
- no raw response persistence。

## 9. Secret boundary

- API key only server env；
- never DB；
- never refresh run metadata；
- never sourceMetadataJson；
- never API response；
- never logs/client/Backup。

## 10. Purge

Settings/Analytics data-source panel提供：

`Purge provider historical cache`

删除：
- automatic historical price/fx observations
- historical refresh operational runs/units

保留：
- Ledger
- V2 current config/mappings
- manual historical quotes


---

# FILE: `08_ANALYTICS_MATH_AND_DECOMPOSITION_CN.md`

# Analytics Math & Net-worth Decomposition

## 1. Daily portfolio valuation

对 date D：

```text
T_D = App-timezone local day end
Q_a(D) = ledger balance of asset a at T_D
P_a(D) = historical resolved home rate at T_D

V_a(D) = Q_a(D) × P_a(D)
```

使用 existing `PriceDecimal` / decimal text。

Portfolio：

```text
known = Σ known V_a
complete = every nonzero Q_a has P_a
```

如果 incomplete：
- `knownValue` 可返回；
- authoritative chart total = null。

## 2. Gross assets / liabilities

按 home value sign：

```text
grossAssets      = Σ max(V_a, 0)
grossLiabilities = Σ min(V_a, 0)
netWorth         = grossAssets + grossLiabilities
```

负债不塞进 pie percentage denominator。

## 3. Allocation

### Asset allocation
只对 positive values：
```text
share_a = V_a / grossAssets
```

### Asset class
```text
fiat
crypto
custom
```

### Fiat currency allocation
仅 fiat positive holdings：
```text
CNY / USD / EUR / HKD / ...
```

crypto 不伪装成“currency allocation”。

若 denominator=0，返回 empty—not NaN。

## 4. Historical cash-flow trend

沿用 V1 report inclusion：

- income/main
- expense/main
- transfer/exchange fee

排除：
- transfer principal
- exchange principal
- snapshot

每个 included entry在 `occurredAt` 解析 historical home rate：

```text
homeValue = nativeQuantity × rateAt(event time)
```

bucket 使用 App timezone month。

结果：
- income
- expense
- fees
- netFlow
- isComplete
- missing entries/assets count

缺 quote 不填 0。

## 5. Daily net-worth bridge identity

对 asset `a`，相邻日：

```text
Q0 = prior cutoff quantity
Q1 = current cutoff quantity
P0 = prior cutoff home rate
P1 = current cutoff home rate

ΔQ = Q1 - Q0
ΔP = P1 - P0

MarketEffect_a = Q0 × ΔP
QuantityEffect_a = ΔQ × P1

ΔV_a
= Q1×P1 - Q0×P0
= MarketEffect_a + QuantityEffect_a
```

这是 algebraic attribution，不是 cost basis / realized P&L。

## 6. Quantity-effect classification

对 `(T0, T1]` 的 Ledger entries按 event type / entry role求 native delta：

- `income/main` → income
- `expense/main` → expense
- transfer/exchange `fee` → fees
- transfer principal → internal_transfer
- exchange principal → trade_rebalance

对每类：

```text
component = Σ nativeDelta_a × P1_a
```

### Reconciliation effect

Snapshot 会覆盖历史 entry accumulation，因此定义：

```text
EntryDelta_a = Σ all ledger entry amount in (T0,T1]
ReconDelta_a = Q1 - Q0 - EntryDelta_a

ReconciliationEffect_a = ReconDelta_a × P1_a
```

这确保 snapshot reset 被显式暴露。

## 7. Exact bridge

Portfolio：

```text
NetWorthDelta
=
MarketAndFx
+ Income
+ Expense
+ Fees
+ InternalTransfer
+ TradeRebalance
+ Reconciliation
```

`InternalTransfer` 在 portfolio aggregate、同资产双腿正常情况下必须 exact 0。
若非 0，优先视为 implementation/data invariant bug，不要静默吞掉。

`TradeRebalance` 可以非 0：
- end-of-day prices下交换两腿价值可能不同；
- 它不是 realized P&L；
- UI 名称用 `Trade / rebalance effect`。

## 8. Incomplete decomposition

只要某 asset 在公式中需要 `P0` 或 `P1` 而缺失：
- entire affected day bridge `isComplete=false`；
- 不把 missing component 当 0；
- 可返回 known components + missing asset IDs；
- 总 bridge 不应冒充 exact reconciliation。

## 9. Archived + zero endpoint edge

即使 asset 在 Q0/Q1 都为 0，只要 day 内有 nonzero Ledger activity，decomposition 仍需考虑它。

因此 decomposition asset set：

```text
assets with Q0 != 0
OR Q1 != 0
OR nonzero entries in interval
OR snapshot delta in interval
```


---

# FILE: `09_DATABASE_TARGET_SCHEMA_V60_DRAFT.sql`

-- Talli V6.0 target schema draft.
-- Canonical semantics live in numbered markdown specs.
-- Adapt naming only to match existing Drizzle conventions; do not change meaning.

CREATE TABLE historical_price_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  base_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quote_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'coingecko'),
  quote_kind TEXT NOT NULL CHECK (quote_kind = 'market'),
  granularity TEXT NOT NULL CHECK (granularity IN ('hourly', 'daily')),
  rate_text TEXT NOT NULL,
  provider_observed_at TEXT NOT NULL,
  first_fetched_at TEXT NOT NULL,
  last_fetched_at TEXT NOT NULL,
  source_metadata_json TEXT,
  CHECK (base_asset_id <> quote_asset_id),
  UNIQUE (provider, base_asset_id, quote_asset_id, provider_observed_at)
);

CREATE INDEX historical_price_quotes_lookup_idx
ON historical_price_quotes(base_asset_id, quote_asset_id, provider_observed_at);

CREATE TABLE historical_fx_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  base_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quote_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'ecb'),
  quote_kind TEXT NOT NULL CHECK (quote_kind = 'reference'),
  rate_text TEXT NOT NULL,
  provider_observation_date TEXT NOT NULL,
  first_fetched_at TEXT NOT NULL,
  last_fetched_at TEXT NOT NULL,
  source_metadata_json TEXT,
  CHECK (base_asset_id <> quote_asset_id),
  UNIQUE (provider, base_asset_id, quote_asset_id, provider_observation_date)
);

CREATE INDEX historical_fx_quotes_lookup_idx
ON historical_fx_quotes(base_asset_id, quote_asset_id, provider_observation_date);

CREATE TABLE historical_manual_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  base_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quote_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  valuation_date TEXT NOT NULL,
  rate_text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (base_asset_id <> quote_asset_id),
  UNIQUE (base_asset_id, quote_asset_id, valuation_date)
);

CREATE INDEX historical_manual_quotes_lookup_idx
ON historical_manual_quotes(base_asset_id, quote_asset_id, valuation_date);

CREATE TABLE historical_refresh_runs (
  id TEXT PRIMARY KEY NOT NULL,
  requested_from_date TEXT NOT NULL,
  requested_to_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending','running','partial','success','failed','invalidated','cancelled')
  ),
  mapping_fingerprint TEXT NOT NULL,
  total_units INTEGER NOT NULL CHECK (total_units >= 0),
  completed_units INTEGER NOT NULL DEFAULT 0 CHECK (completed_units >= 0),
  failed_units INTEGER NOT NULL DEFAULT 0 CHECK (failed_units >= 0),
  last_error_code TEXT,
  last_error_message TEXT,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE historical_refresh_units (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES historical_refresh_runs(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  provider TEXT NOT NULL CHECK (provider IN ('coingecko','ecb')),
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  provider_scope_json TEXT NOT NULL,
  interval_kind TEXT NOT NULL CHECK (interval_kind IN ('hourly','daily','ecb_daily')),
  from_boundary TEXT NOT NULL,
  to_boundary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','success','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  last_error_message TEXT,
  claimed_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, ordinal)
);

CREATE INDEX historical_refresh_units_pending_idx
ON historical_refresh_units(run_id, status, ordinal);

-- No daily_portfolio_valuations table in V6.0 P0.
-- Computed analytics are derived on read to avoid invalidation bugs from:
-- backdated Ledger edits, new snapshots, quote revisions, mapping edits,
-- Home Asset changes, or App timezone changes.


---

# FILE: `10_MIGRATION_V51_TO_V60_CN.md`

# V5.1 → V6.0 Migration Plan

## Migration number

当前 latest migration 为 V5.1 `0008...`。
V6 目标使用下一条显式 migration（预期 `0009_v60_historical_analytics.sql`）。

先实际检查 repo journal，若编号已变化则顺延，不覆盖旧 migration。

## Additive only

V6 migration：
- add new history tables/indexes；
- 不 alter Ledger amount semantics；
- 不 rewrite existing quotes；
- 不 migrate latest cache into historical cache；
- 不回填 fake history。

首次启动 V6：
- historical provider observations empty；
- user sees `History not fetched yet`；
- explicit refresh only。

## Existing V2 config

继续复用：
- `book_valuation_settings`
- `price_provider_mappings`
- current manual quotes for current valuation

**current manual quote 不自动复制成 historical quote。**
它没有“某一历史日”语义。

## Backup

V6 export schema version：
```text
8
```

V1–V7 input：
- in-memory upgrade to V8 model；
- `historicalManualQuotes=[]`；
- provider historical cache永远不来自 backup。

## Migration tests

至少：
- V5.1 fixture DB migrates；
- exact Ledger rows/amount text unchanged；
- current V2 valuation tables unchanged；
- new tables empty；
- migration rerun semantics符合项目标准；
- `drizzle-kit check` passes。


---

# FILE: `11_TYPES_SERVICE_CONTRACTS.ts`

// V6 target contracts. Adjust imports/names to existing repo conventions.
// Do not weaken semantics.

export type HistoricalProviderId = "coingecko" | "ecb";
export type HistoricalCryptoGranularity = "hourly" | "daily";

export interface HistoricalPriceObservation {
  baseAssetId: string;
  quoteAssetId: string;
  provider: "coingecko";
  granularity: HistoricalCryptoGranularity;
  rateText: string;
  providerObservedAt: string;
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface HistoricalFxObservation {
  baseAssetId: string; // EUR
  quoteAssetId: string;
  provider: "ecb";
  rateText: string;
  providerObservationDate: string; // YYYY-MM-DD
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface HistoricalManualQuote {
  id: string;
  baseAssetId: string;
  quoteAssetId: string;
  valuationDate: string;
  rateText: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HistoricalResolutionKind =
  | "identity"
  | "manual"
  | "hourly_prior"
  | "daily_fallback"
  | "fx_reference_same_day"
  | "fx_carry_forward";

export interface HistoricalQuoteLeg {
  baseAssetId: string;
  quoteAssetId: string;
  rateText: string;
  source: "identity" | "manual" | HistoricalProviderId;
  kind: HistoricalResolutionKind;
  providerObservedAt?: string | null;
  providerObservationDate?: string | null;
  fetchedAt?: string | null;
  granularity?: HistoricalCryptoGranularity | null;
}

export type HistoricalQuoteResolution =
  | {
      ok: true;
      baseAssetId: string;
      quoteAssetId: string;
      rateText: string;
      legs: HistoricalQuoteLeg[];
      degraded: boolean;
    }
  | {
      ok: false;
      baseAssetId: string;
      quoteAssetId: string;
      status:
        | "missing_mapping"
        | "missing_quote"
        | "provider_error"
        | "unsupported";
      message: string;
    };

export interface HistoricalNetWorthPoint {
  localDate: string;
  cutoffUtc: string;
  knownValueText: string;
  completeValueText: string | null;
  grossAssetsKnownText: string;
  grossLiabilitiesKnownText: string;
  isComplete: boolean;
  isDegraded: boolean;
  missingAssetIds: string[];
}

export interface HistoricalNetWorthSeriesResult {
  homeAssetId: string;
  timeZone: string;
  fromDate: string;
  toDate: string;
  points: HistoricalNetWorthPoint[];
}

export interface AllocationSlice {
  key: string;
  label: string;
  valueText: string;
  shareText: string | null;
}

export interface HistoricalAllocationResult {
  localDate: string;
  isComplete: boolean;
  grossAssetsText: string | null;
  grossLiabilitiesText: string | null;
  netWorthText: string | null;
  byAsset: AllocationSlice[];
  byAssetClass: AllocationSlice[];
  byFiatCurrency: AllocationSlice[];
  missingAssetIds: string[];
}

export interface HistoricalFlowBucket {
  period: string;
  incomeText: string | null;
  expenseText: string | null;
  feesText: string | null;
  netFlowText: string | null;
  isComplete: boolean;
  missingCount: number;
}

export interface NetWorthBridgePoint {
  localDate: string;
  startValueText: string | null;
  endValueText: string | null;
  deltaText: string | null;
  marketAndFxText: string | null;
  incomeText: string | null;
  expenseText: string | null;
  feesText: string | null;
  internalTransferText: string | null;
  tradeRebalanceText: string | null;
  reconciliationText: string | null;
  isComplete: boolean;
  missingAssetIds: string[];
}

export type HistoricalRefreshRunStatus =
  | "pending"
  | "running"
  | "partial"
  | "success"
  | "failed"
  | "invalidated"
  | "cancelled";

export interface HistoricalRefreshProgress {
  runId: string;
  status: HistoricalRefreshRunStatus;
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  nextAction: "step" | "retry" | "done" | "restart";
}

export interface CoinGeckoHistoricalProvider {
  fetchCryptoUsdHistory(input: {
    mapping: {
      assetId: string;
      providerAssetKey: string;
    };
    usdAssetId: string;
    fromUtc: string;
    toUtc: string;
    interval: HistoricalCryptoGranularity;
    fetchedAt: string;
  }): Promise<HistoricalPriceObservation[]>;
}

export interface EcbHistoricalProvider {
  fetchEurReferenceHistory(input: {
    mappings: Array<{
      assetId: string;
      providerAssetKey: string;
    }>;
    eurAssetId: string;
    fromDate: string;
    toDate: string;
    fetchedAt: string;
  }): Promise<HistoricalFxObservation[]>;
}

export interface HistoricalRefreshService {
  start(input: {
    fromDate: string;
    toDate: string;
  }): HistoricalRefreshProgress;

  step(input: {
    runId: string;
    maxUnits?: number;
  }): Promise<HistoricalRefreshProgress>;

  cancel(input: { runId: string }): HistoricalRefreshProgress;
}

export interface HistoricalAnalyticsService {
  netWorthSeries(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
  }): HistoricalNetWorthSeriesResult;

  allocation(input: {
    bookId: string;
    localDate: string;
  }): HistoricalAllocationResult;

  cashFlowTrend(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
    bucket: "month";
  }): { buckets: HistoricalFlowBucket[] };

  decomposition(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
  }): { points: NetWorthBridgePoint[] };
}


---

# FILE: `12_API_SERVER_BOUNDARY_SPEC_CN.md`

# API / Server Boundary Specification

Route naming可按现有 App Router convention微调，但语义保持。

## Reads

### GET `/api/analytics/net-worth`
Query:
- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

返回 daily series。
不得 provider HTTP。

### GET `/api/analytics/allocation`
- `date=YYYY-MM-DD`

不得 provider HTTP。

### GET `/api/analytics/cash-flow`
- from/to
- `bucket=month`

不得 provider HTTP。

### GET `/api/analytics/decomposition`
- from/to

不得 provider HTTP。

### GET `/api/analytics/history/status`
返回：
- observed coverage
- latest refresh runs
- missing mapped assets
- provider source attribution

## Explicit mutations

### POST `/api/analytics/history/refresh`
创建 refresh run。

Body strict：
```json
{"fromDate":"2025-01-01","toDate":"2025-12-31"}
```

### POST `/api/analytics/history/refresh/{id}/step`
执行 bounded units。
默认 max 4，server clamp 1..4。

### POST `/api/analytics/history/refresh/{id}/cancel`

### manual historical quotes
可用 Server Actions 或 Route Handler，遵循现有 product conventions：
- create/update/delete
- strict positive decimal
- exact asset pair/date
- CSRF/same-origin behavior沿用项目模式

## Input caps

防止 accidental DoS：
- net-worth/decomposition max daily points建议 <= 5000；
- custom range超限返回明确 error；
- refresh from <= to；
- refresh 不允许 future dates beyond last completed day；
- unit count有合理 server cap；
- string/date strictly validated。

## Safe errors

API 不返回：
- stack
- DB path
- API key
- raw provider payload
- raw provider URL with secret

统一 service error code。


---

# FILE: `13_UI_UX_ANALYTICS_SPEC_CN.md`

# Analytics UI/UX Specification

## Page

新增 `/analytics`，导航加入 Analytics。

设计应遵循现有 finance UI：
- mobile first
- tabular numerals
- explicit signs
- asset codes
- color not sole semantic carrier

## Header

- title: `Analytics`
- current Home Asset
- App timezone
- date range selector
- `Refresh history` button
- data status badge

## Net Worth

显示：
- `≈ Net Worth`
- period change
- gross assets
- liabilities
- completeness

Chart：
- complete points solid line；
- incomplete point使用 gap，不连成假趋势；
- degraded but complete point可以 tooltip badge；
- tooltip exact value用 server decimal string，不用 chart float重算。

## History status

用户可以看到：
- CoinGecko coverage
- ECB coverage
- manual historical overrides
- last refresh
- partial/failed run
- missing mappings
- Resume / Retry
- Purge provider cache

Source:
- `Data provided by CoinGecko`
- `Source: ECB statistics`
- derived cross-rate clearly labeled。

## Allocation

三种切换：
1. By asset
2. By asset class
3. Fiat currency

负债单独 section。
不要把负数 pie slice塞进 100%。

## Cash Flow

Monthly bar/line：
- Income
- Expense
- Fees
- Net flow

缺 historical rate：
- bucket incomplete
- tooltip显示 missing count
- 不画成 0。

## Net-worth Bridge

建议 stacked bar / bridge cards：
- Market & FX
- Income
- Expense
- Fees
- Trade / rebalance
- Reconciliation

Internal transfer正常为 0，可默认隐藏；非零时显示 warning。

明确文案：
> This is a valuation-change attribution, not tax cost basis or realized P&L.

## Manual Historical Quote

在 data status/missing asset detail提供：
- date
- base asset
- Home Asset quote
- rate
- note

不要在 primary transaction UI 混入。

## Chart library

当前 release 无 chart dependency。
实现前检查现有 stack：

- 优先 small accessible SVG / existing project pattern；
- 若新增 chart library，必须说明理由、React 19/Next 16 compatibility、bundle impact，并锁入 pnpm lock；
- chart library 只负责 geometry，不负责 financial math。


---

# FILE: `14_BACKUP_V8_SPEC_CN.md`

# Backup V8 Specification

## Version

V5.1 current:
```text
BACKUP_SCHEMA_VERSION = 7
```

V6:
```text
BACKUP_SCHEMA_VERSION = 8
```

## V8新增必须备份

```text
historicalManualQuotes
```

理由：
- user-authored valuation input；
- 无法由 provider自动重建；
- 与 current manual quote一样属于用户配置/事实。

## V8明确排除

```text
historical_price_quotes
historical_fx_quotes
historical_refresh_runs
historical_refresh_units
provider API usage cache
```

这些是：
- provider-derived cache
- operational state
- 可重建

也排除所有 API keys。

## V1–V7 upgrade

in-memory：
```text
historicalManualQuotes = []
```

其他字段保持既有 version upgrade链。

## Validation

每个 manual historical quote：
- id nonempty
- base/quote asset exist
- base != quote
- valuationDate real `YYYY-MM-DD`
- positive canonical decimal
- note bounded
- createdAt/updatedAt canonical UTC
- unique `(baseAssetId, quoteAssetId, valuationDate)`

## Restore

- full validation before writes；
- empty/allowed target semantics沿用；
- one restore transaction；
- failure rollback everything；
- provider historical cache恢复后为空；
- foreign_key_check；
- row counts/key relations。

## Reachability invariant

任何正常 manual historical quote mutation 成功后，立即 export V8 必须成功。


---

# FILE: `15_SECURITY_PROVIDER_POLICY_CN.md`

# Security & Provider Policy

## Secret invariants

`COINGECKO_API_KEY`：
- env only
- server only
- never DB
- never Backup
- never source metadata
- never logs
- never client JS / RSC serialized props

ECB无 secret。

## SSR

- analytics Server Component只读 DB cache；
- 不 await external provider；
- provider outage不能让页面 SSR 挂死。

## Provider URL

CoinGecko：
- demo/keyless fixed origin
- pro fixed origin
- no arbitrary user-configured provider URL in production

Tests inject deterministic transport/base URL。

ECB fixed `data-api.ecb.europa.eu` production origin。

## Raw data minimization

Persist only needed:
- price observation
- rate
- timestamp/date
- minimal source metadata

不要存：
- CoinGecko entire response
- market cap
- volume
- arbitrary debug body
- ECB full raw CSV blob

## Licensing / source attribution

Analytics data-source panel必须有：
- CoinGecko attribution
- ECB source label

Provider cache不可经 backup/export endpoint redistributable raw dump。

## Purge

用户能删除 provider-derived history，不影响：
- Ledger
- snapshots
- manual quotes
- mappings

## Error hygiene

Provider error保存：
- normalized safe code
- safe short message

不要保存 response body if it may echo request/security details。

## Security check script

扩展 `security:check` 检查：
- historical provider code没有 client imports；
- env secret names不出现在 backup/client bundles；
- no historical route writes Ledger；
- no new configurable production origins；
- no forbidden stablecoin peg constant。


---

# FILE: `16_PERFORMANCE_AND_CACHE_STRATEGY_CN.md`

# Performance & Cache Strategy

## 1. Do not materialize daily portfolio values in P0

V6.0 不新增 `daily_portfolio_valuations` 持久表。

原因：
- backdated Ledger event
- snapshot edit/create/delete
- provider revision
- manual historical quote
- Home Asset change
- mapping change
- timezone change

都会产生复杂 invalidation。

先持久化 raw/minimal provider observations，analytics on-read derived。

## 2. Batched balance series

禁止 UI range=N days就循环 N 次做完整 DB query。

新增 batched query/domain：

```ts
queryBalancesAtInstants(accountIds, instants)
```

推荐算法：
1. load snapshots <= maxInstant；
2. per account按 `(asOf, createdAt, id)`整理 authoritative snapshot；
3. load entries <= maxInstant；
4. per account按 occurredAt生成 bigint prefix sums；
5. 对每 instant：
   - latest snapshot <= instant；
   - balance = snapshot balance
     + prefix(entries<=instant)
     - prefix(entries<=snapshot.asOf)

注意：
- entries exactly at snapshot.asOf 必须被减掉；
- 与现有 `queryBalancesAt` differential test。

## 3. Historical quote batching

一次 analytics range：
- load needed crypto observations once per pair/time range + lookback；
- load ECB rows once；
- build sorted arrays/maps；
- resolver binary search，不 per-point DB roundtrip。

## 4. Range limits

建议：
- daily API response max 5000 points；
- default 1Y；
- All如果超过上限，UI提示分段或后端 downsample另行设计，不 silent truncate。

## 5. SQLite indexes

必须有：
- crypto `(base,quote,observedAt)`
- FX `(base,quote,observationDate)`
- manual `(base,quote,valuationDate)`
- refresh pending `(run,status,ordinal)`

## 6. Provider write volume

CoinGecko hourly约：
```text
8760 rows / asset / year
```

典型单用户规模可接受，但必须：
- batch insert/upsert；
- one unit transaction；
- no row-by-row transaction；
- deterministic indexes；
- no raw payload blobs。

## 7. Read consistency

一个 analytics service read应在单个 SQLite read transaction/snapshot中组装：
- settings
- assets/accounts
- Ledger facts
- historical observations
- manual quotes

避免同一 response前后看到不同 config/cache state。


---

# FILE: `17_TEST_ACCEPTANCE_CN.md`

# V6 Test & Acceptance Specification

## A. Migration / regression

1. V5.1 DB -> V6 migration PASS。
2. Ledger rows byte/semantic unchanged。
3. current V2 valuation still passes。
4. V3/V4/V5/V5.1 regression suites pass。
5. new tables initially empty。

## B. Time semantics

- Asia/Shanghai day cutoff。
- America/Los_Angeles day cutoff。
- DST spring-forward day。
- DST fall-back day。
- today excluded from default historical series。
- event at exact next local midnight belongs next day。

## C. Balance differential

随机 deterministic fixtures：
- snapshots
- backdated entries
- same timestamp entries
- multiple snapshots

对 100+ query instants：
```text
batched result == existing queryBalancesAt
```

## D. CoinGecko parser

- hourly valid payload。
- daily valid payload。
- malformed JSON -> zero writes。
- invalid timestamp -> zero writes。
- non-positive/invalid price -> zero writes。
- duplicate same timestamp same payload idempotent。
- later correction same timestamp updates cache deterministically。
- 429 normalized/cooldown。
- pro/demo header server-only。
- 100-day planning boundary。
- before 2018 hourly split to daily。

No live HTTP in tests。

## E. ECB parser

- multi-currency CSV。
- start/end range。
- weekend gap accepted。
- invalid date/rate rejected。
- unknown currency rejected/ignored according to strict spec。
- cross-rate exact decimal。
- revision upsert。
- no raw CSV persisted。

## F. Resolver

- identity。
- manual exact pair precedence。
- hourly latest prior。
- never future quote。
- hourly >2h missing。
- daily fallback <=26h。
- ECB same-day。
- ECB weekend carry。
- ECB >7d missing。
- crypto/USD × USD/home。
- archived asset resolves。
- custom without manual = unsupported。
- stablecoin not identity USD。

## G. Net worth

Fixtures：
- multiple fiat
- BTC/ETH
- archived historical account
- negative liability
- zero balance missing mapping
- nonzero missing mapping

Assert:
- exact decimal strings；
- gross assets/liabilities；
- known vs complete；
- incomplete chart point = null completeValue。

## H. Cash flow

- income main included
- expense main included
- fee included
- transfer principal excluded
- exchange principal excluded
- App timezone month bucket
- event-time historical price
- missing price makes bucket incomplete

## I. Decomposition algebra

For every complete fixture:

```text
end - start
==
marketAndFx
+ income
+ expense
+ fees
+ internalTransfer
+ tradeRebalance
+ reconciliation
```

exact decimal equality before display rounding。

Specific:
- transfer effect exact 0；
- price-only change -> only market；
- income-only -> cash flow；
- exchange -> trade/rebalance；
- snapshot reset -> reconciliation；
- missing P0/P1 -> incomplete。

## J. Backup V8

- export includes historicalManualQuotes。
- export excludes provider history / refresh runs。
- API key absent。
- V7 restore -> V8 works。
- V8 roundtrip manual quotes exact。
- corrupt manual quote rejects before write。
- failed restore full rollback。
- normal manual quote mutation remains exportable。

## K. API/security

- date input strict。
- overlong range rejected。
- step max units clamped。
- provider error safe。
- no route writes Ledger。
- no provider HTTP on analytics GET/SSR。

## L. E2E

至少新增：

1. Analytics empty history -> explicit CTA。
2. Seed deterministic history -> net worth chart/cards visible。
3. incomplete quote -> gap + warning。
4. explicit refresh mocked provider -> progress -> success。
5. interrupted refresh -> resume。
6. manual historical quote fills missing custom asset。
7. allocation liabilities separate。
8. cash flow trend。
9. decomposition tooltip/source。
10. mobile analytics no overflow。

## Full gate

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

不得声称未实际运行的命令 PASS。


---

# FILE: `18_IMPLEMENTATION_PLAN_CN.md`

# V6 Implementation Plan

## Phase 0 — Canonical docs / AGENTS

1. 创建 branch from `dd39ff06aa52c681f42a0165b2e7a0552c022d09`。
2. 把本 package 放入 `docs/v6-historical-analytics/`。
3. 更新 root `AGENTS.md`：
   - project identity through V6；
   - old `No historical pricing` 改为 `V1 Ledger does not store historical valuation; V6 derived layer is allowed`；
   - no tax/cost basis仍保留。
4. 更新 `src/services/AGENTS.md`：
   - allow explicit historical refresh service；
   - provider I/O outside tx；
   - no background collector；
   - analytics resolver cache-only。
5. 检查其他 nested AGENTS，仅修冲突文字。

先跑 format/lint。

## Phase 1 — Domain + schema

- historical quote types/resolver domain
- date cutoff helper
- SQL/Drizzle migration
- DB queries
- manual quote domain validation
- Backup V8 model skeleton
- unit/migration tests

## Phase 2 — Provider historical adapters

CoinGecko：
- add pro mode support without breaking current demo/keyless
- range historical method
- hourly/daily parse

ECB：
- range historical method

- deterministic injected transport tests
- no real HTTP

## Phase 3 — Refresh orchestration

- run/unit tables
- planner
- start/step/cancel
- mapping fingerprint
- outside-transaction HTTP
- idempotent upsert
- resume/failure/cooldown tests

## Phase 4 — Historical balance + resolver

- `queryBalancesAtInstants`
- differential test against existing query
- observation batch reader
- historical resolver
- archived account/asset support

## Phase 5 — Net worth + allocation

- daily service
- completeness/provenance
- gross assets/liabilities
- allocation
- API reads

## Phase 6 — Cash flow + decomposition

- event-time flow valuation
- month buckets
- day bridge
- snapshot reconciliation effect
- exact identity tests

## Phase 7 — Backup V8 + Security

- export/restore
- V1–V7 upgrades
- manual history only
- cache exclusion
- extend security script

## Phase 8 — UI

- `/analytics`
- data status
- refresh/resume
- net worth
- allocation
- cash flow
- bridge
- manual historical quote
- source attribution
- mobile/accessibility

Use installed frontend/React/design skills.

## Phase 9 — Full regression

Targeted first, then full gate。

## Phase 10 — Codex self-review

报告：
- exact SHA
- changed files
- migrations
- commands actually run
- test counts
- residual risks
- provider-policy assumptions

Push feature branch only after full local gate where runnable。

**不要 merge main / tag。**
Final source audit由独立 ChatGPT 完成。


---

# FILE: `19_NON_GOALS_FUTURE_CN.md`

# Non-goals & Future

V6.0不做：

## Investment accounting
- tax lots
- acquisition cost basis
- realized P&L
- unrealized P&L tax basis
- FIFO/LIFO/HIFO
- wash sale

## Performance
- TWR
- IRR/XIRR
- benchmark alpha
- risk-adjusted return
- drawdown analytics

这些需要独立语义设计，不能从 V6 bridge偷换概念。

## External providers
- automatic CoinMarketCap fallback
- DefiLlama fallback
- stock/ETF prices
- bank market data
- arbitrary user URL provider

未来 provider expansion必须独立审计 identity/provenance/license。

## Automation
- cron history refresh
- background worker
- auto-post
- auto-link

## Full historical snapshots
V6不创建 daily Ledger snapshots。
Historical balance始终从 frozen V1 snapshot/event语义派生。


---

# FILE: `20_RISK_REGISTER_CN.md`

# V6 Risk Register

| Risk | Severity | Required defense |
|---|---:|---|
| historical quotes accidentally mutate Ledger | Critical | no writer dependency; security/source audit |
| daily date uses UTC instead of App timezone | High | cutoff helper + timezone/DST tests |
| archived assets disappear from history | High | historical account set includes archived |
| missing quote shown as zero | High | completeValue=null + chart gap |
| current manual quote retroactively used | High | separate historical manual table |
| stablecoin silently treated USD | High | explicit provider/manual only |
| snapshot reset misclassified as cash flow | High | ReconDelta formula |
| exchange labeled realized P&L | High | trade/rebalance wording + non-goal |
| N days × N queries performance | High | batched balance/quote reads |
| provider call inside transaction | High | claim/http/commit architecture |
| mapping changes during HTTP | High | fingerprint re-check |
| long refresh times out | High | bounded resumable units |
| provider plan history limit assumed | Medium | no hardcoded plan depth |
| CoinGecko terms/license mismatch | High | rebuildable cache, attribution, no raw export, re-check at release |
| ECB revision ignored | Medium | upsert + correction refresh capability |
| chart float feeds financial math | High | exact server strings; number geometry only |
| provider cache bloats Backup | High | explicit V8 exclusion |
| AGENTS old rules block V6 | High | Phase 0 canonical update |
| Home Asset change invalidates materialized cache | Avoided | no daily materialization P0 |
| timezone change invalidates selected daily cache | Avoided | store raw UTC observations |
| liabilities distort allocation pie | Medium | separate liabilities |


---

# FILE: `21_FINAL_AUDIT_CHECKLIST_CN.md`

# V6 Final Audit Checklist

## Git / release
- [ ] feature branch exact SHA recorded
- [ ] base ancestry includes v5.1.0 unchanged
- [ ] no force/squash/rebase published history
- [ ] migration diff reviewed

## Ledger boundary
- [ ] historical code has no direct Ledger writer path
- [ ] provider refresh cannot create/edit/delete ledger_events/entries/snapshots
- [ ] native quantity semantics unchanged
- [ ] V1 balance differential tests pass

## Quote correctness
- [ ] crypto latest-prior, no future lookup
- [ ] ECB carry explicit
- [ ] no stablecoin peg
- [ ] no zero fill
- [ ] archived historical exposure supported
- [ ] manual historical separated from current manual

## Time
- [ ] App timezone cutoff
- [ ] DST cases
- [ ] last completed day
- [ ] event-time cash flow

## Decomposition
- [ ] exact algebraic identity
- [ ] transfer zero
- [ ] snapshot reconciliation explicit
- [ ] exchange not called realized P&L
- [ ] incomplete cannot reconcile as fake zero

## Provider refresh
- [ ] no HTTP in DB tx
- [ ] resumable bounded units
- [ ] mapping fingerprint rechecked
- [ ] malformed unit zero writes
- [ ] provider errors safe
- [ ] no SSR provider fetch

## Backup/security
- [ ] V8
- [ ] manual history included
- [ ] provider history excluded
- [ ] API key excluded
- [ ] purge works
- [ ] source attribution
- [ ] no raw provider export

## Performance
- [ ] no day-by-day N+1 DB query
- [ ] indexes used
- [ ] historical observation reads batched
- [ ] provider writes unit-batched

## CI
- [ ] format
- [ ] lint
- [ ] typecheck
- [ ] db:check
- [ ] unit
- [ ] integration
- [ ] build
- [ ] security
- [ ] E2E

## Audit verdict

Only if all blocking items pass:

```text
Talli V6.0 Final Audit: PASS
Release Gate: GO / RELEASE READY
```

Then follow ff-only release freeze; no new release business commit.


---

# FILE: `24_SOURCE_BASELINE_AUDIT_CN.md`

# Source Baseline Audit — v5.1.0

Audited repository:
`wentAInx/Talli`

Exact SHA:
`dd39ff06aa52c681f42a0165b2e7a0552c022d09`

## Existing balance engine

`src/db/queries/balances.ts`

Current source already implements:
- latest snapshot <= query time
- snapshot balance
- entries after snapshot only
- bigint aggregation

V6 should reuse semantics and add a batched multi-instant equivalent, not rewrite V1.

## Existing current valuation

`src/services/portfolio-valuation-service.ts`

Current:
```text
queryBalancesAt
→ group native quantities by asset
→ readQuoteResolverSnapshot
→ resolveCurrentQuote
→ calculatePortfolioValuation
```

V6 should mirror this as historical read path.

## Existing quote resolver

`src/domain/quote-math.ts`

Already provides:
- decimal text math
- manual exact current quote
- ECB EUR bridge
- crypto/USD + USD/home bridge
- identity
- no stablecoin peg
- freshness policy

Historical resolver should be separate so current freshness/cache semantics do not regress.

## Existing providers

`src/providers/coingecko.ts`
- `simple/price`
- demo/keyless
- server-side key
- crypto/USD

`src/providers/ecb.ts`
- `EXR`
- EUR reference
- latest observation only

V6 adds range methods; current methods remain.

## Existing valuation persistence

`src/db/queries/valuation.ts`
- bookValuationSettings
- priceProviderMappings
- manualPriceQuotes
- latestPriceQuotes
- priceProviderState

Do not overload `latestPriceQuotes` with time series.

## Existing Backup

`src/domain/backup.ts`
- current schema version = 7

V2 canonical backup spec explicitly excludes provider cache/state and includes user manual/config facts.
V6 follows the same principle:
- provider history cache excluded
- historical manual quotes included
- schema V8

## Existing AGENTS conflict

root `AGENTS.md` and `src/services/AGENTS.md` still contain pre-V6 prohibitions on historical valuation.
Phase 0 must narrow/update those statements while retaining all source-of-truth and provider-I/O guards.


---

# FILE: `25_DECISION_LOG_CN.md`

# V6 Decision Log

## D1 — Raw observations, not daily materialized valuations
Decision: persist provider observations; compute analytics on read.
Reason: avoids invalidation errors.

## D2 — App timezone EOD
Decision: daily point cutoff is local day end.
Reason: consistent with Talli accounting calendar.

## D3 — Hourly crypto preferred
Decision: fetch explicit hourly in <=100-day chunks, daily only where hourly unavailable.
Reason: allows deterministic latest-prior quote near local EOD.

## D4 — ECB carry-forward explicit
Decision: max 7 calendar days, status exposed.
Reason: weekends/holidays are normal; pretending same-day is wrong.

## D5 — No automatic crypto fallback
Decision: CoinGecko only automatic crypto provider in V6 P0.
Reason: provenance > convenience.

## D6 — Separate historical manual quote
Decision: current active manual quote does not apply retroactively.
Reason: temporal semantics differ.

## D7 — Provider history excluded from Backup
Decision: provider cache rebuildable; manual historical quote backed up.
Reason: same V2 cache/config separation.

## D8 — Archived historical exposure included
Decision: archive cannot erase past net worth.
Reason: availability constraint != historical fact.

## D9 — Incomplete chart gaps
Decision: incomplete total is null; known subtotal separate.
Reason: no false zero/false complete trend.

## D10 — Decomposition is algebraic attribution
Decision: cash flow / market&FX / trade-rebalance / reconciliation.
Reason: explains net-worth changes without inventing tax/cost-basis semantics.

## D11 — Explicit resumable refresh
Decision: foreground bounded run/unit model; no cron.
Reason: provider limits + self-hosted single process + existing architecture.

## D12 — No chart-derived financial math
Decision: chart `number` is geometry only.
Reason: exact values remain decimal text.
