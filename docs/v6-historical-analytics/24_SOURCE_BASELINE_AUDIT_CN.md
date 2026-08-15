# Source Baseline Audit — v5.1.0

Audited repository:
`wentAInx/Talli`

Exact SHA:
`dd39ff06aa52c681f42a0165b2e7a0552c022d09`

## Existing balance engine

`src/db/queries/balances.ts`

Current source already implements:
- latest snapshot <= query time
- snapshot balance
- entries after snapshot only
- bigint aggregation

V6 should reuse semantics and add a batched multi-instant equivalent, not rewrite V1.

## Existing current valuation

`src/services/portfolio-valuation-service.ts`

Current:
```text
queryBalancesAt
→ group native quantities by asset
→ readQuoteResolverSnapshot
→ resolveCurrentQuote
→ calculatePortfolioValuation
```

V6 should mirror this as historical read path.

## Existing quote resolver

`src/domain/quote-math.ts`

Already provides:
- decimal text math
- manual exact current quote
- ECB EUR bridge
- crypto/USD + USD/home bridge
- identity
- no stablecoin peg
- freshness policy

Historical resolver should be separate so current freshness/cache semantics do not regress.

## Existing providers

`src/providers/coingecko.ts`
- `simple/price`
- demo/keyless
- server-side key
- crypto/USD

`src/providers/ecb.ts`
- `EXR`
- EUR reference
- latest observation only

V6 adds range methods; current methods remain.

## Existing valuation persistence

`src/db/queries/valuation.ts`
- bookValuationSettings
- priceProviderMappings
- manualPriceQuotes
- latestPriceQuotes
- priceProviderState

Do not overload `latestPriceQuotes` with time series.

## Existing Backup

`src/domain/backup.ts`
- current schema version = 7

V2 canonical backup spec explicitly excludes provider cache/state and includes user manual/config facts.
V6 follows the same principle:
- provider history cache excluded
- historical manual quotes included
- schema V8

## Existing AGENTS conflict

root `AGENTS.md` and `src/services/AGENTS.md` still contain pre-V6 prohibitions on historical valuation.
Phase 0 must narrow/update those statements while retaining all source-of-truth and provider-I/O guards.
