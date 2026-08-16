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
