# V1 建议实施顺序

Codex 应按以下顺序推进，避免先堆 UI 后返工领域模型。

# Phase 0 — Repo & Tooling

目标：项目可启动、可测试、可迁移。

完成：

- Next.js + TypeScript strict。
- Tailwind。
- SQLite driver。
- Drizzle schema + migration。
- Vitest。
- Playwright 基础配置。
- ESLint / format。
- Dockerfile + persistent `/data`。
- `.env.example`：

```text
DATABASE_PATH=/data/finance.db
```

V1 不需要 API key。

---

# Phase 1 — Money & Domain Core

先实现纯函数：

```text
parseDecimalToAtomic
formatAtomic
validateScale
```

然后实现 event invariants：

```text
buildExpenseEntries
buildIncomeEntries
buildTransferEntries
buildExchangeEntries
```

最后实现 balance engine：

```text
latestSnapshotAtOrBefore
sumEntriesAfterSnapshot
balanceAt
```

Phase 1 完成前不要做复杂页面。

验收：M/E/B 核心单测先过。

---

# Phase 2 — Persistence & Commands

实现：

- Asset repository。
- Account repository。
- Event repository。
- Snapshot repository。
- Category/tag repository。
- Ledger command service。
- Reconcile command。

每次事件写入在同一 SQLite transaction。

给常用查询建立索引。

---

# Phase 3 — Seed & First-run

首次数据库 migration 后：

- 创建 Default Book。
- Seed 常用 assets。
- Seed 基础 categories。
- 不创建虚假账户/交易。

需要幂等 seed。

---

# Phase 4 — Account UI

实现：

- account list
- create/edit/archive
- initial balance snapshot
- account detail
- reconciliation

先确保“余额正确”再做视觉优化。

---

# Phase 5 — Transaction UI

实现五个用户入口：

```text
支出
收入
转账
兑换
调整余额
```

其中 adjustment 实际写 balance_snapshots。

要求：

- Form validation 与 domain validation 双层。
- Server 端再次校验，不信任浏览器。
- 错误信息具体。

---

# Phase 6 — Dashboard

实现：

```text
active accounts -> currentBalance -> groupBy asset -> sum bigint
```

不要引入任何 conversion function。

---

# Phase 7 — Transaction Search / Filters

实现分页/游标。

最低筛选：

- from/to date
- event type
- account
- asset
- category
- tag
- q

避免 N+1 查询。

---

# Phase 8 — Reports

实现领域查询：

```text
monthlyIncomeExpenseByAsset
expenseByCategoryAndAsset
```

注意：

- exchange/transfer source/destination 排除。
- fee 进入 expense。
- timezone 正确。

---

# Phase 9 — Backup / Export

JSON backup 建议结构：

```json
{
  "format": "multi-asset-ledger-backup",
  "schemaVersion": 1,
  "exportedAt": "...",
  "data": {
    "books": [],
    "assets": [],
    "accounts": [],
    "categories": [],
    "tags": [],
    "ledgerEvents": [],
    "ledgerEntries": [],
    "eventTags": [],
    "balanceSnapshots": [],
    "settings": []
  }
}
```

Restore：

1. Parse JSON。
2. Validate full schema。
3. 确认目标业务表为空。
4. DB transaction 插入。
5. 验证 FK。
6. commit。

CSV 只作为人类读取/分析导出，不作为 V1 恢复格式。

---

# Phase 10 — Hardening

- 完整 unit/integration tests。
- Playwright critical path。
- 500k event 查询策略检查。
- 空状态。
- 错误状态。
- mobile layout。
- accessibility 基础。
- Docker volume 文档。

---

# 推荐源码组织

```text
src/
  app/
    page.tsx
    transactions/
    reports/
    accounts/
    settings/
    api/                 # only if needed
  components/
    money/
    forms/
    ledger/
    layout/
  db/
    index.ts
    schema.ts
    migrations/
    seed.ts
    queries/
  domain/
    money.ts
    types.ts
    invariants.ts
    ledger-builders.ts
    balance.ts
    reports.ts
    backup.ts
  services/
    ledger-command-service.ts
    account-service.ts
    reconciliation-service.ts
    backup-service.ts
  lib/
    datetime.ts
    ids.ts
    validation.ts
  tests/
    unit/
    integration/
  e2e/
```

---

# 实施中的禁止捷径

不要：

```ts
const balance = rows.reduce((x, row) => x + Number(row.amount), 0)
```

不要：

```ts
const totalCny = usd * 7.2 + usdt * 7.2
```

不要：

```sql
amount REAL
```

不要把 `account.balance` 当真相字段。

如果为了读取性能增加缓存余额：

- 只能是可重建 cache。
- source of truth 仍为 snapshots + entries。
- V1 可完全不做余额 cache。

---

# 性能实现建议

V1 优先正确性。

余额查询可以先按账户做 SQL SUM，但 `amount_atomic` 是 TEXT，SQLite 不能安全 SUM 任意大整数文本。因此推荐：

- 查询 snapshot 后的 entries 的 `amount_atomic` 字符串。
- Node 端 `BigInt` 求和。
- 对个人账本规模足够。

如果未来数据量需要优化，可引入可重建的 materialized balance cache，但不属于 V1。

事件列表必须分页；报表可按指定月份限定查询范围。
