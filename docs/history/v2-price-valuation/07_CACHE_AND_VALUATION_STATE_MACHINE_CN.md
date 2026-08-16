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
