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
