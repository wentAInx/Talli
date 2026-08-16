# Arbitrum One Exact Network Fee Spec

# 1. Chain

```text
Arbitrum One
chainId 42161
0xa4b1
Nitro Rollup
```

# 2. Official fee model

用户 transaction fee 有：

```text
parent-chain posting component
+
child-chain execution/resource component
```

Arbitrum receipt 增加：

```text
gasUsedForL1
```

它表示 parent-chain component，
但单位是 child-chain gas units。

# 3. Exact decomposition

要求：

```text
gasUsed        = BigInt(receipt.gasUsed)
gasUsedForL1   = BigInt(receipt.gasUsedForL1)
price          = BigInt(receipt.effectiveGasPrice)
```

验证：

```text
0 <= gasUsedForL1 <= gasUsed
```

然后：

```text
total =
gasUsed * price

parentData =
gasUsedForL1 * price

execution =
(gasUsed - gasUsedForL1) * price
```

必须验证：

```text
execution + parentData == total
```

注意：

```text
不要 total + parentData
```

否则 double count。

Arbitrum Nitro 源码测试也以：

```text
gasUsedForL2 = gasUsed - gasUsedForL1
```

拆分。

# 4. Missing extension

如果：

```text
gasUsedForL1 missing
invalid
> gasUsed
```

则：

```text
feeStatus = unresolved
gas candidate not importable
```

不要假定 0。

# 5. Delayed inbox / custom L1→L2 types

Arbitrum 自定义 transaction type 包含：

```text
100 deposit
101 unsigned
102 contract
104 retry
105 submit retryable
106 internal
```

这些 L1-origin / ArbOS-specific 类型具有不同 fee/bridge 语义。

V4.1：

- 可以保存实际 movement source；
- 不自动 bridge-match；
- **不生成普通 direct-user gas candidate**，除非以后有专门审计过的 adapter。

Normal user direct Arbitrum transactions（Ethereum-style types）才走上述 gas candidate。

# 6. Provenance

```text
feeModel = arbitrum_nitro
execution
parentData
operator = null
total
```

evidence：

```text
gasUsedHex
gasUsedForL1Hex
effectiveGasPriceHex
txType
blockNumber
```

# 7. No parent-L1 future-cost recomputation

不要用：

```text
current Ethereum gas price
compressed tx size
```

重新推导历史用户实际 fee。

Talli 记录的是 transaction 当时被 ArbOS 收取的 receipt fee。
