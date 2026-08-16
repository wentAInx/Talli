# Backup V8 Specification

## Version

V5.1 current:
```text
BACKUP_SCHEMA_VERSION = 7
```

V6:
```text
BACKUP_SCHEMA_VERSION = 8
```

## V8新增必须备份

```text
historicalManualQuotes
```

理由：
- user-authored valuation input；
- 无法由 provider自动重建；
- 与 current manual quote一样属于用户配置/事实。

## V8明确排除

```text
historical_price_quotes
historical_fx_quotes
historical_refresh_runs
historical_refresh_units
provider API usage cache
```

这些是：
- provider-derived cache
- operational state
- 可重建

也排除所有 API keys。

## V1–V7 upgrade

in-memory：
```text
historicalManualQuotes = []
```

其他字段保持既有 version upgrade链。

## Validation

每个 manual historical quote：
- id nonempty
- base/quote asset exist
- base != quote
- valuationDate real `YYYY-MM-DD`
- positive canonical decimal
- note bounded
- createdAt/updatedAt canonical UTC
- unique `(baseAssetId, quoteAssetId, valuationDate)`

## Restore

- full validation before writes；
- empty/allowed target semantics沿用；
- one restore transaction；
- failure rollback everything；
- provider historical cache恢复后为空；
- foreign_key_check；
- row counts/key relations。

## Reachability invariant

任何正常 manual historical quote mutation 成功后，立即 export V8 必须成功。
