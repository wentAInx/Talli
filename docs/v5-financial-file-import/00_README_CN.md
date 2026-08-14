# Talli V5.0 — Financial File Import & Matching Foundation

Repository: `wentAInx/Talli`

Frozen baseline:

```text
v4.1.0
ef968976510e04f0532715c1e73f88595a607e89
```

V4.1 main release CI: `31700359476` — Quality & Build PASS / Playwright E2E PASS.

推荐开发分支：`feat/v5-financial-file-import`

## 下一阶段总路线

用户已批准三个连续主题：

```text
V5.0  Bank Statement / File Import + Duplicate / Match
V5.1  Rules & Recurring Automation
V6.0  Historical Net Worth & Analytics
```

本任务包只开发 **V5.0**，不要把 Rules、Recurring、Historical Price/Net Worth 混入本轮。

## V5.0 正式范围

首批支持：

- CSV
- OFX / QFX Banking & CreditCard statement subset
- ISO 20022 camt.053 Bank-to-Customer Statement

V5.0 不做 direct bank API / Open Banking OAuth。

最高边界：

```text
Imported file != Ledger
```

文件必须经过：

```text
Uploaded file
→ Parse / normalize
→ External source object
→ Candidate
→ Duplicate / Match review
→ Explicit Import OR Explicit Match Existing
→ V1 Ledger / provenance
```

禁止上传后直接创建 Ledger event/snapshot；禁止自动 Match；禁止自动 Import；
禁止精度 rounding；禁止 raw bank file 进入 SQLite/Backup。
