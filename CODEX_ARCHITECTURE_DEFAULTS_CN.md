# Codex 工程默认值（非 canonical 产品规范）

本文件用于减少 Codex 在原任务包未完全指定的技术细节上反复摇摆。

如果本文件与 01/03/07/04/05 等 canonical spec 冲突，以 canonical spec 为准。如果仓库已经稳定采用了等价技术选择，不要为了匹配本文件而无意义重写。

## 1. Runtime / package

- Node.js 当前 LTS 线。
- TypeScript strict。
- 默认使用 pnpm 并提交 lockfile；若仓库已经采用 npm/yarn，则保持已有 package manager。
- 不固定 Codex 模型，不把模型选择写进项目文件。

## 2. Next.js application shape

- Next.js App Router。
- Server Components 作为默认读取/页面组合方式。
- 普通站内 mutation 默认 Server Actions。
- Route Handlers 只用于明显 HTTP/file-shaped 的边界，例如 JSON backup 下载、CSV 导出、restore 上传/处理，或未来确实需要的 API 边界。
- 不额外建立 Express/Nest/Fastify 后端进程。

## 3. SQLite / Drizzle

默认：

```text
better-sqlite3
+ drizzle-orm
+ drizzle-kit
```

理由：V1 是单进程、本地 SQLite、自托管应用；同步 SQLite transaction 边界简单明确，不需要网络数据库 client。

除非当前运行环境存在经验证的兼容性问题，不要主动换成远程 libSQL/Turso 或其他网络数据库。

DB 初始化必须显式设置：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

## 4. Validation / exact arithmetic

- Zod 用于 server boundary / backup payload 等结构校验。
- `bigint` 用于账本 atomic arithmetic。
- `decimal.js` 只用于需要十进制比率的派生展示（例如 executed exchange rate）；不把 decimal/floating result 写回 ledger。
- 禁止为了表单方便把金额 canonical state 转成 JS number。

## 5. IDs / time

- ID 默认 `crypto.randomUUID()`，避免引入额外 ID 包。
- DB timestamp 存 UTC ISO string。
- App timezone 由 settings 明确保存；月边界必须使用该 timezone 显式计算 UTC range。
- 禁止依赖服务器本地 timezone 隐式决定报表月份。

## 6. Application state

- 不引入 Redux/Zustand 等全局状态库作为默认方案。
- 服务端数据以 Server Components / revalidation 为主。
- 筛选/分页优先 URL search params。
- 表单临时交互使用局部 client state；复杂表单若确实需要 form helper，可选择轻量方案，但不要让 form library 成为 domain source of truth。

## 7. Persistence/query shape

建议 concrete modules：

```text
src/db/index.ts
src/db/schema.ts
src/db/migrations/
src/db/queries/accounts.ts
src/db/queries/events.ts
src/db/queries/balances.ts
src/db/queries/reports.ts
src/db/queries/settings.ts
```

服务层建议：

```text
src/services/ledger-command-service.ts
src/services/account-service.ts
src/services/reconciliation-service.ts
src/services/report-service.ts
src/services/backup-service.ts
```

不要创建 `BaseRepository<T>` / generic DAO hierarchy。

## 8. Pagination

交易流水默认 keyset/cursor pagination，而不是一次读取全部历史。

排序语义与 canonical spec 对齐：

```text
occurredAt DESC
createdAt DESC
id (deterministic tie-breaker)
```

Cursor 应覆盖足够字段保证稳定翻页。

## 9. UI stack

- Tailwind CSS。
- shadcn/ui 或等价轻量 headless/component layer。
- 已安装的 `$frontend-design`、`$react-best-practices`、`$web-design-guidelines` 配合 repo-local `$finance-ui-review`。
- 不引入大型 dashboard/theme framework。
- 金额统一 tabular numerals，资产 code 可读，移动端优先。

## 10. Testing

- Vitest：Money/domain unit tests。
- Vitest + isolated temporary SQLite DB：persistence/integration tests。
- Playwright：关键用户 E2E。
- 测试日期/金额确定性；每个 integration test 或 suite 使用隔离 DB，避免依赖开发数据库。

## 11. Dependency policy

新增 production dependency 前问自己：

1. 标准库/现有依赖是否足够？
2. 它是否解决 V1 当前明确问题？
3. 它是否会引入网络服务、后台 daemon 或复杂 runtime？
4. 它是否让财务正确性更难审计？

若收益不明确，不新增。
