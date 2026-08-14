# V5.1 Independent Final Audit Checklist

Audit exact feature SHA.

## Baseline
- descendant of v5.0.0 `d8afd71...`；
- 0000–0007 untouched；
- only 0008 forward migration。

## Rules
- projection only；
- source/candidate/leg untouched；
- deterministic order；
- ALL/ANY/negation；
- source vs projected payee；
- safe action allowlist；
- bigint amount conditions；
- no regex/no HTTP；
- preview read-only。

## Import
- explicit；
- V5 provenance revalidated；
- rule metadata cannot change amount/account/date；
- category/tag/payee validated；
- V1 writer unchanged.

## Recurring
- expectation != Ledger；
- no auto-post/link；
- date-only recurrence exact；
- monthly31/last/leap rules；
- bigint expectation；
- explicit link/skip/unlink；
- Post via V1 writer；
- candidate import + recurring link atomic。

## Backup
- schemaVersion7；
- restore 1..7；
- only user facts；
- no projection/suggestion cache；
- relation/occurrence validation；
- rollback.

## Regression
- V1/V2/V3/V4/V4.1/V5；
- desktop/mobile；
- exact SHA Actions green。

Verdict:

```text
Critical
High
Medium blocking
Low

Rule Architecture
Recurring Architecture
Ledger Isolation
Exact Money
Backup
Security
Regression
CI

GO / NO-GO
```
