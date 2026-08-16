# V5.0 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| file直接写Ledger | Critical | candidate-first + explicit Import |
| manual tx重复 | High | strong dedupe + explicit match |
| auto-match错 | Critical | V5.0 never auto-match |
| wrong account file | High | fingerprint + explicit profile |
| currency mismatch | High | explicit mapping + fail closed |
| precision rounding | Critical | exact parser + reject excess |
| CSV locale ambiguity | High | explicit separators/date |
| identical weak rows collapse | High | occurrence ordinal |
| strong source changes | High | source_changed |
| CAMT aggregate误拆 | Critical | unsupported unless provable |
| XML entity/DOCTYPE DoS | Critical | pre-reject + limits |
| raw bank file leak | High | no blob persistence |
| account number leak | High | hash + last4 |
| partial batch | High | parse outside tx + atomic commit |
| matched provenance edit drift | High | block/unlink incompatible edit |
| V3/V4 regress | Critical | full regression |
