# Kraken Official API Reference Snapshot — 2026-08-11

实现或维护前应重新核对 **官方 Kraken Developers**。
第三方博客不得作为协议事实来源。

## Get API Key Info

```text
https://docs.kraken.com/api-reference/account-data/get-api-key-info
POST /0/private/GetApiKeyInfo
```

当前文档可返回 permissions。
本包 required：

```text
query-funds
query-ledger
query-closed-trades
```

deny write：

```text
add-funds
withdraw-funds
earn-funds
modify-trades
close-trades
add-withdraw-address
update-withdraw-address
```

## Balance

```text
https://docs.kraken.com/api-reference/account-data/get-account-balance
POST /0/private/Balance
```

Permission：Funds permissions - Query。

当前官方示例有：

```text
ZUSD
XXBT
USDT
USD.M
```

文档还说明 `.B/.F/.T` 等产品 suffix。
因此必须保留 raw identity。

## Ledgers

```text
https://docs.kraken.com/api-reference/account-data/get-ledgers-info
POST /0/private/Ledgers
```

Permission：Data - Query ledger entries。

当前官方文档说明：

```text
50 results at a time
most recent by default
```

常见字段：

```text
refid time type subtype asset amount fee balance
```

必须分页。

## Trades History

Kraken Developers：

```text
Spot REST → Account Data → Get Trades History
POST /0/private/TradesHistory
```

Permission：Orders and trades - Query closed orders & trades。

每个 trade fill external ID 是 P0 candidate idempotency unit。

## Assets

```text
https://docs.kraken.com/api-reference/market-data/get-asset-info
GET /0/public/Assets?assetVersion=1
```

当前文档：

- default = internal legacy names（XXBT/ZUSD）
- assetVersion=1 = canonical display names（BTC/USD）
- altname/wsname 不受影响

## AssetPairs

```text
https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs
GET /0/public/AssetPairs?assetVersion=1
```

display mode 使 pair/base/quote/fee_volume_currency 使用 display names。
不要 string split 猜 pair。

## Authentication

```text
https://docs.kraken.com/exchange/guides/rest/authentication
```

当前文档：

```text
API-Key
API-Sign
nonce (always increasing unsigned 64-bit)
optional otp
```

签名：

```text
HMAC-SHA512(
  URI path + SHA256(nonce + POST data),
  base64-decoded secret
)
```

URI path 从 `/0/private` 开始。

Kraken 明确提醒 nonce 不能下降，时钟回拨或多进程乱序会导致 invalid nonce。
因此 Talli 使用 persisted monotonic nonce + per-connection serialization。

## Tests

CI 不使用真实 Kraken credentials 或网络。
全部 provider tests 用 injectable transport + deterministic fixture。
