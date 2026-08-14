# Talli V5.1 — Rules & Recurring Automation

Repository: `wentAInx/Talli`

Frozen V5.0 baseline:

```text
v5.0.0
d8afd71eea85abf05121b79b6d6c499b0272f19f
```

Release verification:

```text
main release CI:     31809780778
feature support CI: 31808929577
Quality & Build: PASS
Playwright E2E: PASS
```

推荐开发分支：

```text
feat/v5.1-rules-recurring
```

## 正式目标

> **Talli V5.1 — Rules & Recurring Automation**

V5.1 包含两个语义严格分离的子系统：

```text
A. Candidate Rules
   file-import Candidate
   → clean payee/category/tag/note/event-type suggestions

B. Recurring Expectations
   房租 / 工资 / 订阅 / 保险 / 年费
   → expected occurrences
   → match suggestions
   → explicit link/post
```

最高红线：

```text
Rule projection != Ledger fact
Recurring expectation != Ledger fact
```

因此禁止 rule/recurring 自动写 Ledger、自动 link、修改 source amount/date/account identity，
也禁止未来 occurrence 伪装成 transaction。

V5.1 Rules 首版只作用于 `provider=file_import`；
Recurring 首版只支持 Expense / Income。

新版本数据：

```text
migration 0008_...
Backup schemaVersion 7
restore accepts 1..7
```

Rules/Recurring definitions 与 explicit links/skips 进入 Backup；
derived projection/suggestions/upcoming lists 不进入 Backup。
