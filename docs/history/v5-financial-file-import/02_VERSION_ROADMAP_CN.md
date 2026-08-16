# Talli Next Product Roadmap

## V5.0 — Financial File Import & Matching

```text
CSV / OFX / QFX / camt.053
→ source
→ candidate
→ review
→ import / match
```

## V5.1 — Rules & Recurring Automation

V5.0 freeze 后开发。

Rules：
- provider/account/payee/memo/amount/direction conditions；
- set category/payee/tags/note/suggested event type；
- preview affected candidates；
- 默认不自动写 Ledger。

Recurring：
- rent / salary / subscriptions / insurance / annual fee；
- daily/weekly/monthly/yearly + interval；
- exact / approx / range amount expectation；
- actual transaction link；
- history-based suggestion；
- future expectation != Ledger fact。

## V6.0 — Historical Net Worth & Analytics

单独 major version，引入 historical price/FX time series：

```text
historical_price_quotes
daily portfolio valuation
historical completeness
Net Worth chart
asset/currency allocation
cash-flow trends
market movement vs Ledger flow
```

仍然：

```text
Historical valuation != Ledger
```

Cost basis / tax / realized P&L 不默认混入 V6.0。
