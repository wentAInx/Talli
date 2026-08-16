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
