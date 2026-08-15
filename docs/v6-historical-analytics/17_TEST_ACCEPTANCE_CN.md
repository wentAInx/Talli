# V6 Test & Acceptance Specification

## A. Migration / regression

1. V5.1 DB -> V6 migration PASS。
2. Ledger rows byte/semantic unchanged。
3. current V2 valuation still passes。
4. V3/V4/V5/V5.1 regression suites pass。
5. new tables initially empty。

## B. Time semantics

- Asia/Shanghai day cutoff。
- America/Los_Angeles day cutoff。
- DST spring-forward day。
- DST fall-back day。
- today excluded from default historical series。
- event at exact next local midnight belongs next day。

## C. Balance differential

随机 deterministic fixtures：
- snapshots
- backdated entries
- same timestamp entries
- multiple snapshots

对 100+ query instants：
```text
batched result == existing queryBalancesAt
```

## D. CoinGecko parser

- hourly valid payload。
- daily valid payload。
- malformed JSON -> zero writes。
- invalid timestamp -> zero writes。
- non-positive/invalid price -> zero writes。
- duplicate same timestamp same payload idempotent。
- later correction same timestamp updates cache deterministically。
- 429 normalized/cooldown。
- pro/demo header server-only。
- 100-day planning boundary。
- before 2018 hourly split to daily。

No live HTTP in tests。

## E. ECB parser

- multi-currency CSV。
- start/end range。
- weekend gap accepted。
- invalid date/rate rejected。
- unknown currency rejected/ignored according to strict spec。
- cross-rate exact decimal。
- revision upsert。
- no raw CSV persisted。

## F. Resolver

- identity。
- manual exact pair precedence。
- hourly latest prior。
- never future quote。
- hourly >2h missing。
- daily fallback <=26h。
- ECB same-day。
- ECB weekend carry。
- ECB >7d missing。
- crypto/USD × USD/home。
- archived asset resolves。
- custom without manual = unsupported。
- stablecoin not identity USD。

## G. Net worth

Fixtures：
- multiple fiat
- BTC/ETH
- archived historical account
- negative liability
- zero balance missing mapping
- nonzero missing mapping

Assert:
- exact decimal strings；
- gross assets/liabilities；
- known vs complete；
- incomplete chart point = null completeValue。

## H. Cash flow

- income main included
- expense main included
- fee included
- transfer principal excluded
- exchange principal excluded
- App timezone month bucket
- event-time historical price
- missing price makes bucket incomplete

## I. Decomposition algebra

For every complete fixture:

```text
end - start
==
marketAndFx
+ income
+ expense
+ fees
+ internalTransfer
+ tradeRebalance
+ reconciliation
```

exact decimal equality before display rounding。

Specific:
- transfer effect exact 0；
- price-only change -> only market；
- income-only -> cash flow；
- exchange -> trade/rebalance；
- snapshot reset -> reconciliation；
- missing P0/P1 -> incomplete。

## J. Backup V8

- export includes historicalManualQuotes。
- export excludes provider history / refresh runs。
- API key absent。
- V7 restore -> V8 works。
- V8 roundtrip manual quotes exact。
- corrupt manual quote rejects before write。
- failed restore full rollback。
- normal manual quote mutation remains exportable。

## K. API/security

- date input strict。
- overlong range rejected。
- step max units clamped。
- provider error safe。
- no route writes Ledger。
- no provider HTTP on analytics GET/SSR。

## L. E2E

至少新增：

1. Analytics empty history -> explicit CTA。
2. Seed deterministic history -> net worth chart/cards visible。
3. incomplete quote -> gap + warning。
4. explicit refresh mocked provider -> progress -> success。
5. interrupted refresh -> resume。
6. manual historical quote fills missing custom asset。
7. allocation liabilities separate。
8. cash flow trend。
9. decomposition tooltip/source。
10. mobile analytics no overflow。

## Full gate

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

不得声称未实际运行的命令 PASS。
