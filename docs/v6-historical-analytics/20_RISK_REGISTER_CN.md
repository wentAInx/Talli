# V6 Risk Register

| Risk | Severity | Required defense |
|---|---:|---|
| historical quotes accidentally mutate Ledger | Critical | no writer dependency; security/source audit |
| daily date uses UTC instead of App timezone | High | cutoff helper + timezone/DST tests |
| archived assets disappear from history | High | historical account set includes archived |
| missing quote shown as zero | High | completeValue=null + chart gap |
| current manual quote retroactively used | High | separate historical manual table |
| stablecoin silently treated USD | High | explicit provider/manual only |
| snapshot reset misclassified as cash flow | High | ReconDelta formula |
| exchange labeled realized P&L | High | trade/rebalance wording + non-goal |
| N days × N queries performance | High | batched balance/quote reads |
| provider call inside transaction | High | claim/http/commit architecture |
| mapping changes during HTTP | High | fingerprint re-check |
| long refresh times out | High | bounded resumable units |
| provider plan history limit assumed | Medium | no hardcoded plan depth |
| CoinGecko terms/license mismatch | High | rebuildable cache, attribution, no raw export, re-check at release |
| ECB revision ignored | Medium | upsert + correction refresh capability |
| chart float feeds financial math | High | exact server strings; number geometry only |
| provider cache bloats Backup | High | explicit V8 exclusion |
| AGENTS old rules block V6 | High | Phase 0 canonical update |
| Home Asset change invalidates materialized cache | Avoided | no daily materialization P0 |
| timezone change invalidates selected daily cache | Avoided | store raw UTC observations |
| liabilities distort allocation pie | Medium | separate liabilities |
