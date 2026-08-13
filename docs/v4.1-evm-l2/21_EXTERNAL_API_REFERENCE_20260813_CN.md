# Official API Reference Snapshot — 2026-08-13

实现时允许重新核对最新官方文档。
只使用第一方协议/provider文档做 source of truth。

# Alchemy

Transfers API:
https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers

关键当前事实：
- Base / Arbitrum supported；
- internal transfer data 只在 Ethereum Mainnet / Polygon Mainnet；
- pageKey pagination。

Pricing / capability:
https://www.alchemy.com/docs/reference/pricing-plans

当前：
- Debug API Free ✗
- PAYG ✓
- Enterprise ✓

Debug:
https://www.alchemy.com/docs/chains/debug-api/debug-api-endpoints/debug-trace-transaction

当前：
- `debug_traceTransaction`
- `callTracer`
- `onlyTopCall=false`

Network endpoints:
https://www.alchemy.com/docs/choosing-a-web3-network

当前：
- Base 8453 / base-mainnet.g.alchemy.com
- Arbitrum 42161 / arb-mainnet.g.alchemy.com

Base raw tx:
https://www.alchemy.com/docs/chains/base/base-api-endpoints/eth-get-raw-transaction-by-hash

Arbitrum receipt extension:
https://www.alchemy.com/docs/reference/arbitrumethereum-differences

当前：
`gasUsedForL1` = parent calldata gas in L2 gas units.

# Base

Network fees:
https://docs.base.org/base-chain/network-information/network-fees

当前：
- L2 execution + L1 security；
- GasPriceOracle 0x420000000000000000000000000000000000000F；
- getL1Fee(bytes) exact for fully serialized RLP.

Isthmus:
https://docs.base.org/base-chain/specs/upgrades/isthmus/overview
https://docs.base.org/base-chain/specs/upgrades/isthmus/predeploys

当前：
- mainnet activation 2025-05-09 16:00:01 UTC；
- getOperatorFee(uint256).

Jovian:
https://docs.base.org/base-chain/specs/upgrades/jovian/overview
https://docs.base.org/base-chain/specs/upgrades/jovian/exec-engine

当前：
- mainnet activation 2025-12-02 16:00:01 UTC；
- operator formula changed.
因此 Talli 应 historical eth_call GPO，不本地复制 fork 公式。

Base eth_call:
https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_call

支持 specific block / safe / finalized。

Base finality:
https://docs.base.org/base-chain/network-information/transaction-finality

普通 L2 tx finality 与 7-day withdrawal finalization 不同。

Deposits:
https://docs.base.org/base-chain/specs/protocol/bridging/deposits

type `0x7E`，L2 gas purchased on L1；不是普通 sequenced user-fee path。

OP Stack canonical GasPriceOracle interface:
https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/interfaces/L2/IGasPriceOracle.sol

# Arbitrum

Chain info:
https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info

当前：
- Arbitrum One chain ID 42161；
- Nitro Rollup；
- Alchemy supported；
- Stylus tracing on paid plans；
- sequencer soft confirmation != parent-chain finality。

Gas and fees:
https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees

当前：
- parent poster + child chain fee；
- total fee = child basefee × total child-gas-unit charge；
- receipt includes gasUsedForL1.

Alchemy pre/post Nitro:
https://www.alchemy.com/docs/chains/arbitrum/arbitrum-api-endpoints/arbtrace-transaction

当前：
- arbtrace_* pre-Nitro only (<22,207,815)
- post-Nitro use Geth debug_*.

Nitro source corroboration:
https://github.com/OffchainLabs/nitro/blob/master/system_tests/fees_test.go

当前源码测试使用：
`gasUsedForL2 = receipt.GasUsed - receipt.GasUsedForL1`.

# Important implementation rule

如果官方文档在 Codex 开工时已变化：

1. 记录变化；
2. 以最新第一方文档为准；
3. 不扩大 product scope；
4. 如果变化影响 fee exactness / discovery completeness，
   停止该 chain 的 import capability 并报告，不做猜测。
