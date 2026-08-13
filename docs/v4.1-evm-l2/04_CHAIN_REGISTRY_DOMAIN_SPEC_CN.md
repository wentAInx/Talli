# EVM Chain Registry & Domain Spec

# 1. Chain IDs

```ts
type EvmChainId = 1 | 8453 | 42161;
```

Registry：

```text
1
networkId      eth-mainnet
displayName    Ethereum Mainnet
origin         https://eth-mainnet.g.alchemy.com
native         ETH / 18
feeModel       ethereum
coverage       complete

8453
networkId      base-mainnet
displayName    Base
origin         https://base-mainnet.g.alchemy.com
native         ETH / 18
feeModel       base_op_stack
coverage       discovery_limited

42161
networkId      arb-mainnet
displayName    Arbitrum One
origin         https://arb-mainnet.g.alchemy.com
native         ETH / 18
feeModel       arbitrum_nitro
coverage       discovery_limited
```

# 2. Identity

Source key：

```text
eip155:<chainId>:<lowercase-wallet>
```

Native asset：

```text
eip155:<chainId>/native
```

ERC20：

```text
eip155:<chainId>/erc20:<lowercase-contract>
```

Candidate：

```text
evm:<chainId>:movement:<txhash>
evm:<chainId>:gas:<txhash>
```

不得保留任何硬编码 `evm:1:` helper 给新链复用。

# 3. Same address on multiple chains

合法：

```text
8453 + 0xabc...
42161 + 0xabc...
1 + 0xabc...
```

唯一性：

```text
(chain_id, address_lower)
```

同链重复地址拒绝。

# 4. Mapping

外部 asset identity 始终包含 chain。

例如 Base USDC 和 Arbitrum USDC 可以都由用户明确映射到：

```text
Talli asset = USDC
```

但不能因为 symbol 都是 USDC 自动完成。

每个 chain connection 的 asset/account mapping 独立。

# 5. Native ETH

经济资产可以映射到同一个 Talli `ETH` asset，
但 Talli accounts 必须独立，例如：

```text
Ethereum Main Wallet · ETH
Base Main Wallet · ETH
Arbitrum Main Wallet · ETH
```

# 6. Chain assertion

每次 provider sync 首先：

```text
eth_chainId
```

必须等于 chain registry expected hex。

Mismatch：

```text
CHAIN_MISMATCH
```

拒绝所有事实落库。
