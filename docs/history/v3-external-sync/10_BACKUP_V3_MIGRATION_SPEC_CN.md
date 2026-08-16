# Backup V3 / Migration Spec

## schemaVersion

V3 export：

```text
schemaVersion = 3
```

必须接受：

```text
V1 = 1
V2 = 2
V3 = 3
```

## Include

V3 user/fetched/provenance data：

```text
externalConnections
externalAssetMappings
externalAccountMappings
externalBalanceObservations
externalSourceObjects
externalTransactionCandidates
externalCandidateSourceObjects
externalTransactionLegs
externalImportLinks
```

## Exclude

Operational：

```text
externalConnectionState
externalSyncRuns
```

继续排除 V2 cache：

```text
latestPriceQuotes
priceProviderState
```

永不包含：

```text
KRAKEN_API_KEY
KRAKEN_API_SECRET
API-Sign
nonce request data
```

## V1→V3

复用既有 V1→V2 migration；
V3 arrays = []；
不创建 Kraken connection；
balances 不变。

## V2→V3

保留全部 V2 user settings/manual quotes；
V3 arrays = []；
不自动连接 Kraken。

## Validation

写前验证：

- connection book exists
- provider/credentialRef allowed
- mapping FK valid
- account.asset matches mapping
- source uniqueness
- candidate stable uniqueness
- candidate source links valid
- legs asset/decimal/atomic valid
- import link candidate/ledger event valid
- imported candidate max one link

## Atomic restore

```text
validate whole payload
→ BEGIN IMMEDIATE
→ write V1/V2/V3
→ foreign_key_check
→ COMMIT
```

后段 V3 insert 失败必须全部 rollback。

## Seed-only

V3 默认不 seed external connection。
用户一旦创建 external configuration，DB 不再是 pristine seed-only restore target。
