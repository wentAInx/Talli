# V2.0 Non-goals & V2.1 Boundary

# 1. V2.0 禁止项

## 1.1 Historical valuation

禁止：

- historical_price_quotes runtime table（可写设计 TODO，但不实现）。
- daily net worth chart。
- transaction-date market conversion。
- historical CoinGecko backfill。
- historical ECB backfill。

## 1.2 Background collectors

禁止：

- cron price collector。
- worker queue。
- Redis。
- message bus。
- WebSocket market stream。

V2.0 只做 on-demand + cache。

## 1.3 Investment accounting

禁止：

- cost basis。
- realized/unrealized P&L。
- tax lots。
- FIFO/LIFO。
- ROI。

## 1.4 External account sync

禁止：

- Coinbase/Kraken/Binance balances。
- exchange API secrets。
- wallet address scan。
- chain RPC。
- transaction import。

## 1.5 Stablecoin shortcut

禁止：

```text
USDT = USD
USDC = USD
```

## 1.6 New market domains

V2.0 不自动接：

- stock。
- ETF。
- gold。
- fund。
- airline miles。

Custom asset 可通过 manual exact quote 估值。

# 2. V2.1 预留方向

V2.1 才考虑：

```text
historical_price_quotes
lazy historical backfill
historical net worth
selected-date portfolio valuation
```

推荐仍保持：

- CoinGecko Crypto/USD historical。
- ECB historical fiat FX。
- manual historical observations。
- lazy backfill，不从 V2.0 开始每日 cron。

# 3. V2.1 兼容要求

V2.0 的 source quote 结构、provider mappings、Home Asset、manual quote history 应足以让 V2.1 additive 扩展，不需要改 V1 Ledger。

# 4. 更后续版本

V3 才讨论：exchange/wallet read-only sync。

P&L/cost basis 应作为独立产品边界另行设计，不要因“已有价格”就在 V2 顺手实现。
