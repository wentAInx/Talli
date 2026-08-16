# V2.0 UI / UX Specification

# 1. Dashboard

保留现有 V1 Native Quantities 信息架构，增加估值层。

## 1.1 顶部估值卡

Home configured 且至少可以计算 identity/quote 时：

```text
估算总资产
≈ ¥18,426.37 CNY
8 / 9 个非零资产已估值
价格更新：2 分钟前
[刷新价格]
```

若完整：

```text
估值完整
```

若不完整：

```text
估值不完整 · 1 个非零资产缺少价格
查看缺失项
```

Home 未配置：

```text
尚未设置估值币种
选择 Home Asset 后可查看近似总资产
[前往估值设置]
```

## 1.2 每资产 group

```text
BTC
0.00428137 BTC
≈ ¥1,242.78 CNY
BTC/USD · CoinGecko
USD/CNY · ECB reference
```

Native amount 字号/层级高于 valuation。

## 1.3 状态 badge

- `实时/新鲜`（fresh）
- `已过期`（stale）
- `手动价格`（manual）
- `缺少映射`
- `价格不可用`

不要只靠颜色表达状态。

# 2. Settings → Valuation

建议新增 section：

```text
估值与价格
├─ Home Asset
├─ Data sources
├─ Asset mappings
├─ Manual quotes
└─ Provider status
```

## 2.1 Home Asset

下拉仅列 non-archived fiat assets。

修改 Home Asset：

- 不修改 Ledger。
- 保存后清晰说明“只影响估值显示”。
- 不必删除旧 cache；resolver 自动使用新 Home。

## 2.2 Provider status

CoinGecko：

```text
CoinGecko
Demo key: 已配置 / 未配置
最近成功：...
最近错误：...
Cooldown：...
```

**永远不显示 key 内容。**

ECB：

```text
ECB reference rates
最近成功：...
最新 observation：...
```

## 2.3 Provider mappings

列表：

```text
BTC   CoinGecko   bitcoin    enabled
ETH   CoinGecko   ethereum   enabled
USD   ECB         USD        enabled
```

允许编辑 `provider_asset_key` 和 enabled。

V2.0 不提供 symbol 自动搜索/自动猜 ID。

## 2.4 Manual quote

表单：

```text
Base asset
Quote asset
Rate: 1 BASE = [rate] QUOTE
Observed at
Note
[保存并启用]
```

明确提示：

```text
Active manual quote 会覆盖该 exact pair 的自动价格源。
```

可停用。

# 3. Refresh UX

首次页面 render 不显示全屏 loading 等待外网。

若 due：

```text
正在后台刷新价格…
```

刷新成功后局部/页面 revalidate。

按钮 cooldown 时：

```text
刚刚已请求，请稍后再刷新
```

# 4. Incomplete valuation detail

可展开：

```text
未估值
XYZ 123.45 XYZ · 没有 active manual quote
ABC 2.0 ABC · CoinGecko mapping missing
```

零余额资产不要出现在 missing list。

# 5. Provider wording

CoinGecko：

```text
market price / 市场价格
```

ECB：

```text
reference rate / 参考汇率
```

禁止把 ECB reference rate 写成“实时汇率/成交汇率”。

# 6. Attribution

UI 可在 Settings → Valuation 或页面底部加入：

```text
Crypto market data provided by CoinGecko
```

带正常链接。

# 7. Accessibility / mobile

继承 V1：

- keyboard focus。
- 不靠颜色单独表达 stale/missing。
- mobile 无横向溢出。
- rate/provenance 可换行。
- `≈` 与 Home code 在屏幕阅读器可理解的 label 中体现“估算”。
