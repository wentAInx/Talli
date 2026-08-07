# Session A0 — Bootstrap / Plan

请把当前目录视为本项目 V1 的唯一工程工作区。

先不要直接堆 UI。首先：

1. 阅读根目录 `AGENTS.md`、`CODEX_ARCHITECTURE_DEFAULTS_CN.md`、`MANIFEST.tsv`、`00_README_CN.md`，再按 `00_README_CN.md` 的顺序阅读 canonical spec。
2. 检查 `.agents/skills/` 和 `.codex/agents/`，确认你理解这些 repo-local 工程护栏。
3. 检查仓库当前状态；如果还没有应用代码，按照 `08_IMPLEMENTATION_PLAN_CN.md` 规划 Phase 0~10。
4. 给出一个简洁执行计划，按 `CODEX_ARCHITECTURE_DEFAULTS_CN.md` 的默认选择明确 Phase 0~3 的文件结构、依赖、better-sqlite3/Drizzle 接入、测试结构和验证命令；只有出现经验证的兼容性问题才偏离默认值。
5. 对未由规范强制指定的实现细节，选择最简单、最保守、适合单用户 SQLite 自托管 V1 的方案，不引入微服务、Redis、队列、GraphQL、行情、汇率、多用户或复杂状态管理。
6. 然后直接开始 Phase 0。每完成一个小阶段就运行相关验证；不要伪造结果。

本 session 的目标优先完成/推进 Phase 0~3：Tooling、Money/Domain、Persistence/Commands、Seed。复杂产品 UI 留到下一 session。

在涉及账本语义和持久化时显式使用：

```text
$ledger-domain-guard
$backend-architecture
$sqlite-drizzle-persistence
```

在结束前使用 `$acceptance-gate` 对本 session 已完成范围做验证，并汇报实际命令结果、未完成项和下一阶段建议。
