# Backup V2 & V1 Compatibility Specification

# 1. 目标

V2 不能让用户已有 V1 JSON backup 失效。

当前 V1 backup `schemaVersion=1`；V2 export 应升级为：

```text
schemaVersion = 2
```

# 2. V2 Backup 必须包含

在 V1 `data` 基础上新增：

```text
bookValuationSettings
priceProviderMappings
manualPriceQuotes
```

这些是用户配置/事实，必须无损备份。

# 3. V2 Backup 明确排除

```text
latestPriceQuotes
priceProviderState
```

原因：它们是外部 provider 可重建 cache/operational state，不是用户账本或配置事实。

API key 也绝不进入 backup。

# 4. Restore 兼容两种输入

```text
schemaVersion=1  -> in-memory upgrade -> validated V2 restore model
schemaVersion=2  -> native V2 validation
```

不要用“先把 V1 JSON 写进 DB，再补救”的方式绕过验证。

# 5. V1 -> V2 in-memory upgrade

V1 数据完整保留；新增字段默认：

```text
bookValuationSettings: []
manualPriceQuotes: []
priceProviderMappings: inferred canonical seed mappings where safe
```

Mapping inference 仅对明确匹配的资产做：

- asset type 与 expected type 相符。
- code case-insensitive 等于 canonical seed code。

若不满足，不猜。

Home Asset：

- 若 default book 存在，优先寻找 non-archived fiat `CNY`。
- 否则 non-archived fiat `USD`。
- 否则按 `(sortOrder, code)` 的第一个 non-archived fiat。
- 若没有 fiat，则不创建 setting；V2 UI 显示“先选择 Home Asset”。

# 6. Restore target

V2 仍保持 V1 原则：

- 仅 empty 或 unchanged seed-only target。
- 不做 merge。
- preview 先全量 validate。
- commit 使用 `BEGIN IMMEDIATE`。
- foreign_key_check。
- row counts / key relations 校验。
- 中途失败完整 rollback。

`clearRestoreTarget()` 必须按 FK 顺序处理 V2 表：

```text
latest_price_quotes          (derived)
price_provider_state         (derived)
manual_price_quotes
price_provider_mappings
book_valuation_settings
... then V1 rows in existing safe order
```

# 7. Seed-only 判定升级

V2 seed-only DB 会多出：

- seed valuation setting（通常 Default Book -> CNY）。
- canonical price provider mappings。
- `seed_schema_version=2`。

Restore target detector 必须识别新的 V2 seed-only 形态，同时不要误把用户改过 Home Asset/mapping 的 DB 当 seed-only。

# 8. Backup validation

V2 新增验证：

- Home asset 属于存在的 book/asset。
- Home asset 必须 fiat；若 archived 可允许 restore 历史配置但 app 启动时要求修复，推荐直接在 backup validation 阻止 active setting 指向 archived asset。
- Provider mapping asset 存在，provider/key 合法。
- CoinGecko mapping assetType=crypto。
- ECB mapping assetType=fiat。
- manual quote pair asset 存在、base != quote、rate positive decimal。
- 每 pair 最多一个 active manual quote。

# 9. 必须测试

- V2 export 中 atomic ledger strings 一字不变。
- V2 export 不含 cache/provider state/API key。
- V1 fixture backup 可以 restore 到空 V2 DB。
- V1 restore 后原 V1 balances/events/snapshots 与 fixture 一致。
- V2 config round-trip exact。
- corrupted V2 config 在任何 write 前拒绝。
- mid-restore failure rollback V1 + V2 所有表。
