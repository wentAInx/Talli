# 多资产个人记账 App V1 — Codex 单文件工程任务包

> 本文件由自包含任务包合并生成。Codex 应从头到尾阅读后再实现。


---

# FILE: 00_README_CN.md

# 多资产个人记账 App V1 — Codex 工程任务包

## 1. 任务包用途

这是一个可直接交给 Codex 的、自包含的 V1 工程任务包。目标不是“照着 Lunch Money / iCost 抄界面”，而是实现一个适合个人自用、可自托管、原生支持法币/外币/虚拟货币余额的多资产账本。

V1 的核心原则只有一句：

> **Ledger quantities are source of truth; market valuation is derived data and must never mutate the ledger.**
>
> 原生资产数量是唯一账本事实；市场估值只是衍生数据，任何汇率和币价变化都不得修改原始账本。

V1 **完全不实现汇率、币价、统一法币折算、实时行情、历史行情、净资产折线图**。CNY、USD、USDT、BTC、ETH 等资产各自独立记账、独立统计。

---

## 2. Codex 阅读顺序

Codex 在写代码前必须依次阅读：

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md`
3. `03_DOMAIN_LEDGER_SPEC_CN.md`
4. `04_DATABASE_SCHEMA.sql`
5. `05_TYPES_AND_SERVICE_CONTRACTS.ts`
6. `06_UI_UX_SPEC_CN.md`
7. `07_TEST_ACCEPTANCE_CN.md`
8. `08_IMPLEMENTATION_PLAN_CN.md`
9. `09_NON_GOALS_AND_V2_BOUNDARY_CN.md`
10. `10_SEED_DATA.json`

`MANIFEST.tsv` 仅用于完整性检查。

---

## 3. V1 必须交付

- Next.js + TypeScript 单体 Web App。
- SQLite 持久化。
- Drizzle ORM / migration。
- 多资产定义：法币、Crypto、自定义资产。
- 单资产账户。
- 收入、支出、同资产转账、跨资产兑换、余额调整。
- 分类、标签。
- 交易列表、筛选、编辑、删除。
- 资产总览：按资产分别显示，不统一换算。
- 月度收支统计：按资产分别统计。
- 精确金额存储：禁止浮点金额。
- JSON 无损备份/恢复；CSV 导出。
- 自动化测试。
- Docker 自托管说明。

---

## 4. V1 明确不做

- 任何 CoinGecko / Coinbase / Kraken / ECB / Forex API。
- 实时币价、每日币价、历史币价。
- CNY/USD 等自动汇率。
- base currency / home currency。
- “总资产 ¥xxxx”。
- 银行/交易所/链上账户自动同步。
- 多用户系统。
- 多设备离线同步与冲突解决。
- OCR、AI 分类、账单截图识别。
- 预算、周期账、账单导入（可作为 V1.1）。

详见 `09_NON_GOALS_AND_V2_BOUNDARY_CN.md`。

---

## 5. 关键产品语义

首页可以显示：

```text
CNY        ¥8,438.23
USD          $628.41
USDT      628.435000 USDT
BTC         0.00428137 BTC
```

但不得显示：

```text
总资产：¥18,432.22
```

因为 V1 没有估值层。

跨资产兑换不需要行情：

```text
-100.000000 USDT
+99.720000 USD
```

真实成交率可由两边金额即时推导：

```text
1 USDT = 0.9972 USD
```

这只是该笔真实成交的派生展示，不是“市场汇率”。

---

## 6. 推荐运行形态

V1 面向单用户、单服务实例：

```text
Browser / Phone / Tablet
        │
      HTTPS
        │
Next.js single process
        │
SQLite /data/finance.db
```

不要在 V1 构造微服务。

V1 不实现复杂认证与多用户授权。部署文档必须提示：不要把未保护实例直接暴露在公网；远程使用时应放在可信私网、VPN、Tailscale、Cloudflare Access 或反向代理认证之后。

---

## 7. 关于 Lunch Money / iCost

它们仅作为功能和信息架构参考。实现时不要复制其商标、Logo、图标资源、专有文案或逐像素 UI。产品应使用自己的中性界面与命名。


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

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


---

# FILE: 02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md

# V1 产品与工程 Brief

## 1. 产品目标

构建一个面向个人自用的多资产记账系统，能够同时记录：

- CNY、USD、EUR、HKD 等法币。
- USDT、USDC、BTC、ETH、SOL 等虚拟货币。
- 将来可能出现的任意自定义资产。

V1 的核心价值不是估值，而是回答：

> “我每个账户里实际还剩多少原生资产？”

例如：

```text
支付宝                2,130.25 CNY
Wise                     428.41 USD
Kraken USDT              528.435000 USDT
Ledger BTC                 0.00428137 BTC
```

## 2. 典型使用场景

### 场景 A：普通支出

支付宝支付 35.80 CNY：

```text
支付宝  -35.80 CNY
分类    餐饮
```

余额减少 35.80 CNY。

### 场景 B：直接用 Crypto 消费

用 Kraken USDT 支付 VPS：

```text
Kraken USDT  -15.000000 USDT
分类          服务器
```

V1 不计算这笔 USDT 值多少 CNY。

### 场景 C：同资产转账

Wise USD 转 50 USD 到 USD Cash：

```text
Wise USD   -50.00 USD
USD Cash   +50.00 USD
```

不计收入、不计支出。

### 场景 D：跨资产兑换

100 USDT 换到 99.72 USD：

```text
Kraken USDT  -100.000000 USDT
Wise USD      +99.72 USD
```

UI 可以派生显示：

```text
实际成交：1 USDT = 0.9972 USD
```

但不访问行情 API。

### 场景 E：网络手续费使用不同资产

100 USDT 换 USD，同时支付 0.001 ETH 手续费：

```text
Kraken USDT  -100.000000 USDT   [source]
Wise USD      +99.72 USD         [destination]
MetaMask ETH   -0.001 ETH        [fee]
```

手续费在 ETH 报表下作为支出统计；换汇本金不算消费。

### 场景 F：余额对账

App 显示 Wise 为 410.18 USD，但实际是 412.18 USD。

用户选择：

```text
调整余额为 412.18 USD
时间：2026-08-07 10:00
```

生成一个 reconciliation snapshot。以后补录 2026-08-06 的旧账，不改变 2026-08-07 10:00 之后的当前余额。

---

## 3. 用户模型

V1：

- 单用户。
- 单实例。
- 默认一个 Book。
- 数据结构预留 `books`，但 V1 不做完整多账本切换体验。

用户不需要注册账户。

---

## 4. 功能范围

### P0 — 必须

#### Assets

- 新建/编辑/归档资产。
- asset type：`fiat | crypto | custom`。
- code、name、symbol、scale。
- 常用默认资产 seed：CNY、USD、EUR、HKD、USDT、USDC、BTC、ETH、SOL。
- 默认资产可以归档但不硬删除。

#### Accounts

- 新建账户。
- 一个账户绑定且只绑定一个 asset。
- account type：
  - cash
  - bank
  - ewallet
  - exchange
  - crypto_wallet
  - credit
  - loan
  - other
- 可选 institution/group label。
- 账户可归档。
- 新建账户时允许设置初始余额；初始余额通过 snapshot 实现。

#### Ledger events

- Expense
- Income
- Transfer
- Exchange
- Edit
- Delete

#### Reconciliation

- 将某账户余额锚定为用户输入的真实余额。
- 可查看调整记录。
- 可编辑/删除锚点，但必须明确告知会改变后续推导余额。

#### Categories & Tags

- 分类支持父子级 1 层或更多层（数据库可递归，UI V1 可最多显示两层）。
- 标签多选。
- 默认分类 seed。

#### Dashboard

- 按 asset 聚合总额。
- 每个 asset 展示其账户拆分。
- 不统一折算。

#### Transactions

- 时间倒序。
- 筛选：日期、账户、asset、事件类型、分类、标签、关键词。
- 搜索 payee/note。

#### Reports

- 月度收入/支出。
- 分类统计。
- 必须按 asset 分开。
- Exchange/Transfer 本金不计收支。

#### Data

- Lossless JSON backup。
- Restore to empty DB。
- CSV transaction export。

### P1 — 可做但不能影响 P0

- 深色模式。
- 键盘快捷录入。
- PWA manifest。
- 账户拖拽排序。
- 分类图表。

---

## 5. 非功能要求

### 数据正确性优先

财务软件宁可拒绝输入，也不能静默改金额。

### 无外部依赖

V1 的核心记账在断开互联网的服务器环境仍应完全可用。

### 可迁移

SQLite + JSON backup 应使用户可以完整取回数据。

### 可扩展

V2 添加 `PriceQuote` 时，不应修改现有 ledger 事实模型。

### 性能目标

个人账本规模：

- 账户 < 200
- 资产 < 200
- 事件 < 500,000

常用页面在普通桌面/手机浏览器应保持流畅。对于事件列表使用分页/游标，不一次性加载全部历史。

---

## 6. 视觉风格

参考现代记账 App 的信息密度，但采用自己的中性设计。

关键词：

- clean
- compact
- finance dashboard
- mobile-first responsive
- numerical alignment
- subdued decoration

数字应使用 tabular numerals。

不复制 Lunch Money/iCost 的品牌元素。


---

# FILE: 03_DOMAIN_LEDGER_SPEC_CN.md

# 领域模型与账本规则

本文是 V1 最重要的业务规范。

# 1. 核心实体

## 1.1 Asset

Asset 是计量单位，而不是价格。

示例：

```text
CNY
USD
USDT
BTC
ETH
```

字段：

- `id`
- `code`
- `name`
- `symbol`
- `type`
- `scale`
- `isArchived`

### scale

表示允许的最大小数位数：

```text
CNY   2
USD   2
USDT  6
BTC   8
ETH   18
```

输入 `1.234 CNY` 必须报错，不得自动变成 `1.23 CNY`。

---

## 1.2 Account

一个账户在 V1 中只能绑定一个 Asset。

正确：

```text
Kraken USDT -> USDT
Kraken BTC  -> BTC
```

错误：

```text
Kraken -> [BTC, ETH, USDT]
```

UI 可以通过 `institutionName = Kraken` 把多个资产账户视觉分组。

---

## 1.3 LedgerEvent

LedgerEvent 表示用户理解的一次逻辑行为。

V1 类型：

```text
expense
income
transfer
exchange
```

Balance adjustment 不属于 LedgerEvent；它属于 Reconciliation Snapshot。

---

## 1.4 LedgerEntry

LedgerEntry 是某个 Event 对某个 Account 的余额增减。

`amountAtomic` 是带符号整数：

```text
-3580 CNY atomic -> -35.80 CNY
+9972 USD atomic -> +99.72 USD
```

entry role：

```text
main
source
destination
fee
```

---

# 2. 金额模型

## 2.1 数据库存储

只存原子单位整数文本：

```text
CNY 123.45 -> "12345"
USDT 100.000001 -> "100000001"
BTC 0.00428137 -> "428137"
ETH 1.000000000000000001 -> "1000000000000000001"
```

## 2.2 TypeScript

领域层：

```ts
type AtomicAmount = bigint;
```

数据库边界：

```ts
type AtomicAmountDb = string;
```

## 2.3 解析规则

`parseDecimalToAtomic(input, scale)`：

- trim 空格。
- 禁止科学计数法。
- 支持可选正负号，但录入表单通常只让用户输入正数，方向由事件类型决定。
- 小数位 > scale：报错。
- 空值、NaN、Infinity、逗号混用：报错。
- 不使用 `Number()` 完成金额计算。

## 2.4 显示规则

资产可以设置 display precision，但 V1 默认使用 asset.scale 的合理裁剪：

- Fiat：通常固定 2 位。
- Crypto：允许 trim trailing zeros，但至少保留足以辨别数值的位数。
- 明细页可显示完整精度。

存储精度绝不因显示裁剪而丢失。

---

# 3. Event 不变量

所有 event + entries 写入必须放在同一个数据库 transaction 中。

## 3.1 Expense

结构：

```text
Event: expense
Entry: main, account=A, amount<0
```

要求：

- 恰好 1 个 `main` entry。
- amount < 0。
- category 可选；无分类显示“未分类”。
- 不允许 source/destination entry。

示例：

```text
支付宝 -35.80 CNY
```

## 3.2 Income

结构：

```text
Event: income
Entry: main, account=A, amount>0
```

要求：

- 恰好 1 个 `main` entry。
- amount > 0。

## 3.3 Transfer

结构：

```text
Event: transfer
Entry: source       account=A  amount=-X
Entry: destination  account=B  amount=+X
optional Entry: fee account=F  amount=-Y
```

要求：

- A != B。
- A.asset == B.asset。
- X > 0。
- source/destination 的绝对数量必须相同。
- fee 可选，Y > 0。
- fee account 可以是任意 asset，包括和 transfer asset 不同的资产。
- fee entry 只影响 fee account，不改变 source/destination 的 transfer amount。
- 不计 income/expense 的 transfer 本金。
- fee 计入对应 fee asset 的支出报表，系统分类为“手续费”。

示例：

```text
Wise USD  -50.00 USD
USD Cash  +50.00 USD
```

## 3.4 Exchange

结构：

```text
Event: exchange
Entry: source       account=A amount=-X asset=P
Entry: destination  account=B amount=+Y asset=Q
optional Entry: fee account=F amount=-Z asset=R
```

要求：

- A.asset != B.asset。
- X > 0, Y > 0。
- source/destination 不要求数量相等。
- fee account/asset 可独立。
- Exchange 的 source/destination 本金不计收入支出。
- fee 计入对应资产支出。

### 实际成交率

只作为派生展示：

```text
Y units of Q / X units of P
```

例如：

```text
100 USDT -> 99.72 USD
1 USDT = 0.9972 USD
1 USD ≈ 1.002808... USDT
```

此计算使用 decimal arithmetic，不能用 JS number。

不得把该比率写入 PriceQuote，因为 V1 没有 PriceQuote。

---

# 4. Reconciliation / Balance Snapshot

## 4.1 定义

用户在时间 `T` 声明：

```text
Account A 的真实余额在 T 时刻为 B
```

记录：

```text
accountId
asOf = T
balanceAtomic = B
note
createdAt
```

## 4.2 当前余额算法

计算账户 A 在查询时间 Q 的余额：

1. 找到 `asOf <= Q` 的最新 snapshot S。
2. 若存在 S：
   - 起始余额 = S.balanceAtomic。
   - 只累计 `event.occurredAt > S.asOf && event.occurredAt <= Q` 的该账户 ledger entries。
3. 若不存在 S：
   - 起始余额 = 0。
   - 累计所有 `event.occurredAt <= Q` 的该账户 entries。

伪代码：

```ts
balanceAt(accountId, queryTime) {
  const snapshot = latestSnapshotAtOrBefore(accountId, queryTime)
  const base = snapshot ? snapshot.balanceAtomic : 0n
  const fromExclusive = snapshot?.asOf ?? null
  const delta = sumEntries(accountId, fromExclusive, queryTime)
  return base + delta
}
```

### 关键语义

若 snapshot 在 8 月 7 日：

```text
8/7 snapshot = 500 USD
```

后来补录：

```text
8/1 expense -20 USD
```

当前余额仍是 500 USD（假设 8/7 之后没有其它 entry）。

因为该旧账发生在 snapshot 之前。

## 4.3 同一时间边界

Snapshot `asOf` 视为一个“包含截至该时刻全部历史事实”的强锚点。

因此：

```text
event.occurredAt <= snapshot.asOf
```

都被 snapshot 覆盖，不再叠加。

只有：

```text
event.occurredAt > snapshot.asOf
```

才影响之后余额。

UI 创建余额调整时默认 `asOf = now`。

## 4.4 多个 snapshot

查询任意历史时点 Q 时使用：

```text
latest snapshot with asOf <= Q
```

因此历史余额可以被多个对账锚点分段。

## 4.5 删除/编辑 snapshot

允许，但必须二次确认：

> 此操作会重新计算该时间点之后的余额。

---

# 5. 报表语义

## 5.1 收入

只统计：

```text
ledger_event.type == income
entry.role == main
entry.amount > 0
```

按 entry account 的 asset 分组。

## 5.2 支出

统计：

1. `expense/main` 的绝对金额。
2. `transfer/fee` 的绝对金额。
3. `exchange/fee` 的绝对金额。

按 asset 分组。

fee 在分类统计中使用系统虚拟分类：

```text
手续费
```

不必在 categories 表强制建立系统分类。

## 5.3 不计入收支

- transfer source/destination
- exchange source/destination
- balance snapshots
- opening balance snapshots

## 5.4 跨资产不得合并

禁止：

```text
CNY expense + USD expense + USDT expense = single total
```

正确：

```text
CNY expenses  ¥1,203.50
USD expenses     $42.90
USDT expenses    15.000000 USDT
```

---

# 6. 修改与删除语义

## 6.1 编辑 event

编辑必须用一个 DB transaction：

1. 校验新输入。
2. 替换/更新 event metadata。
3. 原子替换相关 entries。
4. 保持 event id 不变。

## 6.2 删除 event

硬删除该 event 及其 entries（FK cascade）。

必须二次确认。

删除历史 event 后，余额按照 snapshot 规则重新推导。

若 event 发生在某个之后 snapshot 之前，则不会影响该 snapshot 之后的余额。

## 6.3 Account / Asset 删除

若被任何历史记录引用：

- 禁止删除。
- 提示归档。

---

# 7. 创建账户的初始余额

创建账户时用户可以输入：

```text
Initial balance
```

实现方式：创建 account 后，同时创建一个 snapshot：

```text
asOf = account.createdAt
balanceAtomic = initial balance
note = "Initial balance"
```

不得创建 income event。

---

# 8. Credit / Loan

V1 不实现完整负债会计，但 account 可以出现负余额。

例如信用卡：

```text
Credit Card USD = -300 USD
```

余额引擎不得限制 account balance 必须 >= 0。

是否把信用账户 UI 做成“欠款正数”属于未来显示层优化；V1 内部保持带符号余额即可。

---

# 9. 日期与时区

- DB 存储 UTC ISO timestamp。
- 用户输入的日期/时间按 app timezone 转 UTC。
- App timezone 默认从浏览器推断并存入 settings，可修改。
- 月度报表按 app timezone 划分自然月。
- 不要用数据库服务器本地时区隐式计算月份。

---

# 10. 排序与稳定性

相同 `occurredAt` 的事件按 `createdAt DESC`、再按 `id` 排序，保证稳定。

余额计算只依赖 occurredAt 和 snapshot asOf，不依赖 UI 排序。


---

# FILE: 04_DATABASE_SCHEMA.sql

-- V1 canonical logical schema for SQLite.
-- Codex may translate this into Drizzle schema + migrations, but must preserve semantics.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  symbol TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('fiat', 'crypto', 'custom')),
  scale INTEGER NOT NULL CHECK (scale >= 0 AND scale <= 30),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'cash', 'bank', 'ewallet', 'exchange', 'crypto_wallet',
      'credit', 'loan', 'other'
    )
  ),
  institution_name TEXT,
  note TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_book ON accounts(book_id);
CREATE INDEX IF NOT EXISTS idx_accounts_asset ON accounts(asset_id);
CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(is_archived);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'both' CHECK (category_type IN ('expense', 'income', 'both')),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_book ON categories(book_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(book_id, name)
);

CREATE TABLE IF NOT EXISTS ledger_events (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('expense', 'income', 'transfer', 'exchange')),
  occurred_at TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  payee TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_book_occurred ON ledger_events(book_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON ledger_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_category ON ledger_events(category_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES ledger_events(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  entry_role TEXT NOT NULL CHECK (entry_role IN ('main', 'source', 'destination', 'fee')),
  -- Signed base-10 integer string. Application MUST validate /^-?[0-9]+$/.
  amount_atomic TEXT NOT NULL CHECK (length(amount_atomic) > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_event ON ledger_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_entries_account ON ledger_entries(account_id);

CREATE TABLE IF NOT EXISTS event_tags (
  event_id TEXT NOT NULL REFERENCES ledger_events(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag_id);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  as_of TEXT NOT NULL,
  balance_atomic TEXT NOT NULL CHECK (length(balance_atomic) > 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_asof
  ON balance_snapshots(account_id, as_of DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Optional audit metadata for lossless backups / migrations.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Important invariants that MUST be enforced in application/domain services:
-- 1. An entry account's asset is inferred from accounts.asset_id.
-- 2. expense: exactly one main entry, amount < 0.
-- 3. income: exactly one main entry, amount > 0.
-- 4. transfer: exactly one source and one destination; same asset; abs amounts equal;
--    optional one fee entry, amount < 0.
-- 5. exchange: exactly one source and one destination; different assets;
--    source < 0, destination > 0; optional one fee entry, amount < 0.
-- 6. asset/account referenced by history cannot be hard-deleted by the UI.
-- 7. balance_snapshot amounts must match account asset scale at parse time.
-- 8. all event + entries mutations occur in a single SQLite transaction.


---

# FILE: 05_TYPES_AND_SERVICE_CONTRACTS.ts

/**
 * V1 domain contracts. This file is specification material, not necessarily drop-in code.
 * Codex should preserve these semantics when implementing the actual project.
 */

export type AssetType = "fiat" | "crypto" | "custom";

export type AccountType =
  | "cash"
  | "bank"
  | "ewallet"
  | "exchange"
  | "crypto_wallet"
  | "credit"
  | "loan"
  | "other";

export type EventType = "expense" | "income" | "transfer" | "exchange";
export type EntryRole = "main" | "source" | "destination" | "fee";

/** Persisted amounts are never number/REAL. */
export type AtomicAmount = bigint;
export type AtomicAmountDb = string;

export interface Asset {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  type: AssetType;
  scale: number;
  isArchived: boolean;
}

export interface Account {
  id: string;
  bookId: string;
  assetId: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  note: string | null;
  isArchived: boolean;
}

export interface LedgerEvent {
  id: string;
  bookId: string;
  type: EventType;
  occurredAt: string; // ISO UTC
  categoryId: string | null;
  payee: string | null;
  note: string | null;
}

export interface LedgerEntry {
  id: string;
  eventId: string;
  accountId: string;
  role: EntryRole;
  amountAtomic: AtomicAmount;
}

export interface BalanceSnapshot {
  id: string;
  accountId: string;
  asOf: string; // ISO UTC
  balanceAtomic: AtomicAmount;
  note: string | null;
}

export interface ExpenseInput {
  accountId: string;
  amount: string; // unsigned user decimal text
  occurredAt: string;
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  tagIds?: string[];
}

export interface IncomeInput {
  accountId: string;
  amount: string;
  occurredAt: string;
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  tagIds?: string[];
}

export interface OptionalFeeInput {
  accountId: string;
  amount: string; // unsigned, > 0
}

export interface TransferInput {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  occurredAt: string;
  fee?: OptionalFeeInput | null;
  note?: string | null;
  tagIds?: string[];
}

export interface ExchangeInput {
  sourceAccountId: string;
  sourceAmount: string;
  destinationAccountId: string;
  destinationAmount: string;
  occurredAt: string;
  fee?: OptionalFeeInput | null;
  note?: string | null;
  tagIds?: string[];
}

export interface ReconcileInput {
  accountId: string;
  actualBalance: string; // signed decimal text allowed
  asOf: string;
  note?: string | null;
}

export interface AssetAmount {
  assetId: string;
  amountAtomic: AtomicAmount;
}

export interface AssetReportBucket {
  assetId: string;
  incomeAtomic: AtomicAmount;
  expenseAtomic: AtomicAmount;
}

/**
 * MONEY SERVICE
 * - Must not use Number() for monetary arithmetic.
 * - Must reject excess fractional digits; never silently round user input.
 */
export interface MoneyService {
  parseDecimalToAtomic(input: string, scale: number): AtomicAmount;
  formatAtomic(amount: AtomicAmount, scale: number, options?: { trimTrailingZeros?: boolean }): string;
}

/**
 * LEDGER COMMAND SERVICE
 * Each command must be atomic in the database.
 */
export interface LedgerCommandService {
  createExpense(input: ExpenseInput): Promise<string>;
  createIncome(input: IncomeInput): Promise<string>;
  createTransfer(input: TransferInput): Promise<string>;
  createExchange(input: ExchangeInput): Promise<string>;
  updateEvent(eventId: string, input: ExpenseInput | IncomeInput | TransferInput | ExchangeInput): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}

/**
 * BALANCE SERVICE
 * Snapshot is exclusive lower bound for later entries:
 * snapshot.balance + entries where occurredAt > snapshot.asOf && <= queryTime.
 */
export interface BalanceService {
  balanceAt(accountId: string, queryTime: string): Promise<AtomicAmount>;
  currentBalance(accountId: string): Promise<AtomicAmount>;
  reconcile(input: ReconcileInput): Promise<string>;
}

/**
 * REPORT SERVICE
 * Returns separate buckets by asset; it MUST NOT perform cross-asset conversion.
 */
export interface ReportService {
  monthlyIncomeExpense(input: {
    bookId: string;
    month: string; // YYYY-MM in app timezone
  }): Promise<AssetReportBucket[]>;
}

/**
 * EXCHANGE RATE DISPLAY HELPER
 * This is NOT a market price service.
 * It only derives an executed ratio from two user-entered quantities.
 * Use a decimal library; do not return a JS number.
 */
export interface ExecutedExchangeRate {
  baseAssetId: string;
  quoteAssetId: string;
  quotePerBase: string; // decimal string
}


---

# FILE: 06_UI_UX_SPEC_CN.md

# V1 UI / UX 规范

## 1. 导航结构

桌面：左侧导航。

手机：底部导航 + 顶部标题。

建议一级页面：

```text
总览
流水
报表
账户
设置
```

全局主操作：

```text
+ 记一笔
```

---

# 2. 总览 Dashboard

## 2.1 顶部

显示：

```text
资产总览
X 种资产 · Y 个活跃账户
```

**禁止显示统一净资产。**

## 2.2 Asset Group Card

每种资产一个 group：

```text
CNY                                      ¥8,438.23
──────────────────────────────────────────────
支付宝                                    ¥2,130.25
微信                                        ¥827.00
招商银行                                  ¥5,480.98
```

```text
USDT                                628.435000 USDT
──────────────────────────────────────────────
Kraken                              528.435000
Wallet                              100.000000
```

要求：

- 总额 = 该 asset 下所有未归档账户 current balance 合计。
- 不同 asset 绝不相加。
- 负余额清晰标识。
- 归档账户默认不计首页，但可在账户页查看。

## 2.3 最近流水

显示最近 5~10 笔逻辑事件。

Exchange 显示：

```text
兑换
100.000000 USDT → 99.72 USD
Kraken USDT → Wise USD
```

Transfer：

```text
转账
50.00 USD
Wise USD → USD Cash
```

Expense：

```text
VPS
-15.000000 USDT
服务器 · Kraken USDT
```

---

# 3. 新增交易

推荐 Modal / Sheet，手机全屏。

顶部事件类型 Tabs：

```text
支出 | 收入 | 转账 | 兑换 | 调整余额
```

## 3.1 支出

字段顺序：

1. Amount
2. Account
3. Category
4. Date/time
5. Payee
6. Tags
7. Note

Amount 组件：

```text
[ 35.80            ] CNY
```

账户选定后自动决定 asset，不让用户另选 currency。

## 3.2 收入

同支出，方向为正。

## 3.3 转账

字段：

```text
转出账户
转入账户
金额
日期时间
[ ] 手续费
备注
标签
```

选择 source 后，destination 列表只显示：

- 同 asset。
- 不同 account。
- 未归档账户。

手续费展开后：

```text
手续费账户
手续费金额
```

手续费账户可以是其他 asset。

## 3.4 兑换

字段：

```text
卖出账户
卖出数量
买入账户
买入数量
日期时间
[ ] 手续费
备注
标签
```

destination 必须是不同 asset。

输入两边后，显示只读派生信息：

```text
实际成交
1 USDT = 0.9972 USD
```

并明确使用“实际成交”，不要写“当前汇率”或“市场价格”。

## 3.5 调整余额

字段：

```text
账户
当前 App 余额：xxx
实际余额：[ ... ]
调整时间：[now]
备注
```

保存前提示：

```text
该余额将成为此时间点的新锚点；更早日期后来补记的流水不会改变该锚点之后的余额。
```

---

# 4. 流水页

## 4.1 列表

按 occurredAt DESC。

每行至少显示：

- 类型 icon/label
- payee 或事件类型
- 主金额/兑换双方
- account
- category
- date

## 4.2 Filter

支持：

```text
日期范围
事件类型
账户
资产
分类
标签
关键词
```

资产筛选逻辑：只要事件任意 entry 涉及该 asset 即匹配。

## 4.3 编辑

点击 event 打开详情，并允许进入编辑。

编辑 transfer/exchange 时按逻辑事件编辑，而不是暴露底层 entries。

## 4.4 删除

确认文案：

```text
删除后将重新计算相关账户余额。此操作无法撤销。
```

---

# 5. 账户页

## 5.1 列表

可按 asset / institution 分组。

显示：

```text
Wise USD
Bank · USD
$349.50
```

## 5.2 Account Detail

显示：

- 当前余额。
- asset。
- institution。
- 最近流水。
- reconciliation history。
- 编辑。
- 归档。

可以有“调整余额”按钮。

## 5.3 创建账户

```text
名称
类型
资产
Institution（可选）
初始余额（可选）
备注
```

一个账户选定 asset 后不可在有历史数据时直接更改 asset。

若无历史数据，允许修改；否则要求新建账户。

---

# 6. 报表页

## 6.1 月份切换

```text
< 2026年8月 >
```

## 6.2 按 asset 独立 section

```text
CNY
收入  ¥8,000.00
支出  ¥2,153.20

分类
餐饮    ¥823.00
交通    ¥215.00
...
```

```text
USDT
收入  100.000000 USDT
支出   15.000000 USDT
```

若该 asset 本月没有收支，可不显示。

## 6.3 Exchange/Transfer

不进入普通收支总额。

可以增加独立小统计：

```text
本月兑换 3 笔
本月转账 7 笔
```

但不是必须。

---

# 7. 设置

一级：

```text
资产
分类
标签
数据与备份
偏好
关于
```

## 7.1 Assets

编辑：

- code
- name
- symbol
- type
- scale
- sort
- archive

若 asset 已被账户引用，不允许修改 scale，因为会改变历史金额解释。

建议规则：

- 无引用时可改 scale。
- 有引用时 scale 只读。

## 7.2 Categories

CRUD + archive。

## 7.3 Tags

CRUD + archive。

## 7.4 Backup

按钮：

```text
导出完整 JSON 备份
导出 CSV 流水
从 JSON 恢复
```

恢复必须：

1. 选择文件。
2. 本地校验。
3. 显示摘要：资产/账户/事件数。
4. 要求明确确认。
5. 仅允许恢复到空 DB（V1）。

---

# 8. 数字与视觉规则

- 金额采用 tabular-nums。
- code 如 BTC/USDT 使用等宽或清晰大写样式。
- 负数必须明确显示 `-`。
- 不依赖颜色单独表达正负。
- Fiat symbol 与 code 不冲突时可显示 symbol；详情始终可看到 code。
- Crypto 不强行加 `$`。

---

# 9. 空状态

首次启动：

```text
还没有账户
先添加一个账户并设置初始余额。
```

提供：

```text
+ 添加账户
```

不要用演示余额污染真实数据；seed 只创建常用 asset/category，不自动创建虚假账户或交易。


---

# FILE: 07_TEST_ACCEPTANCE_CN.md

# V1 测试计划与验收标准

# 1. 总体要求

最低测试层级：

- Money unit tests
- Domain invariant unit tests
- Balance engine integration tests
- Report integration tests
- Backup/restore integration tests
- 至少一条完整 E2E 录账流程

所有财务核心测试都必须使用确定性日期和金额。

---

# 2. Money 精度测试

## M-001 CNY 正常解析

```text
input = "123.45"
scale = 2
expected atomic = 12345n
```

## M-002 BTC 正常解析

```text
input = "0.00428137"
scale = 8
expected atomic = 428137n
```

## M-003 ETH 18 位

```text
input = "1.000000000000000001"
scale = 18
expected = 1000000000000000001n
```

## M-004 超精度必须拒绝

```text
input = "1.001"
scale = 2
expected = validation error
```

禁止得到 1.00 或 1.01。

## M-005 禁止科学计数法

```text
"1e-8" -> error
```

## M-006 round-trip

任意合法 atomic -> format -> parse 后必须保持完全一致。

---

# 3. Event invariant 测试

## E-001 Expense

CNY 支出 35.80：

```text
one main entry
amount = -3580
```

## E-002 Income

USD 收入 100：

```text
one main entry
amount = +10000
```

## E-003 Transfer 同资产

```text
Wise USD -> USD Cash
50 USD
```

必须创建：

```text
source -5000
 destination +5000
```

## E-004 Transfer 跨资产拒绝

```text
USDT account -> USD account
```

`transfer` command 必须失败，并建议使用 exchange。

## E-005 Exchange 同资产拒绝

USD -> USD 不能使用 exchange。

## E-006 Exchange 正确

```text
100 USDT -> 99.50 USD
```

source 与 destination 精确写入各自 atomic。

## E-007 不允许账户相同的 Transfer

sourceAccountId == destinationAccountId -> error。

## E-008 交易原子性

故意使第二条 entry 校验失败，整个 event 不得留下半写入数据。

---

# 4. Fee 测试

## F-001 同资产手续费

Transfer：

```text
100 USDT A -> 100 USDT B
fee = 0.5 USDT from A
```

结果：

```text
A delta = -100.5 USDT
B delta = +100 USDT
```

报表：

```text
USDT expense = 0.5
```

100 USDT 本金不计支出。

## F-002 不同资产手续费

Exchange：

```text
100 USDT -> 99.50 USD
fee = 0.01 ETH from MetaMask ETH
```

报表：

```text
USDT expense = 0
USD income = 0
ETH expense = 0.01
```

---

# 5. Balance Snapshot 测试

以下测试是 V1 是否合格的核心。

## B-001 无 snapshot

账户 0 起始：

```text
8/1 +100 USD
8/2 -20 USD
```

8/3 balance = 80 USD。

## B-002 snapshot 覆盖过去

```text
8/7 10:00 snapshot = 500 USD
```

后来新增：

```text
8/1 -20 USD
```

8/7 12:00 balance 仍为 500 USD。

## B-003 snapshot 之后流水生效

```text
8/7 10:00 snapshot = 500 USD
8/8 -20 USD
```

8/8 23:59 balance = 480 USD。

## B-004 snapshot 同时刻为 exclusive lower bound

```text
snapshot asOf = T = 500 USD
event occurredAt = T, -20 USD
```

查询 T 后余额仍按 snapshot 500，不叠加该 event。

## B-005 多 snapshot

```text
8/1 snapshot 100
8/2 -20
8/3 snapshot 90
8/4 -10
```

结果：

```text
8/2 end = 80
8/3 after snapshot = 90
8/4 end = 80
```

## B-006 编辑日期穿越 snapshot

原 event 在 snapshot 后，后来编辑到 snapshot 前：

- 当前余额应停止受该 event 影响。

反向亦然。

## B-007 删除 snapshot

删除最新 snapshot 后，余额应依据前一个 snapshot 或完整 entry 历史重新计算。

---

# 6. 端到端验收数据集

使用 `10_SEED_DATA.json` 的资产定义，并建立：

```text
支付宝 CNY          initial 1000.00 CNY
Wise USD            initial 200.00 USD
USD Cash            initial 0.00 USD
Kraken USDT         initial 500.000000 USDT
Ledger BTC          initial 0.01000000 BTC
MetaMask ETH        initial 1.000000000000000000 ETH
```

执行：

### T1 Expense

```text
支付宝 -35.80 CNY
```

### T2 Income

```text
Wise +100.00 USD
```

### T3 Transfer

```text
Wise -50.00 USD
USD Cash +50.00 USD
```

### T4 Exchange

```text
Kraken USDT -100.000000 USDT
Wise USD +99.50 USD
MetaMask ETH fee -0.010000000000000000 ETH
```

期望余额：

```text
支付宝       964.20 CNY
Wise         349.50 USD
USD Cash      50.00 USD
Kraken       400.000000 USDT
Ledger         0.01000000 BTC
MetaMask       0.990000000000000000 ETH
```

期望普通收支报表：

```text
CNY expense 35.80
USD income 100.00
ETH expense 0.01
```

不得出现：

```text
USD expense 50 transfer
USDT expense 100 exchange
USD income 99.50 exchange
```

---

# 7. Reconciliation 端到端验收

在上述 T1~T4 后：

```text
2026-08-07 10:00
reconcile Wise to 350.00 USD
```

然后补录：

```text
2026-08-01 12:00
Wise expense -20.00 USD
```

当前 Wise 仍应为：

```text
350.00 USD
```

再录：

```text
2026-08-08 12:00
Wise expense -10.00 USD
```

当前 Wise：

```text
340.00 USD
```

---

# 8. Dashboard 验收

必须按 asset 分组。

若余额为：

```text
CNY 964.20
USD 399.50 across two accounts
USDT 400
BTC 0.01
ETH 0.99
```

页面可以分别显示这 5 个 totals。

页面不得出现任何类似：

```text
总资产
≈ ¥...
≈ $...
```

源代码也不得存在用于此目的的固定 USDT=USD 或 USD=CNY 换算。

---

# 9. Report 验收

- 时间边界按 app timezone。
- 跨月事件正确归属。
- 每个 asset 单独 bucket。
- category aggregation 只对普通 expense/income。
- fee 分类到系统“手续费”。
- snapshot 不进入报表。

---

# 10. Backup / Restore 验收

## D-001 Export lossless

JSON 中：

```json
{"amountAtomic":"1000000000000000001"}
```

不得变成：

```json
{"amount":1.0}
```

## D-002 Restore empty DB

完整恢复后：

- IDs 保持。
- timestamps 保持。
- atomic amounts 保持。
- event-entry 关系保持。
- snapshots 保持。
- current balances 与导出前一致。

## D-003 非空 DB 拒绝 restore

V1 不做 merge。

## D-004 错误 schemaVersion 拒绝

必须给出可理解错误，不允许部分写入。

---

# 11. 最低 E2E

Playwright 至少覆盖：

1. 新建 CNY 账户并设置初始余额。
2. 录入一笔支出。
3. Dashboard 余额即时变化。
4. 在流水页能找到该交易。
5. 编辑金额。
6. 余额正确更新。
7. 删除。
8. 余额恢复。

若测试环境成本允许，再覆盖 Exchange。

---

# 12. 构建验收

必须通过项目实际定义的等价命令：

```text
lint
typecheck
test
build
```

不得有 TypeScript `any` 大面积逃逸核心领域逻辑。

---

# 13. V1 完成定义（Definition of Done）

只有以下全部满足，才算 V1 核心完成：

- [ ] 所有 P0 页面可用。
- [ ] 5 类用户操作：expense/income/transfer/exchange/reconcile 可完整执行。
- [ ] Atomic amount 无浮点持久化。
- [ ] Balance snapshot 语义通过测试。
- [ ] Report 排除 transfer/exchange 本金。
- [ ] Dashboard 不做跨资产折算。
- [ ] JSON 备份/恢复可用。
- [ ] 测试通过。
- [ ] build 成功。
- [ ] Docker/本地运行文档完整。
- [ ] 没有接入任何行情/汇率 API。


---

# FILE: 08_IMPLEMENTATION_PLAN_CN.md

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


---

# FILE: 09_NON_GOALS_AND_V2_BOUNDARY_CN.md

# V1 非目标与 V2 边界

本文件用于防止 Codex 在第一轮把项目做成“大而全”。

# 1. V1 禁止项

## 1.1 行情与汇率

禁止：

- CoinGecko API
- Coinbase price API
- Kraken market API
- Binance market API
- ECB FX
- 法币换算
- Crypto market price
- cron price collector
- historical price backfill
- price cache

V1 代码库中可以有一段设计文档 TODO，但不要实现运行时代码。

## 1.2 统一估值

禁止：

```text
总资产 ¥xxxx
净资产 $xxxx
Portfolio value
P&L
资产涨跌
```

## 1.3 Stablecoin 固定锚定

禁止在业务逻辑中写：

```text
1 USDT = 1 USD
1 USDC = 1 USD
```

USDT/USDC 在 V1 是独立 Asset。

## 1.4 外部账户同步

禁止：

- read-only exchange API
- wallet address scanning
- on-chain balance
- bank sync
- Plaid
- open banking

## 1.5 复杂同步

禁止：

- local-first multi-device CRDT
- E2EE sync
- conflict resolution engine
- WebSocket sync

## 1.6 多用户

禁止：

- organizations
- household sharing
- roles/permissions
- invitations

## 1.7 AI/OCR

禁止：

- receipt OCR
- screenshot parsing
- AI categorization
- LLM assistant

---

# 2. V1.1 候选

只有 V1 验收通过后再考虑：

```text
预算
周期账
多账本完整 UI
CSV/支付宝/微信账单导入
附件
快捷记账
PWA 增强
```

---

# 3. V2 估值层设计边界

V2 可以新增独立表：

```text
price_quotes
```

概念模型：

```text
base_asset_id
quote_asset_id
price_decimal
quoted_at
provider
quote_type
```

此表属于衍生数据。

**V2 不允许修改 V1 的 ledger entries 或 snapshot 数量。**

例如：

```text
ledger: 0.00428137 BTC
```

永远保持 0.00428137 BTC。

V2 只是查询：

```text
0.00428137 BTC × BTC/CNY quote
```

得到临时估值。

---

# 4. V2 推荐行情策略（仅设计，不实现）

建议：

```text
Current Price
  -> cache 5~15min
  -> missing/stale 时按需请求

Historical Price
  -> 用户查看历史估值时 lazy backfill
  -> 获取后持久缓存
```

不需要 V1 起就每天 cron 收集。

行情 provider 后续可以抽象：

```ts
interface PriceProvider {
  getCurrentQuotes(...): Promise<...>
  getHistoricalQuotes(...): Promise<...>
}
```

法币与 Crypto 最终统一成 Asset pair quote。

---

# 5. 为什么当前不做 V2

如果 V1 直接带估值，会同时引入：

- API 稳定性
- rate limits
- provider symbol mapping
- stablecoin depeg
- timezone/day close 语义
- historical data holes
- network failure
- caching
- price source provenance
- base currency

这些都与“账本余额是否正确”无关。

先冻结 V1 ledger，可以把价格系统变成真正可替换的外层模块。


---

# FILE: 10_SEED_DATA.json

{
  "schemaVersion": 1,
  "note": "Seed definitions only. Do not create fake user accounts or transactions during first-run.",
  "assets": [
    {
      "code": "CNY",
      "name": "Chinese Yuan",
      "symbol": "¥",
      "type": "fiat",
      "scale": 2,
      "sortOrder": 10
    },
    {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$",
      "type": "fiat",
      "scale": 2,
      "sortOrder": 20
    },
    {
      "code": "EUR",
      "name": "Euro",
      "symbol": "€",
      "type": "fiat",
      "scale": 2,
      "sortOrder": 30
    },
    {
      "code": "HKD",
      "name": "Hong Kong Dollar",
      "symbol": "HK$",
      "type": "fiat",
      "scale": 2,
      "sortOrder": 40
    },
    {
      "code": "USDT",
      "name": "Tether",
      "symbol": "USDT",
      "type": "crypto",
      "scale": 6,
      "sortOrder": 100
    },
    {
      "code": "USDC",
      "name": "USD Coin",
      "symbol": "USDC",
      "type": "crypto",
      "scale": 6,
      "sortOrder": 110
    },
    {
      "code": "BTC",
      "name": "Bitcoin",
      "symbol": "BTC",
      "type": "crypto",
      "scale": 8,
      "sortOrder": 120
    },
    {
      "code": "ETH",
      "name": "Ethereum",
      "symbol": "ETH",
      "type": "crypto",
      "scale": 18,
      "sortOrder": 130
    },
    {
      "code": "SOL",
      "name": "Solana",
      "symbol": "SOL",
      "type": "crypto",
      "scale": 9,
      "sortOrder": 140
    }
  ],
  "categories": [
    {
      "name": "餐饮",
      "type": "expense"
    },
    {
      "name": "交通",
      "type": "expense"
    },
    {
      "name": "购物",
      "type": "expense"
    },
    {
      "name": "住房",
      "type": "expense"
    },
    {
      "name": "订阅",
      "type": "expense"
    },
    {
      "name": "服务器",
      "type": "expense"
    },
    {
      "name": "学习",
      "type": "expense"
    },
    {
      "name": "娱乐",
      "type": "expense"
    },
    {
      "name": "医疗",
      "type": "expense"
    },
    {
      "name": "旅行",
      "type": "expense"
    },
    {
      "name": "工资/收入",
      "type": "income"
    },
    {
      "name": "退款",
      "type": "income"
    },
    {
      "name": "其他",
      "type": "both"
    }
  ]
}


---

# FILE: CODEX_HANDOFF_PROMPT.txt

请把当前目录视为本项目 V1 的权威工程任务包。

第一步：先阅读 MANIFEST.tsv 和 00_README_CN.md，然后严格按照 00_README_CN.md 中列出的顺序阅读全部规范文件。

第二步：按照 01_CODEX_MASTER_INSTRUCTION_CN.md 实现 V1。领域语义以 03_DOMAIN_LEDGER_SPEC_CN.md 为准，验收以 07_TEST_ACCEPTANCE_CN.md 为准。

核心要求：
- 只做 V1 多资产原生余额账本；不做任何币价/法币汇率/统一折算。
- 金额不得使用浮点持久化。
- Transfer 与 Exchange 必须分开。
- Balance Adjustment 必须使用 snapshot/reconciliation 语义。
- 报表必须排除 transfer/exchange 本金。
- 不主动扩大范围。

完成后请实际运行 lint/typecheck/tests/build，并如实汇报结果、已知限制和未完成项；不得伪造任何运行结果。
