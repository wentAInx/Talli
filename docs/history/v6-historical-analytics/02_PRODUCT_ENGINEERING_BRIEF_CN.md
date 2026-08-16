# Product & Engineering Brief

## 用户问题

V6 应回答以下问题：

### Net Worth
- “过去一年我的净资产怎么变化？”
- “某一天我大概值多少钱？”
- “这个日期为什么是 incomplete？”

### Allocation
- “当前/某历史日期我的资产主要分布在哪里？”
- “正资产和负债分别是什么？”
- “法币部分主要暴露在哪些币种？”

### Flow
- “每月收入、支出、净现金流怎么变化？”
- “这些值换算到 Home Asset 后大概是多少？”

### Bridge
- “净资产变化主要来自我存入/花掉的钱，还是市场与汇率变化？”
- “Exchange / reconciliation 对变化有什么影响？”

## 产品语义

V6 所有 home-denominated 数值都是 derived estimate，UI 继续使用 `≈`。

Historical Analytics 不是新的财务事实层。

```text
native Ledger quantity
+ provider/manual historical quote
+ deterministic valuation math
= derived analytical view
```

## 第一版用户体验

`/analytics`：

- Date range: 30D / 90D / 1Y / 3Y / 5Y / All / Custom
- Historical data status
- Explicit `Refresh history`
- Net Worth chart
- Gross Assets / Liabilities / Net Worth
- Asset allocation
- Asset class allocation
- Fiat currency allocation
- Monthly income / expense / net flow
- Net-worth bridge / decomposition
- Missing coverage details

默认 historical daily series 只到 **最后一个完整 App-timezone local day**。
“今天”继续由 V2 current valuation 负责，不把 current-now 与 historical EOD 混成同一 daily semantic。
