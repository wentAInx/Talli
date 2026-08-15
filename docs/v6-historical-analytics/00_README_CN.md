# Talli V6.0 — Historical Net Worth & Analytics

## 任务包定位

本目录是 **Talli V6.0 — Historical Net Worth & Analytics** 的自包含 Codex 工程任务包。

- Repository: `wentAInx/Talli`
- Canonical base release: `v5.1.0`
- Canonical base SHA: `dd39ff06aa52c681f42a0165b2e7a0552c022d09`
- 建议 feature branch: `feat/v6-historical-analytics`
- 任务包冻结日期: 2026-08-15

V6.0 的目标不是把 Talli 改造成交易平台开户、税务软件或成本基础系统，而是在已经冻结的 V1 Ledger + V2 current valuation 之上增加：

1. historical crypto / FX quote observations；
2. App-timezone 日级净资产序列；
3. historical completeness / provenance；
4. asset / asset-class / fiat-currency allocation；
5. home-asset cash-flow trend；
6. income / expense trend；
7. net-worth change decomposition：cash flow / market & FX / trade-rebalance / reconciliation；
8. 显式、可恢复、可中断的 historical refresh workflow。

## 最重要的边界

```text
Ledger quantities
    = source of truth

Historical quotes
    = external / derived observations

Historical net worth
    = Ledger balance at time T
    × historical quote resolution at T

Historical analytics
    = derived read model

Historical quote refresh
    != Ledger mutation
```

任何 provider response、历史价格、历史汇率、图表缓存、分析结果都不得修改：

- `ledger_events`
- `ledger_entries`
- `balance_snapshots`
- transaction semantics
- account native quantity

## 阅读顺序

Codex 在编辑代码前必须按以下顺序阅读：

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `03_ARCHITECTURE_INVARIANTS_CN.md`
3. `04_PROVIDER_RESEARCH_20260815_CN.md`
4. `05_TIME_AND_DAILY_VALUATION_SEMANTICS_CN.md`
5. `06_HISTORICAL_QUOTE_DOMAIN_SPEC_CN.md`
6. `07_HISTORICAL_REFRESH_PIPELINE_CN.md`
7. `08_ANALYTICS_MATH_AND_DECOMPOSITION_CN.md`
8. `09_DATABASE_TARGET_SCHEMA_V60_DRAFT.sql`
9. `11_TYPES_SERVICE_CONTRACTS.ts`
10. `14_BACKUP_V8_SPEC_CN.md`
11. `17_TEST_ACCEPTANCE_CN.md`
12. `18_IMPLEMENTATION_PLAN_CN.md`
13. `21_FINAL_AUDIT_CHECKLIST_CN.md`

同时读取当前 repo 的：

- root `AGENTS.md`
- `src/services/AGENTS.md`
- `src/db/AGENTS.md`
- `src/app/AGENTS.md`
- V1/V2/V5.1 canonical specs
- 当前 source code，而不是只看本文档。

## Phase 0 特别提醒：旧 AGENTS 冲突

当前 release SHA 上：

- root `AGENTS.md` 仍写着 `No historical pricing`；
- `src/services/AGENTS.md` 仍写着 `Do not add ... historical valuation`。

这些是 V2/V4 时代的 scope guard，而 V6 已被正式批准为 derived historical valuation。

**V6 的第一阶段必须更新这些 AGENTS 文字，使它们允许 V6 derived historical valuation，同时保留：**

- Ledger 不变；
- provider I/O 不进入 resolver；
- no background collector；
- no tax / cost basis；
- no auto-post；
- no JS float financial arithmetic；
- no secrets leakage。

不得简单删除这些 guard。

## Definition of Done

V6 只有在以下全部成立时才可进入 Final Audit：

```text
format        PASS
lint          PASS
typecheck     PASS
db:check      PASS
unit          PASS
integration   PASS
build         PASS
security      PASS
Playwright    PASS
source audit  PASS
```

CI 全绿不能替代 source audit。
