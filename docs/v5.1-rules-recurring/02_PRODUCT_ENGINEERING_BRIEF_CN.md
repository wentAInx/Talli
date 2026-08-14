# Product & Engineering Brief

## Rules

V5.0 已能把 statement 安全地转成 Candidate，但用户仍会重复做：

```text
AMZN Mktp...
→ Amazon
→ Shopping

NETFLIX.COM
→ Netflix
→ Subscription
```

V5.1 不修改 source/candidate provenance，而是：

```text
Immutable Candidate
→ Rule evaluator
→ Derived Projection
→ UI prefill
→ Explicit Import
→ V1 Ledger
```

## Recurring

例如：

```text
Netflix
monthly
15.99 USD
```

未来 9/15 在扣款发生前只是 Expected Occurrence。

真实 bank candidate 到来后：

```text
Candidate
→ Recurring match suggestion
→ Explicit Import + Link
```

Ledger event 代表真实发生；
Recurring link 只说明“哪个 occurrence 被履行”。

## 默认自动化程度

自动：
- rule projection；
- upcoming/due/overdue 计算；
- recurring match suggestion；
- form prefill。

不自动：
- Ledger write；
- recurring link；
- historical Ledger edit；
- auto-post scheduled transaction。

目标是减少 review 成本，不牺牲 trust boundary。
