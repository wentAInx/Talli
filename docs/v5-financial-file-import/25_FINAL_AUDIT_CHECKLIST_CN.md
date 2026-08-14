# V5.0 Independent Final Audit Checklist

Repository `wentAInx/Talli`  
Baseline `ef968976510e04f0532715c1e73f88595a607e89`  
Feature `feat/v5-financial-file-import`

Audit：
- descendant of v4.1.0；
- old migrations untouched；
- parser limits/DTD/ENTITY/no HTTP/no raw blob/PII；
- exact CSV/OFX/CAMT bigint amounts；
- FITID/CAMT refs/CSV ID/weak ordinals；
- no auto-match；
- explicit match exact target-account signed amount；
- match does not mutate Ledger；
- file commit no Ledger；
- explicit Import same V1 writer；
- statement balance observation + explicit snapshot reconcile；
- Backup schemaVersion6 / restore 1..6 / privacy / rollback；
- V1/V2/V3/V4/V4.1 regressions；
- desktop/mobile；
- exact SHA CI.

Verdict：

```text
Critical
High
Medium blocking
Low

Architecture
Parser correctness
Duplicate/match
Ledger isolation
Backup
Security
CI

GO / NO-GO
```
