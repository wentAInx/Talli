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
