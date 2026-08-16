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
