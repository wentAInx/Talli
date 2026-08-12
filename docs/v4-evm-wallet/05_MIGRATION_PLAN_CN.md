# V3 → V4 Migration Plan

V3 `external_connections` 只有 Kraken，且 identity 是 `UNIQUE(book,provider,credential_ref)`；V4 多个 wallet 必须共用 `env:alchemy.primary`，所以 identity 改为 `UNIQUE(book,provider,source_key)`。

V3 Kraken rows 迁移后必须：

```text
provider      = kraken
credentialRef = env:kraken.primary
sourceKey     = kraken:primary
```

所有 connection/source/candidate/import/ledger IDs 必须原样保留。

因为 CHECK/UNIQUE 变化，SQLite 需要 forward-only table rebuild。不得修改已发布 V1/V2/V3 migration。

安全原则：

1. `PRAGMA foreign_keys=OFF` 必须在 transaction 外；
2. `BEGIN IMMEDIATE`；
3. create `external_connections_v4`；
4. exact copy + inject `source_key`；
5. row-count check；
6. replace table + recreate indexes；
7. `external_source_objects` 同理扩展 object type；
8. create EVM tables；
9. commit；
10. `PRAGMA foreign_keys=ON`；
11. `foreign_key_check` 必须 empty。

若现有 migration runner 无法安全控制 PRAGMA，停止并报告，不做半安全 workaround。

Acceptance：真实 V3-shaped fixture migration 后 Kraken sync/import/backup 全绿，所有 V3 IDs 与 Ledger facts 不变。
