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
