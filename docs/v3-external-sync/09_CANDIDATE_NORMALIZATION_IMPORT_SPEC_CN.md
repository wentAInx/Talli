# Candidate Normalization & Import

## Trade fill → Exchange suggestion

通过 AssetPairs metadata 得 BASE/QUOTE。

Buy：

```text
source      = -cost QUOTE
destination = +vol BASE
```

Sell：

```text
source      = -vol BASE
destination = +cost QUOTE
```

只是 candidate legs，不能自动写 Ledger。

## Fee

必须有明确 asset evidence：

- linked Kraken ledger row
- provider 明确字段且官方语义可靠
- 用户 Review 手动选择

不能因经验假设 fee currency。

无法安全确定：

```text
fee unresolved
candidate needs review
```

## Multiple fills

V3.2 P0：

```text
one Kraken trade fill = one candidate
```

可以按 `ordertxid` 分组显示，但不默认合并。

## Non-trade ledger

deposit/withdrawal/transfer/adjustment 等只产生 suggestion。

不自动把：

```text
deposit = income
withdrawal = expense
```

## Mapping before import

所有 required legs 必须：

- mapped asset
- selected account
- account.asset matches
- exact amount→atomic
- no excess precision
- V1 invariant valid

## Atomic import

必须避免 crash 导致 duplicate：

```text
BEGIN IMMEDIATE
→ lock candidate
→ verify no import link
→ resolve mappings
→ call SAME executor-scoped V1 invariant/writer
→ insert import link
→ mark imported
→ COMMIT
```

若当前 V1 command 总是自开 transaction，允许最小内部重构：

```text
public createX(input)
  -> transaction(executor => createXIn(executor, input))
```

V3 调同一个 `createXIn`。

不复制 invariant，不直接 bypass insert ledger_entries。

## Ignore

```text
status = ignored
```

保留 source。

re-sync 不自动恢复 pending。

## Provenance

Import link：

```text
candidate_id UNIQUE
ledger_event_id UNIQUE
imported_at
import_fingerprint
```

删除 Ledger event 后不得自动 re-import。
P0 可保留 provenance/tombstone 语义并要求明确 Re-import。

## Balance reconcile

Observation reconciliation 不走 candidate import。

用户明确确认后调用现有 reconciliation path，仍写 snapshot。
