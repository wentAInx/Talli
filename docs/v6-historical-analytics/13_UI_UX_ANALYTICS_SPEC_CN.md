# Analytics UI/UX Specification

## Page

新增 `/analytics`，导航加入 Analytics。

设计应遵循现有 finance UI：
- mobile first
- tabular numerals
- explicit signs
- asset codes
- color not sole semantic carrier

## Header

- title: `Analytics`
- current Home Asset
- App timezone
- date range selector
- `Refresh history` button
- data status badge

## Net Worth

显示：
- `≈ Net Worth`
- period change
- gross assets
- liabilities
- completeness

Chart：
- complete points solid line；
- incomplete point使用 gap，不连成假趋势；
- degraded but complete point可以 tooltip badge；
- tooltip exact value用 server decimal string，不用 chart float重算。

## History status

用户可以看到：
- CoinGecko coverage
- ECB coverage
- manual historical overrides
- last refresh
- partial/failed run
- missing mappings
- Resume / Retry
- Purge provider cache

Source:
- `Data provided by CoinGecko`
- `Source: ECB statistics`
- derived cross-rate clearly labeled。

## Allocation

三种切换：
1. By asset
2. By asset class
3. Fiat currency

负债单独 section。
不要把负数 pie slice塞进 100%。

## Cash Flow

Monthly bar/line：
- Income
- Expense
- Fees
- Net flow

缺 historical rate：
- bucket incomplete
- tooltip显示 missing count
- 不画成 0。

## Net-worth Bridge

建议 stacked bar / bridge cards：
- Market & FX
- Income
- Expense
- Fees
- Trade / rebalance
- Reconciliation

Internal transfer正常为 0，可默认隐藏；非零时显示 warning。

明确文案：
> This is a valuation-change attribution, not tax cost basis or realized P&L.

## Manual Historical Quote

在 data status/missing asset detail提供：
- date
- base asset
- Home Asset quote
- rate
- note

不要在 primary transaction UI 混入。

## Chart library

当前 release 无 chart dependency。
实现前检查现有 stack：

- 优先 small accessible SVG / existing project pattern；
- 若新增 chart library，必须说明理由、React 19/Next 16 compatibility、bundle impact，并锁入 pnpm lock；
- chart library 只负责 geometry，不负责 financial math。
