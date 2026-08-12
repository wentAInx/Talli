# Backup V4

Export `schemaVersion=4`，继续接受 1/2/3/4。

V4 include：现有 V1/V2/V3 user facts + `externalConnections.sourceKey` + `evmWalletConnections` + `evmBalanceObservationDetails` + `evmCandidateDetails`。

Exclude：`externalConnectionState`、`externalSyncRuns`、`evmWalletConnectionState`、V2 derived cache、Kraken/Alchemy secrets。

V3→V4 in-memory upgrade：所有 Kraken connection `sourceKey=kraken:primary`；V4 arrays `[]`；其他 V3 facts 不变。V1/V2 沿用现有 upgrade 链，不复制第二套旧逻辑。

Validate：

- Kraken：provider/sourceKey/credentialRef 一致；
- EVM：provider=`evm_wallet`、credential=`env:alchemy.primary`、sourceKey 与 chain/address subtype 一致；
- chainId=1/network=eth-mainnet；
- valid lowercase address；
- EVM asset key 格式；
- Kraken connection 只能引用 kraken source types，EVM 只能 evm types；
- candidate stable key namespace；
- raw atomic integer text；
- import link book/connection relationship；
- no secret-like protected fields。

Restore 继续：full validate -> BEGIN IMMEDIATE -> all rows -> FK check -> row-count verify -> COMMIT；后段 V4 failure 必须 V1/V2/V3/V4 全 rollback。
