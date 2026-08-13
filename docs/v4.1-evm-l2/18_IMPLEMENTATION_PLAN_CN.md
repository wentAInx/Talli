# V4.1 Implementation Plan

# Phase 0 — Baseline

- verify v4.0.0 exact SHA；
- old gates green；
- branch feat/v4.1-evm-l2-sync。

# Phase 1 — Chain domain

- EvmChainId；
- registry；
- generalized keys；
- no implicit chain 1。

Gate：domain unit.

# Phase 2 — Forward migration

- three chain CHECK rebuild；
- operational trace status；
- evm_l2_gas_fee_details；
- V4.0 ID preservation。

Gate：migration + Ethereum regression.

# Phase 3 — Provider routing

- fixed Base/Arb origins；
- chain assertion；
- shared Alchemy key；
- read-method allowlist。

Gate：provider security.

# Phase 4 — L2 balance

- reuse exact balances；
- chain-specific keys；
- row partial；
- mapping/reconcile。

Gate：balance integration.

# Phase 5 — L2 discovery

- Transfers external+erc20 only；
- finalized numeric head；
- pagination；
- discovery_limited metadata。

Gate：discovery tests.

# Phase 6 — Debug trace

- callTracer；
- response parser；
- sanitized trace projection；
- revert propagation；
- native netting；
- Debug capability.

Gate：trace unit/provider tests.

# Phase 7 — Base fee adapter

- raw tx；
- historical GPO getL1Fee；
- getOperatorFee；
- deposit exclusion；
- exact breakdown。

Gate：Base fee matrix.

# Phase 8 — Arbitrum fee adapter

- gasUsedForL1；
- decomposition；
- custom tx exclusions。

Gate：Arbitrum fee matrix.

# Phase 9 — Candidate integration

- chain-aware source fingerprint；
- movement/gas stable keys；
- strict import；
- idempotency。

Gate：integration.

# Phase 10 — Backup v5

- schemaVersion5；
- V1–V5；
- L2 gas detail；
- cross-chain validation。

Gate：backup.

# Phase 11 — UI

- network selector；
- Base/Arb cards；
- coverage/capability；
- fee breakdown；
- bridge boundary；
- mobile。

# Phase 12 — E2E / security

- Base fixture；
- Arbitrum fixture；
- Debug unavailable fixture；
- all frozen regression；
- no live Alchemy。

# Phase 13 — Final audit prep

Codex 返回：

```text
final SHA
changed files
migration
unit/integration/e2e counts
CI run
known limitations
```

不要 merge/tag，交给 ChatGPT 独立审计。
