# V3 UI / UX Spec

## Navigation

新增：

```text
同步
```

推荐 `/sync`，移动端也必须可达。

## Overview

```text
外部同步

Kraken
状态：已连接 / 凭据缺失 / 权限不安全 / 最近失败
最近成功：...
[立即同步]

只读同步不会自动修改账本。
```

## Credential card

```text
Credential: env:kraken.primary
API key: 已配置/未配置

✓ Query funds
✓ Query ledger entries
✓ Query closed trades
✓ No dangerous write permissions
```

危险 permission → 拒绝 sync。

## Asset mappings

```text
Kraken raw   Canonical   Talli asset   Talli account
XXBT         BTC         BTC           Kraken BTC
ZUSD         USD         USD           Kraken USD
USDT.F       USDT.F      未映射         -
```

suffix 可以给 suggestion，但要用户确认。

## Balance observation

```text
Kraken BTC

外部观测 0.50200000 BTC
Talli账本 0.50000000 BTC
差异      +0.00200000 BTC
观察时间 ...

[调整账本为外部余额]
```

点击调整后必须确认：

```text
这会创建余额快照，不会创建收入/支出。
```

## Candidate queue

Tabs：

```text
待审核
需映射
已导入
已忽略
异常
```

Row：

```text
Kraken · Trade
100 USDT → 0.00145 BTC
Fee unresolved / ...
建议：兑换
[审核]
```

## Candidate review

显示：

- provider/source IDs
- occurredAt
- raw amounts
- normalized legs
- mapping status
- chosen Talli accounts
- suggested vs chosen event type
- fee evidence
- warnings

按钮：

```text
[导入到 Talli]
[忽略]
```

Import 是真实财务写入，必须明确确认。

## Imported

显示：

```text
已导入
Talli event: ...
```

可跳转 `/transactions/:id`。

## Error states

区分：

- credentials missing
- auth failed
- permission missing
- dangerous write permission
- nonce error
- rate limited
- provider unavailable
- payload invalid
- unmapped asset
- excess precision

任何 sync error 不得影响 V1/V2 页面。

## Mobile

mobile WebKit E2E 验证：

- `/sync` 无 overflow
- mapping 可操作
- candidate review 可用
- imported state 可见
