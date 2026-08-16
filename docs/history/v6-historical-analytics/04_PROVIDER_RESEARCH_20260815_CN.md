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
