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
