# V4.1 → V5.0 Migration Plan

已发布 migrations 0000–0006 全部 frozen。V5 新增 migration，例如：

```text
0007_v5_financial_file_import
```

需要 generalize：

### external_connections.provider

```text
kraken | evm_wallet | file_import
```

file_import：

```text
source_key = file:<connectionId>
credential_ref = local:file-import
```

### external_source_objects.object_type

新增：

```text
file_transaction
```

### external_transaction_candidates.status

新增：

```text
matched
```

新增 V5 tables：
- file_import_profiles
- file_import_batches
- file_import_source_details
- file_import_batch_source_objects
- file_import_candidate_details
- external_candidate_match_links
- file_import_balance_observation_details

SQLite rebuild discipline：
1. `PRAGMA foreign_keys=OFF` outside tx；
2. `BEGIN IMMEDIATE`；
3. create target；
4. exact copy old rows；
5. row-count guard；
6. drop/rename/reindex；
7. create V5 tables；
8. COMMIT；
9. foreign_keys=ON；
10. `foreign_key_check=[]`。

必须 byte-for-byte preserving existing V1/V2/V3/V4/V4.1 business facts。
Migration 不生成任何 file-import backfill。
