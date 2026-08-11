# Product & Engineering Brief

## 用户目标

V3 让用户无需手工比对 Kraken：

- 自动读取资产余额；
- 自动读取 Ledger/Trade history；
- 显示 Talli Ledger 与 Kraken observation 的差异；
- 生成待审核交易候选；
- 用户明确确认后才导入 Ledger。

## P0

- generic external connection model
- one Kraken Spot credential slot
- permission validation
- server-only auth/signing
- asset metadata normalization
- Balance sync
- Ledgers pagination
- TradesHistory pagination
- source object persistence
- balance observations
- asset/account mappings
- deterministic candidate normalization
- idempotency
- candidate queue/review/ignore/import
- explicit balance reconciliation
- V3 backup schemaVersion 3
- V1/V2 backup backward compatibility
- responsive UI
- unit/integration/E2E/CI

## P1

- candidate filters
- sync run detail
- raw sanitized source JSON viewer
- order-level display grouping of multiple fills
- source-changed-after-import warning UX

P1 不得压过 P0。

## 成功标准

V3 成功不是“Kraken API 能通”，而是：

```text
外部数据可重复抓取
    ↓
稳定去重、可追溯
    ↓
用户能审核
    ↓
确认后才进入 V1 Ledger
```

删除全部 V3 observation/candidate 数据后：

```text
V1 balance
V2 valuation
```

仍保持原语义。
