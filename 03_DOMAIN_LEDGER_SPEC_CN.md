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
