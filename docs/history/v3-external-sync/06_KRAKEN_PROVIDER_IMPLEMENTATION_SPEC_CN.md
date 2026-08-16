# Kraken Spot Read-only Provider Spec

## 1. Files

推荐：

```text
src/providers/kraken/
  auth.ts
  nonce.ts
  client.ts
  normalize.ts
  errors.ts
  types.ts
```

Provider 不直接写 Ledger。

## 2. Credentials

V3.1：

```text
KRAKEN_API_KEY
KRAKEN_API_SECRET
```

仅 server env。

Credential ref：

```text
env:kraken.primary
```

不做 DB secret storage，不做 UI 输入 secret。

## 3. Permission gate

先调用：

```text
POST /0/private/GetApiKeyInfo
```

required：

```text
query-funds
query-ledger
query-closed-trades
```

缺失任何 required → refuse sync。

已知 write-capable deny list：

```text
add-funds
withdraw-funds
earn-funds
modify-trades
close-trades
add-withdraw-address
update-withdraw-address
```

发现任一 → `KRAKEN_WRITE_PERMISSION_FORBIDDEN`，拒绝 sync。

额外只读 permission 可提示但无需拒绝。

## 4. API-key 2FA

V3.1 不管理 rotating OTP。

如果 dedicated API key 要求 OTP：

```text
KRAKEN_API_2FA_UNSUPPORTED
```

要求用户重新创建专用只读 key。

## 5. Authentication

按 Kraken Spot REST：

```text
API-Sign =
base64(
  HMAC-SHA512(
    base64Decode(secret),
    URI_PATH + SHA256(nonce + POST_DATA)
  )
)
```

URI path 从 `/0/private` 开始。

## 6. Nonce

Nonce 必须单调递增。

实现：

```text
KrakenNonceService.next(connectionId)
```

短 `BEGIN IMMEDIATE`：

1. read last_nonce_text
2. nowMs as bigint
3. next = max(nowMs, previous+1)
4. persist TEXT
5. commit
6. return string

同 connection private calls 还应 process-local 串行化。

nonce 是 operational state，不进 backup。

## 7. Public metadata

```text
GET /0/public/Assets?assetVersion=1
GET /0/public/AssetPairs?assetVersion=1
```

使用 metadata：

- raw key → canonical display identity
- pair → base/quote
- provider precision metadata

不要 string split 猜 pair。

不要只硬编码 XXBT→BTC / ZUSD→USD。

## 8. Balance

```text
POST /0/private/Balance
```

作为 current external total balance observation。

amount 必须保持 decimal text。

`.B/.F/.M/.S/.T` 保持独立 raw identity，不自动 aggregate。

## 9. Ledgers

```text
POST /0/private/Ledgers
```

必须完整分页。

当前官方文档说明 50 results at a time。

每个 ledger ID：

```text
object_type = kraken_ledger
```

至少保存：

```text
refid
time
type
subtype
asset
amount
fee
balance
```

## 10. TradesHistory

```text
POST /0/private/TradesHistory
```

permission：

```text
query closed orders & trades
```

完整分页。

每个 trade fill external ID：

```text
object_type = kraken_trade
```

TradesHistory 是 trade candidate primary source。

pair 通过 AssetPairs metadata 解析。

## 11. Fee 不能猜

Trade `fee` 数量存在不等于 fee asset 已被安全确定。

只有明确 provider evidence 或用户 Review 明确选择时才生成 fee leg。

禁止默认“fee 一定 quote asset”直接导入。

## 12. Network / DB transaction

禁止：

```text
BEGIN
await Kraken
COMMIT
```

正确：

```text
short DB claim/state tx
commit
external HTTP
normalize
short persistence tx
```

## 13. No write endpoints

Kraken client contract/implementation不得包含：

```text
AddOrder
CancelOrder
Withdraw
Deposit write
Earn Allocate/Deallocate
Account Transfer
```
