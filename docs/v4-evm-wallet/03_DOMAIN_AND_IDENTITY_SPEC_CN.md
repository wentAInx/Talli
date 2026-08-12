# EVM Domain & Identity Spec

## Wallet connection identity

一个 V4 connection = 一个 book + chain + public address。

V4.0：

```text
chainId = 1
networkId = eth-mainnet
sourceKey = eip155:1:<lowercase-address>
credentialRef = env:alchemy.primary
```

地址只接受 `^0x[0-9a-fA-F]{40}$`；identity 一律 lowercase；不做 ENS；不把大小写差异当不同钱包。

## External asset identity

Native ETH：

```text
eip155:1/native
```

ERC20：

```text
eip155:1/erc20:<lowercase-contract>
```

`symbol/name` 只用于 display，不能当 identity，不能因为 symbol=USDC 自动映射到 Talli USDC。

## Exact amount

- `eth_getBalance` hex wei -> bigint；
- `alchemy_getTokenBalances.tokenBalance` hex atomic -> bigint；
- `alchemy_getAssetTransfers.rawContract.value` -> bigint；
- 禁止 `Number(hex)`、`parseInt` 后做金额运算；
- provider human `value` 仅用于 audit/display；
- raw atomic + token decimals -> exact decimal text -> 现有 `externalDecimalToAtomic`；
- 无法无损映射到 Talli scale -> `excess_precision`，不得 round。

## Current balance observations

复用 `external_balance_observations`，新增 EVM detail 保存：chain、kind、contract、raw atomic、decimals、sync head block context。

Observation 不是 snapshot。只有明确 Reconcile 才写 V1 snapshot。

## Source objects

新增：

```text
evm_transaction  // primary by tx hash
evm_transfer     // Alchemy indexed movement by uniqueId
```

`evm_transaction` 保存用于重建语义的 sanitized tx+receipt subset；`evm_transfer` 保存 exact rawContract value、from/to/category/block/time/contract。

## Candidate stable key

```text
evm:1:movement:<txhash>
evm:1:gas:<txhash>
```

两者可共享同一 `evm_transaction` primary source；transfer rows 为 cross_check sources。
