# Identity & Duplicate Detection

Tier 1 exact file：

```text
connectionId + fileSha256
```

Tier 2 strong transaction：
OFX FITID、safe CAMT ref、CSV explicit ID。

Tier 3 weak：
date + signed amount + payee + memo + occurrence ordinal。

Persist `identity_strength=weak`，UI 可提示。

Candidate stable key：

```text
file:<sourceExternalId>
```

10 次 reimport：
source/candidate/link/Ledger counts stable。

Same strong source ID payload change：
- unresolved candidate 可 refresh；
- imported/matched candidate → source_changed；
- Ledger unchanged。
