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
