# Backup SchemaVersion 5

# 1. Version

V4.1 export：

```text
schemaVersion = 5
```

接受：

```text
1 / 2 / 3 / 4 / 5
```

# 2. Include

继续所有 V1–V4 user facts。

V5 新增：

```text
evmL2GasFeeDetails
```

以及 V4 arrays 现在允许：

```text
chainId 1 / 8453 / 42161
networkId eth-mainnet / base-mainnet / arb-mainnet
```

# 3. Exclude

继续排除：

```text
externalConnectionState
externalSyncRuns
evmWalletConnectionState
price cache/state
```

所以：

```text
trace capability
activity cursor
```

都不进 backup。

Secrets 永远不进：

```text
ALCHEMY_API_KEY
```

# 4. V4 → V5 upgrade

V4 payload：

- 所有 Ethereum rows原样；
- `evmL2GasFeeDetails=[]`；
- 不生成 Base/Arbitrum；
- 不改变 source/candidate/import IDs。

# 5. V1–V3

沿用现有链式 upgrade：

```text
V1 -> V2 -> V3 -> V4 -> V5
```

不要重新实现旧 schema parser。

# 6. Validation

## Wallet chain pair

只接受：

```text
1      eth-mainnet
8453   base-mainnet
42161  arb-mainnet
```

sourceKey 必须：

```text
eip155:<chainId>:<addressLower>
```

## Asset

provider asset key 的 chain 必须与 wallet chain一致。

## Candidate

stableKey 中 chain 必须与 evmCandidateDetail.chainId一致。

## L2 fee detail

只允许 candidate：

```text
candidateKind=gas
chain=8453 or 42161
```

Base：

```text
feeModel=base_op_stack
operator field required when exact
```

Arbitrum：

```text
feeModel=arbitrum_nitro
operator=NULL
```

exact：

```text
execution + parent + operator? = total
```

全部 bigint decimal TEXT。

# 7. Atomic restore

完整 validation 后：

```text
BEGIN IMMEDIATE
all version rows
foreign_key_check
COMMIT
```

late V5 failure：

```text
V1/V2/V3/V4/V5 全 rollback
```
