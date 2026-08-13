# Talli V4.1 EVM L2 Expansion — Codex 工程任务包

Repository:

```text
wentAInx/Talli
```

Frozen V4.0 baseline:

```text
f981e3e0e454f4d7a8ce0111323c9aceebc2483b
```

Release tag:

```text
v4.0.0
```

V4.0 main release CI:

```text
Run: 31681253835
Quality & Build: PASS
Playwright E2E: PASS
```

推荐开发分支：

```text
feat/v4.1-evm-l2-sync
```

---

# 1. V4.1 正式名称

> **Talli V4.1 — EVM L2 Expansion**
>
> **Base Mainnet + Arbitrum One Read-only Wallet Sync**

V4.1 不是重新开发钱包同步，而是在 V4.0 已审计的 Ethereum Mainnet
Observation / Source / Candidate / Review / Import / Reconcile 架构上，
增加两条 L2 chain adapter：

```text
Ethereum Mainnet    chainId 1        frozen V4.0
Base Mainnet        chainId 8453     V4.1
Arbitrum One        chainId 42161    V4.1
```

---

# 2. 最高优先级原则

```text
L2 chain data != Ledger
```

继续禁止：

- sync 自动写 ledger_events；
- sync 自动写 ledger_entries；
- sync 自动创建 balance snapshot；
- symbol 自动映射；
- approximate gas 作为 exact；
- bridge 自动跨链匹配；
- private key / mnemonic / signing；
- 自定义 RPC URL；
- live provider CI。

只有：

```text
用户明确 Import
用户明确 Reconcile
```

才允许进入现有 V1 writer / snapshot writer。

---

# 3. V4.1 的关键事实边界

Alchemy `alchemy_getAssetTransfers` 当前支持 Base / Arbitrum，
但 **internal transfer data 只在 Ethereum Mainnet / Polygon Mainnet 提供**。

因此：

```text
Base / Arbitrum historical discovery
= discovery_limited
```

即使 Debug API 可用，也只能对“已经发现的 tx hash”做完整 call trace。
Talli 不得声称整段 L2 历史是 complete。

如果 Alchemy Debug API 不可用：

```text
Current balance sync      可用
ERC20 balance             可用
Reconcile                 可用（exact mapping 后）
L2 movement review/import 禁用
Activity cursor           不推进
```

Alchemy 当前 Free plan 不包含 Debug API；PAYG / Enterprise 包含。
不要在代码中硬编码商业价格，只识别 capability。

---

# 4. 推荐阅读顺序

1. `00_README_CN.md`
2. `01_CODEX_MASTER_INSTRUCTION_CN.md`
3. `02_PRODUCT_ENGINEERING_BRIEF_CN.md`
4. `03_SCOPE_CAPABILITY_DECISION_CN.md`
5. `04_CHAIN_REGISTRY_DOMAIN_SPEC_CN.md`
6. `05_DATABASE_TARGET_SCHEMA_V41_DRAFT.sql`
7. `06_V40_TO_V41_MIGRATION_PLAN_CN.md`
8. `07_TYPES_SERVICE_CONTRACTS.ts`
9. `08_ALCHEMY_MULTI_CHAIN_PROVIDER_SPEC_CN.md`
10. `09_L2_DISCOVERY_AND_TRACE_SPEC_CN.md`
11. `10_BASE_EXACT_FEE_SPEC_CN.md`
12. `11_ARBITRUM_EXACT_FEE_SPEC_CN.md`
13. `12_FINALITY_CURSOR_IDEMPOTENCY_CN.md`
14. `13_BRIDGE_BOUNDARY_CN.md`
15. `14_SECURITY_CAPABILITY_SPEC_CN.md`
16. `15_BACKUP_V5_SPEC_CN.md`
17. `16_UI_UX_SPEC_CN.md`
18. `17_TEST_ACCEPTANCE_CN.md`
19. `18_IMPLEMENTATION_PLAN_CN.md`
20. `19_NON_GOALS_V42_BOUNDARY_CN.md`
21. `20_L2_FIXTURES.json`
22. `21_EXTERNAL_API_REFERENCE_20260813_CN.md`
23. `22_RISK_REGISTER_CN.md`
24. `23_RELEASE_AUDIT_CHECKLIST_CN.md`
25. `CODEX_HANDOFF_PROMPT.txt`

`MANIFEST.tsv` 提供 SHA-256 完整性信息。
