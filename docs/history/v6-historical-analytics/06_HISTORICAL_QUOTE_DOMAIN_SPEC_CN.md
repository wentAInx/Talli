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
