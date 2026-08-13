# V4.1 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| L2 Transfers API 不含 internal history | Critical | discovery_limited 永久可见；known tx 才 trace |
| Debug paywall 被误当完整 history | Critical | capability gate；unavailable 禁 movement import |
| trace root + external row double count | Critical | L2 native movement trace authoritative |
| reverted child trace被计入 | Critical | ancestor revert propagation |
| Base 少记 L1 fee | Critical | historical GPO getL1Fee |
| Base 少记 operator fee | Critical | historical getOperatorFee / pre-Isthmus 0 |
| Base 本地 fork公式过时 | High | 不本地重算 fork formula |
| Arbitrum parent fee double count | Critical | total=gasUsed*price；component decomposition only |
| Arbitrum gasUsedForL1 missing | High | unresolved / no import |
| Bridge 被自动匹配错 | Critical | no auto bridge correlation |
| symbol spoof | High | chain+contract identity |
| same address cross-chain collision | High | chain-aware uniqueness/source key |
| arbitrary RPC exfiltrates key | Critical | fixed registry origins |
| debug/raw/eth_call accidentally扩成 write surface | High | strict method + contract allowlist |
| pre-Nitro Arbitrum误称支持 | High | explicit unsupported boundary |
| cursor在 incomplete activity推进 | High | all-or-none activity commit |
| capability state进入 backup | Medium | operational exclude |
| backup跨链 identity混乱 | High | schemaVersion5 chain validation |
