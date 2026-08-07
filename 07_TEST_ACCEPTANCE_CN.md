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
