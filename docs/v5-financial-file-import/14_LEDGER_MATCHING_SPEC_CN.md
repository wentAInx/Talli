# Existing Ledger Matching

目标：避免 manual transaction + later bank import 形成 duplicate Ledger event。

Suggestion required：

```text
same target account entry
exact same signed atomic amount
```

初始 date window：

```text
source local date ±3 calendar days
```

deterministic score（非金额，可用 integer）：

```text
same date +5000
±1 +4000
±2 +3000
±3 +2000
payee exact +4000
contains +2500
memo exact +1000
cap 10000
```

V5.0 无论分数多高都不 auto-match。

Explicit Match server invariant：
- candidate pending/needs_mapping；
- provider=file_import；
- selected event same book；
- selected event 存在 target account exact signed atomic entry；
- no import/match link；
- confirmed=true。

Date 只影响 suggestion，不是 hard invariant。

Match action 单 transaction：

```text
insert external_candidate_match_links
update candidate status=matched
```

不 UPDATE Ledger。

V5.0 不自动覆盖 Ledger date/payee。
差异显示给用户，用户另行 explicit edit。

`match_fingerprint` 绑定 candidateId/ledgerEventId/sourceFingerprint/matchedAt。

Matched provenance 与后续 Ledger edit/delete：
推荐 server-side block incompatible edit/delete，直到 user explicit unlink，
避免 Backup provenance 静默失效。
