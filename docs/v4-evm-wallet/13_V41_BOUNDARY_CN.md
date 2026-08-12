# V4.1 Boundary

V4.0 production chain registry 只有 Ethereum Mainnet。不要显示假支持的 Base/Arbitrum selector。

V4.1 再做 Base(8453) + Arbitrum One(42161)，开工前必须分别解决：

1. internal native transfer coverage；
2. L2 exact total gas fee；
3. finality/safe semantics；
4. chain-specific provider endpoint；
5. chain-native ETH mapping；
6. bridge UX；
7. chain-specific E2E fixtures。

Base 官方网络费有 L2 execution + L1 security 两部分，所以禁止 V4.0 预先写 `gasUsed*effectiveGasPrice` 的 Base “完整 fee”逻辑。

Bitcoin/Solana 建议留到 V5；不要为了未来 UTXO/Solana 把 V4 EVM provider 抽象成过度通用平台。
