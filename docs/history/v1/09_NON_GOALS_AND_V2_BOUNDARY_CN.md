# V1 非目标与 V2 边界

本文件记录 V1 的范围边界，防止初始实现被扩展成“大而全”。

# 1. V1 禁止项

## 1.1 行情与汇率

禁止：

- CoinGecko API
- Coinbase price API
- Kraken market API
- Binance market API
- ECB FX
- 法币换算
- Crypto market price
- cron price collector
- historical price backfill
- price cache

V1 代码库中可以有一段设计文档 TODO，但不要实现运行时代码。

## 1.2 统一估值

禁止：

```text
总资产 ¥xxxx
净资产 $xxxx
Portfolio value
P&L
资产涨跌
```

## 1.3 Stablecoin 固定锚定

禁止在业务逻辑中写：

```text
1 USDT = 1 USD
1 USDC = 1 USD
```

USDT/USDC 在 V1 是独立 Asset。

## 1.4 外部账户同步

禁止：

- read-only exchange API
- wallet address scanning
- on-chain balance
- bank sync
- Plaid
- open banking

## 1.5 复杂同步

禁止：

- local-first multi-device CRDT
- E2EE sync
- conflict resolution engine
- WebSocket sync

## 1.6 多用户

禁止：

- organizations
- household sharing
- roles/permissions
- invitations

## 1.7 AI/OCR

禁止：

- receipt OCR
- screenshot parsing
- AI categorization
- LLM assistant

---

# 2. V1.1 候选

只有 V1 验收通过后再考虑：

```text
预算
周期账
多账本完整 UI
CSV/支付宝/微信账单导入
附件
快捷记账
PWA 增强
```

---

# 3. V2 估值层设计边界

V2 可以新增独立表：

```text
price_quotes
```

概念模型：

```text
base_asset_id
quote_asset_id
price_decimal
quoted_at
provider
quote_type
```

此表属于衍生数据。

**V2 不允许修改 V1 的 ledger entries 或 snapshot 数量。**

例如：

```text
ledger: 0.00428137 BTC
```

永远保持 0.00428137 BTC。

V2 只是查询：

```text
0.00428137 BTC × BTC/CNY quote
```

得到临时估值。

---

# 4. V2 推荐行情策略（仅设计，不实现）

建议：

```text
Current Price
  -> cache 5~15min
  -> missing/stale 时按需请求

Historical Price
  -> 用户查看历史估值时 lazy backfill
  -> 获取后持久缓存
```

不需要 V1 起就每天 cron 收集。

行情 provider 后续可以抽象：

```ts
interface PriceProvider {
  getCurrentQuotes(...): Promise<...>
  getHistoricalQuotes(...): Promise<...>
}
```

法币与 Crypto 最终统一成 Asset pair quote。

---

# 5. 为什么当前不做 V2

如果 V1 直接带估值，会同时引入：

- API 稳定性
- rate limits
- provider symbol mapping
- stablecoin depeg
- timezone/day close 语义
- historical data holes
- network failure
- caching
- price source provenance
- base currency

这些都与“账本余额是否正确”无关。

先冻结 V1 ledger，可以把价格系统变成真正可替换的外层模块。
