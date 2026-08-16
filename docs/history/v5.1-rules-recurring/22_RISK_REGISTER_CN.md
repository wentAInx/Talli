# V5.1 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Rule mutates source provenance | Critical | projection-only architecture |
| Rule silently writes Ledger | Critical | no writer dependency in evaluator |
| Rule changes amount/date/account | Critical | action allowlist |
| Rule order nondeterministic | High | stage+sort_order+id |
| Rule category wrong direction | High | direction/type validation |
| Amount rule uses float | Critical | bigint parsing/comparison |
| Regex DoS | High | no user regex |
| Recurring future row mistaken as transaction | Critical | generated occurrence only |
| Auto-post creates false facts | Critical | no auto-post |
| Auto-link wrong occurrence | High | suggestions + explicit link |
| Monthly 31 ambiguity | High | fixed skip vs explicit last |
| Feb29 ambiguity | Medium | explicit skip non-leap |
| Recurring account asset changes scale | High | asset lock |
| Link duplicate | High | unique occurrence + event |
| Link/skip conflict | High | service + backup validation |
| Posting succeeds but link fails | High | one transaction rollback |
| Rules break V5 exact provenance | Critical | immutable candidate + V5 validator |
| Backup stores stale projection | Medium | projections excluded |
| V1–V5 regression | Critical | full regression gate |
