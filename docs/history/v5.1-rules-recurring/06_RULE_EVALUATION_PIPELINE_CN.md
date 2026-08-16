# Rule Evaluation Pipeline

## Runtime flow

```text
Candidate/source
→ existing V5 provenance validation
→ build immutable RuleEvaluationContext
→ load enabled rules for book/scope
→ sort pre/default/post + sort_order + id
→ evaluate sequentially
→ derived projection
→ UI
```

No source/candidate persistence occurs.

## Stage semantics

`pre`:
typically payee cleanup.

`default`:
typically category/tags/event-type.

`post`:
explicit override.

All stages may technically use all allowed actions,
but UI should explain common intent.

## Conflict rule

For scalar projected field:

```text
last matching action wins
```

For tags:

```text
union; no duplicate
```

## Conditions and projection mutation

Example:

```text
Rule A [pre]
IF source_payee contains "AMZN"
THEN set_payee "Amazon"

Rule B [default]
IF projected_payee equals "Amazon"
THEN set_category Shopping
```

B sees A's projected payee.
Neither changes the V5 source payee.

## Preview

Rule editor must support preview before save/apply:

```text
matched candidate count
first 20 sample projections
before → after
applied rule sequence
```

Preview is read-only.

## Existing candidates

Saving a rule requires no batch rewrite.
Current unresolved candidate pages immediately reflect new projection on next read.

No "apply actions to Ledger" button in V5.1.

## Determinism

Same:
- DB rules
- candidate source facts
- app version

must produce byte-equivalent projection ordering.

No current time in evaluator except if explicitly needed for display outside the rule result.
