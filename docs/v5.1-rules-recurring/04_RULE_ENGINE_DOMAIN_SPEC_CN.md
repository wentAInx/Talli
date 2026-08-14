# Rule Engine Domain Spec

## Target scope

V5.1 only:

```text
file_import_candidate
```

Schema keeps an explicit `target_scope` so future versions can add other sources
through a new audited migration rather than silently applying bank rules to Kraken/EVM.

## Rule ordering

Use three stages:

```text
pre
default
post
```

Within each stage:

```text
sort_order ASC
id ASC
```

Rules run sequentially.

Later scalar action wins:

```text
payee
category
note
suggested event type
```

Tags use stable union, preserving first-add order.

## Match mode

Each rule:

```text
match_mode = all | any
```

Each condition can be negated.

No arbitrary nested boolean tree in V5.1.

## Evaluation context

Immutable fields:

```text
provider=file_import
connectionId
fileProfileId
sourceFormat
targetAccountId
assetId
assetCode
assetScale
direction in|out
sourcePayee
sourceMemo
sourceAmountAtomic
sourceDate
identityStrength
candidateStatus
```

Mutable projection fields:

```text
projectedPayee
projectedNote
projectedCategoryId
projectedTagIds
projectedEventType
```

A later condition may inspect `projected_payee`,
while `source_payee` always means the original imported value.

## Rule output

```ts
{
  projectedPayee,
  projectedCategoryId,
  projectedTagIds,
  projectedNote,
  projectedEventType,
  appliedRuleIds,
  warnings
}
```

Evaluation is pure/derived; no DB financial writes.

## Candidate statuses

Projection may be calculated for display on any file candidate,
but actionable import defaults are only for:

```text
pending
needs_mapping
```

Do not make imported/matched/source_changed re-importable.
