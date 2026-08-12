# Activity Normalization & Gas

## Net movement

按 tx hash 分组，transfer 相对 wallet：

```text
from wallet -> negative
to wallet   -> positive
self        -> net zero
```

按 provider asset key 聚合 exact atomic，最终 0 leg 删除。

分类：

- 1 positive only -> `simple_in`, role `external_in`, suggestion `unknown`；
- 1 negative only -> `simple_out`, role `external_out`, suggestion `unknown`；
- 1 negative A + 1 positive B, A!=B -> `simple_exchange`, roles source/destination, suggestion exchange；
- 3+ nonzero assets / multiple directions -> `complex`, status unsupported；
- no net movement -> no movement candidate。

Failed receipt：movement 不可导入；若 indexed source 与 failed status 冲突，标记 unsupported/source inconsistency。

## Gas candidate

只有 `tx.from == wallet` 才是 fee payer。

Execution fee：

```text
BigInt(gasUsed) * BigInt(effectiveGasPrice)
```

Blob tx 若同时有 `blobGasUsed` + `blobGasPrice`：再加 blob fee。若 blob tx 必要字段缺失，gas status unresolved，不得少记后称 complete。

Gas candidate：

```text
stableKey = evm:1:gas:<txhash>
classification = gas_only
suggested event = expense
one external_out native ETH leg
```

Import 后 V1 Expense：mapped ETH wallet account，payee `Ethereum Network`。

Failed tx 仍可有 exact gas expense。

Gas **不**塞进 movement candidate fee leg，避免 one candidate 创建多 events；movement/gas 在 UI 同 tx hash 分组。

## Import

- simple_in：用户选 Transfer / Income / Ignore；
- simple_out：Transfer / Expense / Ignore；
- simple_exchange：Exchange；
- complex：无 Import button；
- gas：Expense。

所有 import 继续走 existing `createLedgerEventIn(...)` / V1 invariants；provenance 与 candidate status 在同一 `BEGIN IMMEDIATE` 原子提交。
