# V5.1 UI / UX

## Navigation

Add:

```text
Automation
```

Route:

```text
/automation
```

Tabs:

```text
Rules
Recurring
```

## Rules list

Show:

```text
Enabled
Stage
Name
Scope
Conditions summary
Actions summary
Matched unresolved candidates
```

Actions:
- Create
- Edit
- Disable/Enable
- Move order
- Preview
- Duplicate rule

## Rule editor

Left:

```text
Stage pre/default/post
ALL / ANY
conditions
actions
```

Right:

```text
Preview
Matched: N

Candidate
Before
After
Applied rule order
```

No button called “Apply to Ledger”.

## Candidate page

Add card:

```text
Automation suggestions

Payee: AMAZON... → Amazon
Category: Shopping
Tags: Online
Suggested type: Expense

Applied rules:
1. Clean Amazon
2. Categorize Amazon
```

Fields in Import form are prefilled but editable.

## Recurring list

Each item:

```text
Netflix
Expense · USD Card
Approx 15.99 USD
Monthly · 15th
Next: 2026-09-15
Status: upcoming
```

Filters:

```text
active
overdue
upcoming
income
expense
```

## Recurring detail

Show bounded occurrence timeline:

```text
Aug 15  linked → Ledger tx
Sep 15  upcoming
Oct 15  upcoming
```

Actions:

```text
Link existing
Unlink
Skip
Undo skip
Post occurrence
Archive item
```

## Create recurring item

Can start from:
- Automation page；
- existing Ledger transaction；
- file candidate。

Starting from transaction only pre-fills data.
User must choose/confirm cadence and amount mode.

## Candidate recurring suggestion

Example:

```text
Likely recurring occurrence

Netflix · Sep 15
expected ~15.99 USD
candidate 15.99 USD · Sep 15

[Link when importing]
```

No automatic link.

## Mobile

Rules editor uses stacked cards, not wide table dependency.
Recurring timeline fits WebKit without horizontal page overflow.
Critical desktop + mobile paths required.
