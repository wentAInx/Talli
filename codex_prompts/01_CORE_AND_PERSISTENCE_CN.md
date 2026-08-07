# Session A — Core & Persistence

继续当前 V1，实现/完成 `08_IMPLEMENTATION_PLAN_CN.md` 的 Phase 0~3。

先读取 `AGENTS.md`、当前代码、当前测试和相关 canonical specs，不要重新设计产品范围。

本轮重点：

- Money exact parsing/formatting 与 M-001..M-006。
- Expense/Income/Transfer/Exchange invariants 与 E/F 测试。
- Snapshot balance engine 与 B-001..B-007。
- SQLite/Drizzle schema、migration、PRAGMA、indexes。
- Ledger command transaction 原子性。
- Account initial balance = snapshot。
- 幂等 default book / asset / category seed，不创建假账户或交易。

使用：

```text
$ledger-domain-guard
$backend-architecture
$sqlite-drizzle-persistence
```

约束：Phase 1 核心测试没有站稳前，不要花大量时间做复杂页面。

完成后运行相关 unit/integration、typecheck/lint/build（按仓库实际 scripts），再用 `$acceptance-gate` 汇报证据。
