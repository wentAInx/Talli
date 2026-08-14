# V5.0 UI / UX

Add top-level `Import`，Account detail 增加 `Import statement`。

Import landing：
- Import Profiles
- Recent batches
- Supported formats

Profile card：
target account、format、last ingest、structured account `••••1234`。

Flow：

## Step 1
Choose target account + format/auto-detect + upload。

## Step 2 Preview

Structured：
format、masked statement account、currency、period、rows、closing balance。

CSV：
encoding/delimiter/header/date/amount/payee/memo/currency/ID mapping，
preview first 20 rows。

## Step 3 Duplicate/Match

每行：

```text
New
Already imported
Possible Ledger match
Unsupported
Invalid
```

Possible match并列展示 imported vs existing Ledger。

Parse/ingest阶段 button 必须叫：

```text
Create review candidates
```

不能叫 “Import to Ledger”。

Review candidate展示：
source format/file、identity strength、account/date/payee/memo/amount。

Out actions：
Expense / Transfer / Match Existing / Ignore。

In actions：
Income / Transfer / Match Existing / Ignore。

Statement balance：
Observed / Talli Ledger / Difference / Reconcile。

Batch summary：
rows / already known / possible matches / new / unsupported。

Mobile：
CSV mapping/preview cards or scroll containers，关键路径 WebKit 无 overflow。
