# Ledger Boundary & Atomicity

## Rules

Rule CRUD/evaluation never invokes V1 writer.

No rule action can produce:
- Ledger event；
- snapshot；
- external import link；
- recurring link。

## Recurring explicit link

Link Existing:

```text
recurring link write only
Ledger unchanged
```

## Recurring explicit post

One transaction:

```text
validate recurring item
validate generated occurrence
validate actual amount
createLedgerEventIn(...)
insert recurring_occurrence_link
```

If link insert fails:
Ledger event rolls back.

## Candidate import + recurring link

One transaction:

```text
V5 provenance revalidation
explicit metadata validation
recurring occurrence validation
createLedgerEventIn
external_import_link
recurring_occurrence_link
candidate imported
```

Any failure rolls all layers back.

## Ledger deletion

If a Ledger event has recurring occurrence link:
delete should fail with clear service error until user unlinks.

This is provenance safety, not an attempt to prevent normal Ledger edits.

Ledger edits may remain allowed; recurring link is a user assertion of occurrence identity,
not an exact-source binding like V5 Match Existing.

## Recurring actual amount

Explicit post/import actual amount is whatever user/source confirms.

Recurring expectation does not overwrite actual amount.

Example:

```text
Recurring approx:
Netflix ≈ 15.99

Actual:
16.49

Ledger:
16.49
```

Recurring remains expectation.
