# Recurring Domain Spec

## Meaning

Recurring item = expectation template, not transaction.

Supported:

```text
expense
income
```

One item is bound to:

```text
book
account
asset
```

This makes amount scale unambiguous.

## Required fields

```text
name
account
eventType expense|income
frequency
interval
anchorDate
amountMode
date window
```

Optional:

```text
payee
payeeMatchMode
category
tags
note
startsOn
endsOn
```

## Amount modes

Store positive atomic magnitude.

### exact

```text
amount_atomic_text
```

### approx

```text
amount_atomic_text
tolerance_bps
```

Tolerance is explicit user input.
No hidden default financial tolerance.

Bounds computed with bigint only.

### range

```text
min_amount_atomic_text
max_amount_atomic_text
```

Require:

```text
0 < min <= max
```

## Payee matching

```text
any
exact
contains
```

Uses same deterministic text normalization as Rules.

## Date window

User-configurable:

```text
before_days
after_days
```

Recommended UI initial value:

```text
2 / 2
```

This is matching convenience only, not a Ledger date rewrite rule.

## Lifecycle

Use `is_active`.

Do not hard-delete items with linked/skipped history from normal UI;
archive instead.

## Asset lock

Because recurring amounts are stored atomic under an asset scale,
an account with any recurring item must not silently change asset.

Extend account fact-lock logic accordingly.
