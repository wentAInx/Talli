# V4.1 Independent Final Audit Checklist

交给 ChatGPT：

```text
Repository: wentAInx/Talli
Branch: feat/v4.1-evm-l2-sync
Final SHA: <exact>
Actions run: <id/url>
```

审计重点：

## Baseline
- descendant of `f981e3e0e454f4d7a8ce0111323c9aceebc2483b`；
- v4.0.0 unchanged；
- forward-only migration。

## Chain identity
- 1 / 8453 / 42161；
- source/asset/candidate keys chain-aware；
- same address cross-chain allowed。

## Provider
- fixed origins；
- exact chainId assertions；
- Base/Arb Transfers no internal category；
- no live Alchemy CI。

## Trace
- paid capability gate；
- discovery_limited visible；
- native call trace exact；
- no double count；
- revert propagation；
- no unsafe fallback.

## Base fee
- raw tx；
- historical GPO；
- operator fee；
- type 0x7e exclusion；
- exact component sum。

## Arbitrum fee
- gasUsedForL1；
- correct decomposition；
- custom tx boundary；
- no double count。

## Ledger
- sync no mutation；
- explicit import/reconcile only；
- same V1 writer；
- atomic provenance；
- resync idempotent。

## Backup
- schemaVersion5；
- V1–V5；
- L2 fee detail；
- secrets/operational excluded；
- rollback.

## UI
- coverage warning；
- capability；
- fee breakdown；
- bridge non-correlation；
- mobile.

Final verdict：

```text
Critical
High
Medium
Low

V4.1 Architecture
V4.0 Regression
Provider Compatibility
Trace Correctness
Fee Exactness
Ledger Isolation
Backup
CI

GO / NO-GO
```
