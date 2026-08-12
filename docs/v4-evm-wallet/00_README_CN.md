# Talli V4 — EVM Wallet & On-chain Sync

Repository: `wentAInx/Talli`  
Frozen V3 baseline: `51a7f0c346c10c8bcd4e29261730eee5eb360df5`  
Release tag: `v3.0.0`  
V3 main CI: `31598308119` — Quality & Build / Playwright E2E 均通过。

## 正式范围

> **V4.0 = Ethereum Mainnet Read-only Wallet Sync**

V4.0 先把 Ethereum Mainnet 做到可审计、可重复同步、可安全导入。Base / Arbitrum 放到 V4.1，不在本轮 production allowlist。

原因不是 Alchemy 不支持 L2，而是 correctness-first：Alchemy Transfers API 当前对 internal native transfer 的支持边界与 L2 不完全一致；Base 网络费还包含 L2 execution fee + L1 security fee。V4.0 不复制 Ethereum 逻辑后假装多链已正确。

## 数据责任

```text
V1 Ledger        = 用户确认后的财务事实
V2 Valuation     = 派生市场估值
V3 Kraken Sync   = 交易所观测/候选
V4 On-chain Sync = 公链地址观测/来源对象/候选
```

最高红线：`On-chain data != Ledger`。

Sync 不得自动写 `ledger_events` / `ledger_entries` / `balance_snapshots`；只有用户明确 Import / Reconcile 才能进入已有 V1 writer。

## V4.0 用户能力

- 配置 server-only `ALCHEMY_API_KEY`；
- 添加一个或多个 Ethereum Mainnet **公开地址**；
- 手动 Sync；
- 读取 ETH + ERC-20 当前余额；
- 显示 token contract / symbol / decimals；
- 映射到 Talli asset + account；
- observed balance vs Ledger balance + explicit reconciliation；
- 读取 external/internal/ERC20 transfer activity；
- 按 tx hash 生成 movement candidate；
- 单独生成 Ethereum gas expense candidate；
- simple in/out/exchange 可 review/import；
- complex DeFi / bridge / multi-asset tx 只保存来源与净变动，不自动解释；
- re-sync 不重复 source/candidate/import。

## 明确不做

Base/Arbitrum production import、Bitcoin、Solana、Tron、NFT、DeFi positions、WalletConnect、private key、seed phrase、签名/广播、cron/webhook、auto-import、contract ABI 自动解码、Alchemy Prices、tax/P&L/cost basis。

## 阅读顺序

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_ENGINEERING_BRIEF_CN.md`
3. `03_DOMAIN_AND_IDENTITY_SPEC_CN.md`
4. `04_DATABASE_TARGET_SCHEMA_V4_DRAFT.sql`
5. `05_MIGRATION_PLAN_CN.md`
6. `06_ALCHEMY_PROVIDER_SPEC_CN.md`
7. `07_ACTIVITY_AND_GAS_SPEC_CN.md`
8. `08_SECURITY_SPEC_CN.md`
9. `09_BACKUP_V4_SPEC_CN.md`
10. `10_UI_UX_SPEC_CN.md`
11. `11_TEST_ACCEPTANCE_CN.md`
12. `12_IMPLEMENTATION_PLAN_CN.md`
13. `13_V41_BOUNDARY_CN.md`
14. `14_EXTERNAL_API_REFERENCE_20260812_CN.md`
15. `15_FIXTURES.json`
16. `CODEX_HANDOFF_PROMPT.txt`
