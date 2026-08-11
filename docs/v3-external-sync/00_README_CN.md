# Talli V3 External Sync Codex 工程任务包

Repository: `wentAInx/Talli`

Frozen V2 engineering baseline:

```text
ad0de1d26d060fd391449f869a5c99a36f1901ed
```

该 baseline 对应 GitHub Actions run `31470971297`，Quality & Build 与 Playwright E2E 均通过。

## V3 正式范围

> **Talli V3 — External Sync Foundation & Kraken Read-only Integration**

本任务包包含：

1. **V3.0 External Sync Foundation**
2. **V3.1 Kraken Spot Read-only Sync**
3. **V3.2 Review & Import Foundation**

不包含：

- Kraken Futures
- 钱包链上同步
- Coinbase/Binance/OKX
- WebSocket
- 定时 cron
- 自动导入
- 自动余额调整
- 交易/提现 API
- V2.1 历史净资产
- tax / cost basis / P&L
- OCR / AI

## 最高优先级原则

```text
V1 Ledger       = 用户确认后的财务事实
V2 Valuation    = 派生市场估值
V3 External Sync= 外部观测与待确认候选
```

必须保持：

```text
External API != Ledger
```

禁止：

```text
Kraken API -> 直接 UPDATE account balance
Kraken API -> 直接 INSERT ledger_entries
```

正确路径：

```text
Kraken
  ↓
Source Object / Balance Observation / Candidate
  ↓
用户 Review
  ↓
已有 V1 invariant + writer
```

余额也只能：

```text
External Observation
  ↓
显示差异
  ↓
用户明确确认
  ↓
ReconciliationService -> snapshot
```

## 开工前 release preflight

推荐先使：

```text
main
feat/v2-valuation
v2.0.0
```

都指向 `ad0de1d26d060fd391449f869a5c99a36f1901ed`，或仅包含 release metadata 的明确 descendant。

若当前 repo 不满足，不得擅自 reset/rebase/force push；先报告。

## 阅读顺序

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md`
3. `03_EXTERNAL_SYNC_DOMAIN_SPEC_CN.md`
4. `04_DATABASE_SCHEMA_V3_DRAFT.sql`
5. `05_TYPES_AND_SERVICE_CONTRACTS.ts`
6. `06_KRAKEN_PROVIDER_IMPLEMENTATION_SPEC_CN.md`
7. `07_SYNC_IDEMPOTENCY_STATE_MACHINE_CN.md`
8. `08_CREDENTIALS_SECURITY_SPEC_CN.md`
9. `09_CANDIDATE_NORMALIZATION_IMPORT_SPEC_CN.md`
10. `10_BACKUP_V3_MIGRATION_SPEC_CN.md`
11. `11_UI_UX_SPEC_CN.md`
12. `12_TEST_ACCEPTANCE_CN.md`
13. `13_IMPLEMENTATION_PLAN_CN.md`
14. `14_NON_GOALS_AND_FUTURE_BOUNDARY_CN.md`
15. `15_KRAKEN_FIXTURES.json`
16. `16_EXTERNAL_API_REFERENCE_20260811_CN.md`
17. `CODEX_HANDOFF_PROMPT.txt`
