# Security & Correctness

## No network

Rule and recurring modules perform no HTTP.

No external AI/ML service.

## Text matching

No user regex in V5.1 to avoid regex complexity/ReDoS risk.

Use bounded strings and deterministic normalization.

## Amounts

All monetary expectation values persisted as bigint decimal TEXT.

No floating-point amount comparison.

Tolerance basis points may be integer number,
but bounds are computed with bigint.

Define rounding conservatively and test it:
- lower bound floor;
- upper bound ceil;
or another documented exact integer policy.

## Input bounds

Rule:
- max conditions per rule e.g. 50；
- max actions per rule e.g. 20；
- max rule name/value text；
- max enabled rules per book e.g. 1000。

Recurring:
- interval bounded；
- date window <=31；
- occurrence generation hard cap 10,000/call；
- tolerance bps bounded 0..10000。

## No source mutation

Static/security tests should detect rule module writing:
- external_source_objects；
- external_transaction_legs；
- file_import_candidate_details；
- ledger tables。

Only RuleService CRUD may write automation tables.

## Projection trust

Client-provided projected values are not security authority.

Import server independently validates:
- V5 provenance；
- category/tag/book；
- explicit account/event type；
- actual amount from source candidate.

## Recurring link

Client cannot invent arbitrary occurrence date.
Server recomputes recurrence and verifies date is valid.

## Backup

No derived projection cache means no stale rule computation can become restored financial truth.
