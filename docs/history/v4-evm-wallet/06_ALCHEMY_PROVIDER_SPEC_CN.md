# Alchemy Provider Spec

## Credential / endpoint

```text
ALCHEMY_API_KEY
credentialRef = env:alchemy.primary
fixed origin = https://eth-mainnet.g.alchemy.com
```

API key 在 `/v2/<key>` URL path 中，因此绝不能 log full URL / response.url。

不允许用户配置 RPC URL；测试使用 injectable transport，不使用 `ALCHEMY_BASE_URL`。

## Read allowlist

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

首次 sync `eth_chainId` 必须 `0x1`，否则拒绝。

## Current balances

Native：`eth_getBalance(address,"latest")`，hex wei -> bigint。

ERC20：`alchemy_getTokenBalances(address,"erc20",options)`，完整 pageKey；nonzero token 拉 `alchemy_getTokenMetadata`；zero 默认不创建新 observation；token error 不能当 0。

## Activity

分别查询：

```text
fromAddress = wallet
toAddress   = wallet
category = external, internal, erc20
withMetadata = true
excludeZeroValue = false
order = asc
```

完整消费 pageKey；同一 uniqueId 双向出现时 dedupe。

金额算术必须使用 `rawContract.value`；故意构造 human `value` 与 raw 不一致的测试，normalized amount 必须跟 raw。

## Finalized history

用 `eth_getBlockByNumber("finalized", false)` 得 finalized head，Transfers `toBlock` 固定到该 block。Current balance 仍是 latest；UI 明确区分。

首次 history start date -> block：用 `eth_getBlockByNumber` 对 `[0, finalizedHead]` timestamp binary search，最多约 32 次；不引入另一个 vendor API。

后续 cursor：`fromBlock=max(initialStart,lastFinalized-32)`；正确性来自 uniqueId/txHash/stable key，不来自 cursor。

## Tx enrichment

对活动 tx hash 获取 `eth_getTransactionByHash` + `eth_getTransactionReceipt`，生成 `evm_transaction` primary source；Transfers 是 cross_check sources。

## Error

分类：CONFIG/AUTH/CHAIN_MISMATCH/RATE_LIMITED/UPSTREAM/INVALID_PAYLOAD/NETWORK/PAGINATION_EXPIRED。分页任一方向不完整时不持久化 partial activity candidate set、不推进 cursor；旧成功数据保留。

## DB boundary

任何 Alchemy HTTP 时 `sqlite.inTransaction` 必须 false。
