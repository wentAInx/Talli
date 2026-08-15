# Non-goals & Future

V6.0不做：

## Investment accounting
- tax lots
- acquisition cost basis
- realized P&L
- unrealized P&L tax basis
- FIFO/LIFO/HIFO
- wash sale

## Performance
- TWR
- IRR/XIRR
- benchmark alpha
- risk-adjusted return
- drawdown analytics

这些需要独立语义设计，不能从 V6 bridge偷换概念。

## External providers
- automatic CoinMarketCap fallback
- DefiLlama fallback
- stock/ETF prices
- bank market data
- arbitrary user URL provider

未来 provider expansion必须独立审计 identity/provenance/license。

## Automation
- cron history refresh
- background worker
- auto-post
- auto-link

## Full historical snapshots
V6不创建 daily Ledger snapshots。
Historical balance始终从 frozen V1 snapshot/event语义派生。
