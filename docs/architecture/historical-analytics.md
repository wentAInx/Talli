# Historical analytics

Historical analytics is a derived, cache-backed reading of Ledger quantities
and separate historical quote facts. It is not tax or investment accounting.

## Time and historical balances

**Design rule.** Natural days belong to the configured application timezone;
stored instants remain UTC.

**Invariant.** Completed-day analytics default to yesterday, avoiding an
in-progress current day. At each valuation instant, balances use the same
snapshot rule as every other Ledger read: latest snapshot at or before the
instant, then entries in `(snapshot.asOf, instant]`.

**Reason.** Server-local time changes and inconsistent snapshot semantics would
make the same report vary by deployment environment.

**Implementation consequence.** Range endpoints are derived in the app
timezone, including daylight-saving transitions, then queried as canonical UTC
instants. Balance reads stay exact `bigint` operations.

## Historical quote resolution

**Design rule.** Historical provider observations live in dedicated cache
tables; manual historical exact-pair quotes are user facts.

**Invariant.** A future observation is never used. Manual exact-pair quotes win
for their valuation date. Automatic crypto resolution uses the latest prior
hourly observation within 2 hours, then a daily observation within 26 hours.
ECB reference data may carry across a weekend for at most 7 days.

Missing quotes for nonzero positions create explicit gaps and an incomplete
result. They never become zero, and stablecoins have no peg assumption.

**Reason.** Time-bounded latest-prior selection prevents look-ahead and makes
the evidence behind each point reproducible.

## Analytics products

- **Net worth:** known Home value plus an independent completeness flag;
  liabilities remain visible.
- **Allocation:** positive known market value only; liabilities do not create
  negative slices.
- **External cash flow:** classifies external Ledger effects at event time;
  transfer and exchange principal remain internal.
- **Period decomposition:** separates cash flow, trade/rebalance, market, and
  reconciliation effects with an exact bridge identity.

These views do not calculate cost basis, tax lots, FIFO/LIFO, realized tax
profit or loss, or performance attribution suitable for regulated reporting.

## Refresh orchestration

**Design rule.** Historical refresh is an explicit, bounded, resumable foreground
workflow.

**Invariant.** There is no cron job or hidden background continuation. Provider
HTTP runs outside database write transactions; each bounded unit commits
atomically. Mapping changes invalidate incompatible cached history.

**Reason.** A self-hosted user should know when external access occurs. A failed
provider call may leave earlier bounded units committed, but the run remains
incomplete and resumable; missing units must never be presented as a completed
range.

**Implementation consequence.** Analytics GETs and server rendering remain
cache-only. Refresh run/unit state is operational and excluded from backups.

## Historical exposure

Archived accounts and assets remain eligible when they had quantity during the
requested interval. Archive state controls current editing and display; it does
not rewrite history.

## Current source pointers

- `src/domain/historical-analytics.ts`
- `src/domain/historical-quote-math.ts`
- `src/domain/historical-refresh-plan.ts`
- `src/services/historical-analytics-service.ts`
- `src/services/historical-refresh-service.ts`
