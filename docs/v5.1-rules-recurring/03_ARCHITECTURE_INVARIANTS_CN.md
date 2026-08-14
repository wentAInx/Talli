# V5.1 Architecture Invariants

## Layering

```text
V5 Source/Candidate = external financial evidence
Rules              = derived classification projection
Recurring          = expected planning metadata
Ledger             = confirmed financial facts
```

不能把四层混在一起。

## Rule projection

Base projection 来自 immutable candidate：

```text
sourcePayee
projectedPayee
memo
categoryId=null
tagIds=[]
suggestedEventType=unknown
```

Rules 只改变 projected fields。

不得修改：

```text
candidate id/stableKey/sourceFingerprint
occurredAt
target account
asset
leg amountText
leg amountAtomic
source payload
```

## Recurring

Recurring item 持有“未来应发生什么”的定义。

Occurrence 是函数结果：

```text
item + date range → generated occurrences
```

不为每个未来日期插入 DB row。

DB 只保存用户明确产生的事实：

```text
definition
explicit skip
explicit ledger link
```

## Explicitness

三种写入边界：

```text
Candidate Explicit Import → V1 writer
Recurring Explicit Post   → V1 writer + occurrence link
Explicit Link Existing    → recurring link only, no Ledger mutation
```

## No historical rewrite

Rule changes只影响之后的 projection。
不得 retroactively 修改 imported Ledger。

Recurring item 修改也不得改写已 linked Ledger event。
