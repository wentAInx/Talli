# Recurring Matching & Linking

## Match candidates

V5.1 may generate suggestions from:

```text
A. Existing V1 Ledger expense/income events
B. Unresolved V5 file_import candidates
```

For file candidate matching, use:
- immutable exact amount/date/account;
- rule-projected payee when available.

## Ledger suggestion hard filters

Recurring item:

```text
account exact
eventType exact
same book
```

Ledger event must have the corresponding exact main account entry sign:

```text
expense → negative
income  → positive
```

Amount magnitude must satisfy recurring amount expectation.

Event date must be within configured occurrence date window.

If payee match mode != any, payee must match.

Already-linked Ledger event cannot satisfy a second occurrence.

## Candidate suggestion hard filters

File candidate:
- provider=file_import；
- target account exact；
- direction matches event type；
- exact source/candidate provenance passes；
- amount matches expectation；
- date inside window；
- payee criteria matches source/rule projection；
- status actionable.

## Scoring

Suggestions are deterministic, no ML.

Suggested components:

```text
date exact             highest
date ±1
date ±2...
payee exact
amount exact center
amount inside approx/range
```

Use integer score only; money comparison remains bigint.

## No automatic link

No matter how high score is:

```text
no DB link until user confirms
```

## Explicit Link Existing

One transaction:

```text
validate recurring item/occurrence
validate event same book/account/type
insert recurring_occurrence_link
```

No Ledger update.

A user-confirmed link may be allowed even if amount/date is outside suggestion tolerance,
because user is asserting occurrence identity.
UI must warn.
Server still requires same account and expense/income direction.

## Unlink

Explicit unlink removes the recurring link only.
Ledger remains unchanged.

## Delete Ledger event

Ledger event referenced by recurring link should be protected by FK RESTRICT / service error.

User must unlink first, preserving visible provenance.

## Skip Occurrence

Explicit:

```text
recurring_occurrence_skips
```

Cannot skip a linked occurrence.
Cannot link a skipped occurrence until skip is explicitly removed.

## Explicit Post Occurrence

For an unlinked/unskipped occurrence:

```text
user enters/confirms actual amount
→ V1 expense/income writer
→ recurring link
```

Both happen in one SQLite transaction.

Exact mode may prefill amount.
Approx/range still requires explicit actual amount confirmation.

No automatic posting by date.
