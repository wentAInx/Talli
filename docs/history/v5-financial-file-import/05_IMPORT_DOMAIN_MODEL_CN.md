# File Import Domain Model

## File Import Profile

Persistent source definition：

```text
external_connection
provider = file_import
source_key = file:<connectionId>
credential_ref = local:file-import
```

Subtype：`file_import_profiles`。

Target account immutable；更换账户或 materially different CSV mapping 时新建 profile。

Provider asset key：

```text
file:<connectionId>:target
```

Profile 创建时，基于用户明确选择的 target account/asset 创建 external asset/account mapping。
这不是 symbol auto-map。

## Source object

扩展：

```text
external_source_objects.object_type += file_transaction
```

source payload 只保存 selected/audited raw fields。

## Candidate status

扩展：

```text
matched
```

完整状态：

```text
pending
needs_mapping
ignored
imported
matched
unsupported
source_changed
```

语义：

```text
imported → external_import_link
matched  → external_candidate_match_link
source_changed → exactly one provenance kind
```

## Direction

```text
in / out
```

只表示 statement account direction，不等于 income/expense。

Allowed：

```text
in  → income | transfer
out → expense | transfer
```

## Date precision

```text
timestamp
day
```

Date-only source：
- preserve source text；
- profile timezone local 12:00；
- canonical UTC occurredAt；
- UI 显示 date-only；
- matching按 calendar date。

## Identity strength

```text
strong
weak
```

Strong：
OFX FITID、safe CAMT references、CSV explicit stable ID。

Weak：
normalized signature + occurrence ordinal。
