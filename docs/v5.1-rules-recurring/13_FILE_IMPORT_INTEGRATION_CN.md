# V5 File Import Integration

## Existing V5 provenance remains authoritative

Before any automation projection:

```text
assertStoredFileImportCandidateProvenance(...)
```

must still pass.

Rules cannot weaken or replace it.

## Candidate read model

Extend file candidate read DTO with:

```text
automationProjection
recurringSuggestions
```

Both are derived.

Do not persist projection into:

```text
file_import_candidate_details
external_transaction_legs
external_source_objects
```

## Import form defaults

Rules may prefill:

```text
payee
category
tags
note
expense/income choice
```

User sees them before pressing Import.

## Import request

Extend File Import branch of `CandidateImportInput` to accept explicit:

```text
payee?: string|null
tagIds?: string[]
categoryId?: string|null   # already exists, preserve
note?: string|null         # already exists
```

These are user-confirmed Ledger metadata,
not source facts.

The server must:
- validate payee length/text；
- validate category same book + type；
- validate tags same book + active；
- continue validating source amount/account/date provenance；
- never allow rule metadata to override amount/account/date.

## Optional recurring link during import

UI may let user choose:

```text
Link to recurring occurrence:
Netflix · 2026-09-15
```

Request includes explicit:

```text
recurringItemId
occurrenceDate
confirmedRecurringLink=true
```

Server validates occurrence belongs to item and is open,
and recurring item account/event direction matches imported Ledger event.

Then within the same transaction:

```text
createLedgerEventIn
insert external_import_link
insert recurring_occurrence_link
mark candidate imported
```

Any late failure rolls all back.

## Match Existing

V5 `Match Existing` remains separate from recurring linking.

A file candidate can:
- Match Existing to Ledger source provenance；
then user may separately link that Ledger event to recurring occurrence.

Do not conflate:
`external_candidate_match_link`
with
`recurring_occurrence_link`.
