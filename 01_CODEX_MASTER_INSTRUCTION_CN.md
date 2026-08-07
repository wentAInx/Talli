# Codex 主执行指令

你是该项目的主工程实现代理。请先完整阅读本任务包所有规范文件，再开始创建或修改代码。

## A. 优先级

出现冲突时，按以下优先级执行：

1. 本文件中的硬约束。
2. `03_DOMAIN_LEDGER_SPEC_CN.md` 的账本语义。
3. `07_TEST_ACCEPTANCE_CN.md` 的验收条件。
4. `04_DATABASE_SCHEMA.sql` 与 `05_TYPES_AND_SERVICE_CONTRACTS.ts`。
5. UI/实施建议。

若规范存在轻微歧义，选择**最简单、最保守、最符合 V1 边界**的实现，不要主动扩展功能。

## B. 核心硬约束

### B1. V1 不得访问任何外部行情或汇率 API

不得实现或预埋自动调用：

- CoinGecko
- CoinMarketCap
- Coinbase
- Kraken
- Binance
- ECB
- ExchangeRate API
- 任何 Forex/Crypto price API

可以预留纯接口类型，但不得产生网络请求、定时任务、后台抓价服务或 API key 配置。

### B2. 禁止统一折算

不得提供：

- base currency / home currency
- CNY 等值
- USD 等值
- 总净资产单一数字
- 统一币种月支出
- 资产收益率
- Crypto P&L

所有资产在 V1 中必须按原生单位单独展示。

### B3. 金额禁止浮点

- 数据库存储金额必须是十进制最小单位整数的字符串，例如 `"12345"`。
- TypeScript 领域层使用 `bigint` 表示原子单位。
- 禁止用 JS `number` 表示余额、交易金额或可持久化汇率。
- 禁止 SQLite `REAL` 存储金额。
- UI 输入使用字符串解析。
- 输入小数位超过资产 `scale` 时直接报错，不做静默四舍五入。

### B4. 账本与估值分离

V1 只有 Ledger，没有 Valuation。

任何账户余额只能由：

1. 余额锚点（balance snapshot/reconciliation）；以及
2. 锚点之后的 ledger entries

推导。

不得因为任何“价格”概念修改 ledger entries。

### B5. Transfer 与 Exchange 必须区分

- `transfer`：来源和去向账户必须是**同一 asset**。
- `exchange`：来源和去向账户必须是**不同 asset**。
- 不得用一个通用“转账”类型把二者混在一起。

### B6. 余额调整不是收入

Balance Adjustment / Reconciliation：

- 创建余额锚点。
- 不计入收入。
- 不计入支出。
- 不创建人为的“差额收入/差额支出”。

### B7. 报表不得把换汇算成消费

- 支出：只统计 `expense` 事件的 main entry，以及 transfer/exchange 的 fee entry。
- 收入：只统计 `income` 事件的 main entry。
- Transfer source/destination 不计收入支出。
- Exchange source/destination 不计收入支出。
- Balance snapshot 不计收入支出。

## C. 技术边界

建议采用：

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui 或同等级轻量组件层
- SQLite
- Drizzle ORM + migrations
- `bigint` + `decimal.js`（仅在需要比率展示时）
- Vitest
- Playwright
- Docker

若仓库已有等价技术栈，可复用；不要为了“更先进”引入微服务、Redis、消息队列、GraphQL 或复杂状态管理。

SQLite 必须启用：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

## D. 工程结构要求

业务规则不能埋在 React component 内。

至少应形成类似分层：

```text
src/
  app/
  components/
  db/
    schema.ts
    migrations/
    queries/
  domain/
    money.ts
    ledger.ts
    balance.ts
    reports.ts
    validation.ts
  services/
  lib/
  tests/
```

`balance.ts` 必须可以在无 UI、无 HTTP 的情况下独立测试。

## E. 数据迁移与备份

- 使用可重复执行的 schema migration。
- 备份 JSON 必须包含 `schemaVersion`。
- 金额在 JSON 中仍是字符串，禁止序列化为浮点。
- Restore V1 只要求“恢复到空数据库”，不要求 merge。
- Restore 必须先完整验证，再使用 DB transaction 原子写入。

## F. 用户体验要求

- 桌面和手机浏览器可用。
- 交易录入优先减少步骤。
- 数字、资产代码、小数位必须清晰。
- 删除交易和覆盖性恢复必须二次确认。
- 账户归档优先于删除。
- 已被交易引用的 asset/account 不允许直接删除。

## G. 测试与验收

必须实现 `07_TEST_ACCEPTANCE_CN.md` 中的核心测试。

至少运行并报告：

```text
lint
unit tests
integration tests
build
```

若已配置 Playwright，也运行关键 E2E。

不得伪造运行结果。任何未运行或失败的命令必须明确说明。

## H. 输出要求

完成后给出：

1. 实现摘要。
2. 关键架构决策。
3. 数据库迁移列表。
4. 新增/修改文件概览。
5. 实际运行的验证命令及结果。
6. 未完成项或已知限制。
7. 确认没有实现 V2 功能。

## I. 禁止主动扩大范围

不要因为“顺手”实现：

- 行情 API
- 预算
- 自动账单
- OCR
- 银行导入
- 交易所同步
- 多用户
- AI
- 股票
- 税务
- 盈亏计算
- 离线 CRDT 同步

这些全部留给后续版本。
