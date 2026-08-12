# Official API Reference Snapshot — 2026-08-12

实现前可重新核对**官方**文档；不要用第三方博客替代协议事实。

## Alchemy Transfers API
`https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers`

当前：`alchemy_getAssetTransfers` 可查 address history、支持 Ethereum 与多个 L2；internal transfer data 当前明确仅 Ethereum Mainnet + Polygon Mainnet；返回 pageKey；`withMetadata=true` 可提供 timestamp；payload 含 rawContract。

## Token balances
`https://www.alchemy.com/docs/data/token-api/token-api-endpoints/alchemy-get-token-balances`

`alchemy_getTokenBalances` 返回 ERC20 balances；`tokenBalance` 为 hex atomic quantity；支持 pagination options/pageKey。

## Token metadata
`https://www.alchemy.com/docs/reference/token-api-overview`

`alchemy_getTokenMetadata` 提供 decimals/name/symbol；symbol/name 仅 display。

## Native balance
Alchemy standard Ethereum JSON-RPC `eth_getBalance` 返回 wei hex quantity。

## Deprecated/Beta history endpoint
`https://www.alchemy.com/docs/data/beta-apis/beta-api-endpoints/beta-api-endpoints/get-transaction-history-by-address`

当前官方将 `transactions/history/by-address` 标为 Beta / scheduled for deprecation，并建议使用 `alchemy_getAssetTransfers`，所以 V4.0 不把它作为核心依赖。

## Transfers pagination
`https://www.alchemy.com/docs/reference/transfers-api-quickstart`

当前官方说明 pageKey 需继续消费至结束，并有 TTL；V4 activity snapshot 必须完整分页，否则不推进 cursor。

## Base fee boundary (V4.1)
`https://docs.base.org/base-chain/network-information/network-fees`

Base 官方说明 transaction cost 有 L2 execution fee + L1 security fee；V4.1 需专门 fee adapter。

## CI
自动测试不得调用真实 Alchemy；真实 key 不需要放 GitHub Actions Secrets。
