# V5.1 Acceptance Matrix

## A. Frozen regression

All must pass:

```text
V1 Ledger
V2 valuation
V3 Kraken
V4 Ethereum
V4.1 Base/Arbitrum
V5 file import/match/reconcile
```

## B. Migration

- 0000–0007 untouched；
- V5 DB → V5.1 exact old facts；
- 0008 additive tables；
- repeated startup stable；
- FK check empty。

## C. Rule ordering

R-001 stage order pre→default→post.
R-002 within stage sort_order then id.
R-003 later scalar action wins.
R-004 tags stable union.
R-005 ALL and ANY.
R-006 negated condition.
R-007 disabled rule ignored.
R-008 evaluator deterministic.

## D. Rule fields/operators

- source payee vs projected payee distinction；
- text equals/contains/start/end/empty；
- case-insensitive NFKC normalization；
- amount exact bigint eq/gt/gte/lt/lte/between；
- excess precision rule amount reject；
- profile/account/format/direction/identity filters；
- no regex accepted。

## E. Rule actions

- payee projection；
- category projection type-safe；
- tags same-book；
- note set/append；
- expense/out and income/in suggestion；
- Transfer/Exchange suggestion reject；
- amount/date/account action impossible。

## F. Source isolation

Evaluate and preview 100 candidates:

```text
external_source_objects unchanged
external_transaction_candidates unchanged
file_import_candidate_details unchanged
external_transaction_legs unchanged
ledger_events unchanged
ledger_entries unchanged
```

## G. Rule preview & candidate integration

- preview read-only；
- new rule changes projection without candidate rewrite；
- candidate page shows applied rules；
- imported/matched/source_changed remain non-importable；
- source correction recomputes projection from new facts。

## H. Import metadata

- rule-prefilled payee/category/tags/note can be explicitly imported；
- server validates all IDs/book/category type；
- source amount/date/account remain authoritative；
- V5 corruption defense still catches candidate/source mismatch；
- rule cannot override source amount。

## I. Recurrence generation

- daily interval；
- weekly interval/weekday；
- monthly fixed；
- monthly 31 skips absent month；
- monthly last-day；
- yearly；
- Feb29 skips non-leap；
- starts/ends；
- inactive item；
- generation cap；
- deterministic date-only behavior。

## J. Amount expectations

Exact:
- exact magnitude only.

Approx:
- explicit tolerance bps；
- bigint bounds；
- boundary inclusive；
- no float.

Range:
- min/max inclusive；
- min>max reject；
- zero/negative definition reject.

## K. Recurring suggestions

- same account required；
- event type/direction required；
- date window；
- payee modes；
- amount modes；
- already linked event excluded；
- skipped occurrence excluded；
- file candidate uses exact V5 provenance；
- rule-projected payee may improve suggestion；
- no auto-link.

## L. Explicit link/unlink/skip

- link existing creates no Ledger write；
- link invalid account/type reject；
- one Ledger event cannot satisfy two occurrences；
- linked occurrence cannot skip；
- skipped occurrence cannot link；
- explicit unskip works；
- linked event delete blocked until unlink；
- normal Ledger edit does not rewrite recurring definition.

## M. Explicit Post Occurrence

- expense uses V1 writer；
- income uses V1 writer；
- actual amount explicit；
- event + occurrence link same transaction；
- late link failure rolls event back；
- approximate expectation never forces expected amount into Ledger。

## N. File Import + Recurring atomic path

Candidate import with explicit recurring link:
- V5 provenance valid；
- create Ledger + external import link + recurring link + candidate status atomically；
- forced recurring-link insert failure rolls Ledger/external link/status back。

## O. Backup schemaVersion7

- export 7；
- restore 1..7；
- rules roundtrip；
- recurring definitions/tags/links/skips roundtrip；
- derived projection/suggestions absent；
- invalid rule operator/value reject；
- cross-book refs reject；
- invalid atomic expectation reject；
- invalid occurrence date reject；
- link+skip conflict reject；
- late V7 insert full rollback。

## P. E2E

Desktop Chromium:
1. create rule cleaning payee；
2. category/tag rule；
3. preview candidate before/after；
4. import candidate with suggested metadata；
5. create monthly recurring from Ledger；
6. view upcoming；
7. import another candidate and explicitly link occurrence；
8. skip next occurrence；
9. explicit post another occurrence；
10. Backup schemaVersion7。

Mobile WebKit:
- Automation nav；
- Rule create/preview；
- recurring list/detail；
- candidate suggestion/import；
- no horizontal overflow。

Existing V5 import and V3/V4 sync E2E all pass.

## Final gate

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```
