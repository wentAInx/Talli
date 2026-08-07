# Session D — V1 Final Audit

这是 V1 收尾审计，不新增功能。

先阅读 `AGENTS.md`、`07_TEST_ACCEPTANCE_CN.md`、`09_NON_GOALS_AND_V2_BOUNDARY_CN.md` 和当前 git diff/status。

请使用 subagents 做**并行只读审计**，等待四者都完成：

- `domain_auditor`：Money/Ledger/Snapshot/Report/Backup/V1 scope
- `architecture_auditor`：layering/transactions/query bounds/scope
- `ui_auditor`：UI/UX/mobile/numerical presentation/no valuation
- `test_auditor`：acceptance matrix/test gaps/build gate

不要让多个 subagents 同时修改代码。

汇总四个审计结果后，由主 agent 按严重性逐项修复真正的问题。每一轮修复后运行最相关测试，不为“让测试绿”而削弱 canonical assertions。

随后显式运行 `$acceptance-gate`，覆盖 V1 完整 Definition of Done：

- lint
- typecheck
- unit/integration tests
- build
- configured critical Playwright E2E
- V1 non-goal / no-price / no-cross-asset-valuation scan

最终报告必须列出：实现摘要、架构决策、migration、文件变更、实际命令与结果、未完成/已知限制、完整 acceptance 状态，并确认没有实现 V2 功能。
