# Base Exact Network Fee Spec

# 1. Fee components

Base sequenced user transaction：

```text
total =
L2 execution fee
+
L1 data/security fee
+
operator fee (when active; may be zero)
```

所有值 wei bigint。

# 2. Execution

```text
execution =
BigInt(receipt.gasUsed)
*
BigInt(receipt.effectiveGasPrice)
```

# 3. L1 data/security — historical GasPriceOracle

GasPriceOracle：

```text
0x420000000000000000000000000000000000000F
```

不要自己重写 Fjord/Ecotone fee formula。

流程：

1. `eth_getRawTransactionByHash(txHash)`
   得完整 raw RLP；
2. 对 **transaction block number** 做 historical `eth_call`：
   ```text
   GasPriceOracle.getL1Fee(rawSerializedTx)
   ```
3. ABI decode uint256 → bigint。

Base 官方当前说明：

```text
getL1Fee(bytes)
= exact L1 fee for fully serialized RLP transaction
```

Historical block call 很重要：
不同 fork 的 GPO implementation/state 自动匹配当时规则。

# 4. Operator fee

Isthmus mainnet activation：

```text
2025-05-09 16:00:01 UTC
```

Jovian mainnet activation：

```text
2025-12-02 16:00:01 UTC
```

不要在 Talli 本地实现两个 fork 公式作为 source of truth。

推荐：

```text
pre-Isthmus:
operator = 0

post-Isthmus:
historical eth_call at tx block:
GasPriceOracle.getOperatorFee(receipt.gasUsed)
```

由于 historical GPO code/state 对应当时 fork，
Isthmus/Jovian 公式差异由链自身处理。

# 5. Exact total

只有三部分都 exact：

```text
total = execution + l1Data + operator
feeStatus = exact
```

任一：

- raw tx missing；
- historical eth_call unavailable；
- ABI response invalid；
- gas fields invalid；

则：

```text
feeStatus = unresolved
total = null
gas candidate not importable
```

不能降级成 `execution only` 后仍叫 total。

# 6. Deposit transaction

Base type：

```text
0x7e
```

是 L1→L2 deposited transaction。

官方协议说明 deposits 在 L1 买 L2 gas，
且不按普通 sequenced transaction 收 operator fee。

V4.1 对 type 0x7e：

```text
不生成普通 user network-fee candidate
```

Bridge movement source仍可显示，但桥接语义不自动匹配。

# 7. ABI

只需要固定、audited ABI：

```solidity
getL1Fee(bytes) returns (uint256)
getOperatorFee(uint256) returns (uint256)
```

不要引入任意 contract-call UI。

如果实现 minimal ABI encoder：

- selector 必须来自 Ethereum Keccak-256，不是 NIST SHA3-256；
- dynamic bytes padding/offset 必须有 fixture test；
- uint256 decode 必须 bigint；
- fixture 与官方 GasPriceOracle ABI 交叉验证。

# 8. Provenance

`evm_l2_gas_fee_details`：

```text
feeModel = base_op_stack
execution
parentData
operator
total
evidenceJson
```

evidenceJson 建议保存：

```text
txHash
blockNumber
txType
gasUsedHex
effectiveGasPriceHex
rawTxHash/length
getL1FeeResultHex
getOperatorFeeResultHex / preIsthmusZero
GasPriceOracle address
```

不要把完整 raw tx 重复塞 backup，除非实现确有需要。
