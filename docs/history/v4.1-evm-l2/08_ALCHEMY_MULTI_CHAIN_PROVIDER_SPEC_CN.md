# Alchemy Multi-chain Provider Spec

# 1. One credential, fixed origins

继续：

```text
ALCHEMY_API_KEY
credentialRef = env:alchemy.primary
```

Chain registry 决定 origin：

```text
1     https://eth-mainnet.g.alchemy.com
8453  https://base-mainnet.g.alchemy.com
42161 https://arb-mainnet.g.alchemy.com
```

DB/UI 不能覆盖 origin。

# 2. Read allowlist

保留 V4.0：

```text
eth_chainId
eth_blockNumber
eth_getBlockByNumber
eth_getBalance
eth_getTransactionByHash
eth_getTransactionReceipt
alchemy_getTokenBalances
alchemy_getTokenMetadata
alchemy_getAssetTransfers
```

V4.1 增加：

```text
debug_traceTransaction
eth_getRawTransactionByHash   # Base exact L1 fee only
eth_call                      # Base GasPriceOracle only
```

业务层不得传任意 method string。

# 3. Chain assertion

每个 connection 每轮：

```text
eth_chainId == registry.chainIdHex
```

Base：

```text
0x2105
```

Arbitrum：

```text
0xa4b1
```

Mismatch fail closed。

# 4. Balance

三条链继续同一 exact pipeline：

```text
eth_getBalance(latest)
alchemy_getTokenBalances
alchemy_getTokenMetadata
hex -> bigint
```

row-level token errors保持 V4.0 partial behavior。

# 5. Finalized history

获取：

```text
eth_getBlockByNumber("finalized", false)
```

取 numeric finalized block。

Transfers API 仍传：

```text
toBlock = exact finalized block hex
```

Current balance 使用 `latest`。

# 6. Transfer categories

Ethereum regression：

```text
external
internal
erc20
```

Base / Arbitrum：

```text
external
erc20
```

绝不能因为共享 provider helper 将 `internal` 加回 L2。

# 7. Trace capability

对 discovered Base/Arbitrum tx：

```text
debug_traceTransaction
callTracer
onlyTopCall=false
```

如果 provider 明确表明 Debug capability 不可用：

```text
traceCapability = trace_unavailable
activityStatus = trace_unavailable
```

本轮：

- 不保存 activity candidate/source partial snapshot；
- 不推进 activity finalized cursor；
- balance facts 可以保存；
- UI 显示 balance-only。

Rate limit / network / malformed trace 不得伪装成 plan unavailable；
按 transient/error 处理。

# 8. Alchemy Debug response compatibility

当前文档可能返回：

```text
direct call frame
```

或包装为：

```json
[
  {
    "name": "transaction trace",
    "value": { "...call frame..." }
  }
]
```

parser 可以明确支持当前官方形态，
但 unknown shape 必须 fail closed。

# 9. No provider I/O in DB tx

所有：

```text
Transfers
Debug
Raw tx
GasPriceOracle eth_call
```

都必须在 SQLite write transaction 外。

Tests 必须用 injected transport assert。
