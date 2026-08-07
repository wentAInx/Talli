# Codex App 开发环境配置包说明

这是原始「多资产个人记账 App V1」工程任务包的**整合增强版**。原有 00~10 规范、数据库逻辑 schema、类型契约、验收计划、seed、handoff prompt 均原样保留；新增内容只负责让 Codex 更稳定地执行这些规范，不改变产品范围或账本语义。

## 新增内容

```text
AGENTS.md                         # 每个 Codex session 自动加载的项目级硬约束
CODEX_ARCHITECTURE_DEFAULTS_CN.md # 原规范未拍板处的工程默认值
.agents/skills/
  backend-architecture/          # 后端分层、服务边界、依赖方向
  ledger-domain-guard/           # Money / Ledger / Snapshot / Report 领域护栏
  sqlite-drizzle-persistence/    # SQLite / Drizzle / migration / transaction / backup
  finance-ui-review/             # 本记账产品特有 UI/UX 规则
  acceptance-gate/               # 验收矩阵与完成前验证
.codex/
  config.toml                    # project-scoped subagent 配置
  agents/
    domain-auditor.toml
    architecture-auditor.toml
    ui-auditor.toml
    test-auditor.toml
codex_prompts/
  00_BOOTSTRAP_AND_PLAN_CN.md
  01_CORE_AND_PERSISTENCE_CN.md
  02_PRODUCT_UI_CN.md
  03_REPORT_BACKUP_HARDEN_CN.md
  04_FINAL_AUDIT_CN.md
src/app/AGENTS.md                # UI 目录局部规则
src/domain/AGENTS.md             # Domain 目录局部规则
src/db/AGENTS.md                 # Persistence 目录局部规则
e2e/AGENTS.md                    # E2E 目录局部规则
optional/PLAYWRIGHT_MCP_CN.md     # 可选浏览器 MCP 配置
```

## 为什么不是再安装一个泛化“后端架构 Skill”

本项目的真正风险不是不知道 Clean Architecture，而是 Coding Agent 在实现过程中逐步破坏已经明确的财务语义，例如：金额偷偷转成 `number`、把 transfer/exchange 混在一起、snapshot 边界写错、报表把换汇本金算成收入支出、为了 Dashboard 顺手引入估值层。

因此这里的 repo-local Skills 直接围绕本项目的 canonical spec 建立，不再导入另一套可能冲突的架构哲学。

## 直接使用

1. 把本目录作为项目根目录并初始化 Git（如果尚未初始化）。
2. 使用当前稳定 Node LTS；默认 pnpm（已有其他 package manager 时保持已有选择）。具体依赖版本让 Codex 在 Phase 0 初始化时记录到 lockfile，不在本配置包里硬编码未来会过时的版本。
3. 从项目根目录启动 Codex。Codex 会自动读取 `AGENTS.md`。
4. 首轮建议使用 `codex_prompts/00_BOOTSTRAP_AND_PLAN_CN.md`。
5. 后续按 01 → 04 分 session/阶段推进。大型项目分阶段比把整个 V1 塞进一个长 session 更稳定。

## Skills 不需要额外“安装”

这里新增的是 repo-local skills，路径位于 `.agents/skills/`。Codex 会按 skill 的 name/description 发现它们；也可以显式使用，例如：

```text
$ledger-domain-guard
$backend-architecture
$sqlite-drizzle-persistence
$finance-ui-review
$acceptance-gate
```

你已经安装的全局前端 Skills 保持不变。UI 任务推荐组合：

```text
$frontend-design
$finance-ui-review
$react-best-practices
$web-design-guidelines
```

## Playwright / Browser

任务包本身要求 Playwright E2E。若你还希望 Codex 能直接操控浏览器做视觉检查，可继续使用你现有的 Playwright MCP；本包没有强行写入 MCP server，以避免覆盖你的全局 Codex 配置或在离线环境自动拉取包。

如果未配置，可在 Codex 侧自行添加 Playwright MCP，或者直接让 Codex 使用项目内 Playwright test/CLI 进行 E2E。最终 UI 验收应至少覆盖桌面和手机宽度、console error、表单验证、交易录入关键路径。

## 推荐的 session 划分

### Session A — Core

Phase 0~3：Repo/Tooling → Money/Domain → Persistence/Commands → Seed。

目标：先把 M/E/B 核心测试和 transaction 语义做对，暂不追求复杂 UI。

### Session B — Product UI

Phase 4~6：Accounts → Transaction UI → Dashboard。

目标：完整跑通五类用户操作，并保持 UI 不含业务规则。

### Session C — Data features

Phase 7~10：Filters → Reports → Backup/Restore → Hardening。

目标：补齐分页、月度报表、lossless backup、错误/空状态、mobile/a11y。

### Session D — Final audit

调用四个只读 subagents 并行审计，再由主 agent 串行修复。最后执行完整验证 gate。

## 重要说明

- `V1_MULTI_ASSET_LEDGER_CODEX_ENGINEERING_PACKAGE_CN.md` 是合并阅读版；真正执行时仍以原始分文件与 `01_CODEX_MASTER_INSTRUCTION_CN.md` 的优先级为准。
- 新增配置没有增加行情、汇率、多用户、AI/OCR、预算等 V2/V1.1 功能。
- `.codex/config.toml` 不固定具体模型，避免与你当前 Codex 订阅、模型选择和未来模型变动冲突。
- 原始 `MANIFEST.tsv` 仍只校验原任务包文件；新增配置文件由 `CODEX_ENV_MANIFEST.tsv` 单独记录，避免破坏原任务包的完整性校验。
