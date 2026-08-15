# V6 Final Audit Checklist

## Git / release
- [ ] feature branch exact SHA recorded
- [ ] base ancestry includes v5.1.0 unchanged
- [ ] no force/squash/rebase published history
- [ ] migration diff reviewed

## Ledger boundary
- [ ] historical code has no direct Ledger writer path
- [ ] provider refresh cannot create/edit/delete ledger_events/entries/snapshots
- [ ] native quantity semantics unchanged
- [ ] V1 balance differential tests pass

## Quote correctness
- [ ] crypto latest-prior, no future lookup
- [ ] ECB carry explicit
- [ ] no stablecoin peg
- [ ] no zero fill
- [ ] archived historical exposure supported
- [ ] manual historical separated from current manual

## Time
- [ ] App timezone cutoff
- [ ] DST cases
- [ ] last completed day
- [ ] event-time cash flow

## Decomposition
- [ ] exact algebraic identity
- [ ] transfer zero
- [ ] snapshot reconciliation explicit
- [ ] exchange not called realized P&L
- [ ] incomplete cannot reconcile as fake zero

## Provider refresh
- [ ] no HTTP in DB tx
- [ ] resumable bounded units
- [ ] mapping fingerprint rechecked
- [ ] malformed unit zero writes
- [ ] provider errors safe
- [ ] no SSR provider fetch

## Backup/security
- [ ] V8
- [ ] manual history included
- [ ] provider history excluded
- [ ] API key excluded
- [ ] purge works
- [ ] source attribution
- [ ] no raw provider export

## Performance
- [ ] no day-by-day N+1 DB query
- [ ] indexes used
- [ ] historical observation reads batched
- [ ] provider writes unit-batched

## CI
- [ ] format
- [ ] lint
- [ ] typecheck
- [ ] db:check
- [ ] unit
- [ ] integration
- [ ] build
- [ ] security
- [ ] E2E

## Audit verdict

Only if all blocking items pass:

```text
Talli V6.0 Final Audit: PASS
Release Gate: GO / RELEASE READY
```

Then follow ff-only release freeze; no new release business commit.
