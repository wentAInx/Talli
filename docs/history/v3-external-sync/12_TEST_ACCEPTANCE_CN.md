# V3 Test & Acceptance Matrix

## A. Frozen regression

所有 V1/V2 unit/integration/E2E 继续 PASS。

## B. Kraken Auth

- K-001: fixed fixture signature deterministic
- K-002: 100 nonces strictly increasing
- K-003: restart/service rebuild still > persisted nonce
- K-004: missing query-ledger rejects
- K-005: withdraw-funds / modify-trades rejects
- K-006: secret absent from log/error/source/backup

## C. Provider

- KP-001 Balance decimal strings exact
- KP-002 USDT.F not auto-collapse
- KP-003 XXBT raw resolves via metadata to BTC
- KP-004 pair base/quote from AssetPairs
- KP-005 Ledgers pagination >50
- KP-006 Trades pagination
- KP-007 no write endpoint
- KP-008 provider HTTP asserts sqlite.inTransaction == false

## D. Idempotency

- S-001 same ledger twice → source count unchanged
- S-002 same trade twice → candidate count unchanged
- S-003 imported re-sync → ledger count unchanged
- S-004 source changes before import → re-normalize
- S-005 source changes after import → warning, Ledger unchanged
- S-006 concurrent sync → one provider chain

## E. Mapping

- M-001 Kraken BTC → Talli USD account reject
- M-002 ignored asset does not block others
- M-003 excess provider precision → no rounding/no import

## F. Balance

- B-001 sync Balance does not mutate Ledger/snapshots
- B-002 external .502 vs ledger .500 → +.002 exact
- B-003 explicit confirm → snapshot + correct balance
- B-004 no confirm → no reconcile

## G. Candidate

- C-001 Buy → source quote negative, dest base positive
- C-002 Sell → source base negative, dest quote positive
- C-003 fee amount but unknown asset → not auto-importable fee
- C-004 explicit ledger fee evidence → fee leg
- C-005 deposit not auto-income
- C-006 withdrawal not auto-expense

## H. Atomic import

- I-001 exchange candidate → exactly one V1 event + link
- I-002 late DB trigger failure → Ledger event also rollback
- I-003 second import reject/no duplicate
- I-004 V1 invariant still enforced

## I. Backup v3

- BV3-001 schemaVersion 3
- BV3-002 secrets excluded
- BV3-003 operational state excluded
- BV3-004 V1 restore
- BV3-005 V2 restore
- BV3-006 V3 exact roundtrip
- BV3-007 corrupt mapping pre-write reject
- BV3-008 late V3 restore failure full rollback

## J. E2E

No real Kraken.

至少验证：

1. `/sync`
2. connection permission status
3. asset mapping
4. observed vs Ledger balance
5. explicit reconciliation
6. pending trade candidate
7. review Exchange
8. import
9. original transaction page visible
10. candidate imported
11. no duplicate on revisit/resync fixture
12. mobile no overflow

## Final gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

GitHub Actions exact final SHA must be all green.
