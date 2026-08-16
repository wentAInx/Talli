# Current valuation

Talli's valuation layer estimates a portfolio in one explicit fiat Home Asset
without changing native Ledger quantities.

## Separate facts and arithmetic

**Design rule.** Ledger quantities and price/rate facts have different storage
and arithmetic models.

**Invariant.** Ledger amounts remain atomic integer `TEXT` plus `bigint`.
Prices and rates are validated positive plain-decimal `TEXT` values calculated
with high-precision `decimal.js` arithmetic. The current decimal context uses
precision 80 and `ROUND_HALF_UP`; division or inversion may round at that
precision, while user-facing display rounding is a separate final step.

**Reason.** A price is a ratio, not an executed Ledger quantity. Conflating the
two models either loses money precision or gives derived estimates accounting
authority.

**Implementation consequence.** Quote math composes explicit legs as decimals;
it never writes the result back to accounts, events, entries, or snapshots.

## Home Asset and quote resolution

**Design rule.** Home Asset is one active fiat asset selected by the user.

Current automatic paths are:

- mapped crypto to USD through CoinGecko market observations;
- EUR reference legs from the European Central Bank, composed into supported
  fiat cross rates; and
- an exact manual `base -> Home` quote, which overrides an automatic path.

**Invariant.** There is no stablecoin peg shortcut. `USDT`, `USDC`, and other
stablecoins require the same explicit market-quote path as other crypto assets.

**Reason.** A symbol or marketing claim is not a price fact. Explicit legs make
the estimate explainable and keep provider provenance visible.

## Completeness and freshness

**Invariant.** A missing usable quote for a nonzero position marks valuation as
incomplete. Missing value never becomes zero. Fresh, stale, missing, and error
states remain distinguishable.

**Implementation consequence.** The UI keeps native quantities primary, marks
Home-denominated estimates with `≈`, and exposes quote provenance and
completeness. It must not render a confidently complete total when a nonzero
position is unresolved.

## Provider boundary

**Design rule.** Provider access is server-only and explicitly initiated.

**Invariant.** Provider HTTP runs outside SQLite write transactions. Server
rendering, reports, quote resolution, and portfolio valuation are cache-only
and never wait for an external provider.

**Reason.** Network latency or provider failure must not hold database locks or
make ordinary reads nondeterministic.

**Implementation consequence.** Refresh services fetch first, validate and
normalize responses, then persist bounded facts. Credentials remain runtime
environment values and are excluded from SQLite, backups, logs, React props,
and client bundles.

## Current source pointers

- `src/domain/price-decimal.ts`
- `src/domain/quote-math.ts`
- `src/domain/valuation.ts`
- `src/services/quote-resolver-service.ts`
- `src/services/portfolio-valuation-service.ts`
- `src/services/price-refresh-service.ts`
