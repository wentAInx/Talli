# External Sync Domain Spec

## 1. Source Object

保存 provider 的外部对象：

```text
kraken_ledger
kraken_trade
```

唯一：

```text
(connection_id, object_type, external_id)
```

包含：

- occurredAt
- sanitized payload JSON
- payload hash
- firstSeenAt
- lastSeenAt

Source Object 不是 Ledger Event。

## 2. Balance Observation

一次 sync 的 asset balance observation。

保存：

- raw provider asset key
- provider amount decimal text
- observedAt
- optional mapped Talli asset
- optional exact atomic amount
- precision status

Observation 不是 snapshot。

## 3. Transaction Candidate

一个或多个 Source Object 归一化出的待审核财务事件。

状态：

```text
pending
needs_mapping
ignored
imported
unsupported
source_changed
```

Candidate 不是 Ledger Event。

## 4. Connection

V3.1 一个 credential slot：

```text
env:kraken.primary
```

SQLite 只保存 opaque credential_ref，不保存 key/secret。

## 5. Asset identity

Kraken private APIs 可能返回：

```text
XXBT
ZUSD
USDT
USD.M
USDT.F
```

禁止直接：

```text
strip leading X/Z
```

主路径必须使用 Kraken Assets metadata 建立 raw→display identity。

对于：

```text
.B .F .M .S .T
```

保留 raw identity。可建议映射到 base asset，但不得静默合并。

## 6. Account mapping

最小 external account identity：

```text
connection + providerAssetKey
```

映射到一个 Talli account。

必须验证：

- Talli account active
- account.assetId == mapped asset
- 一个 Talli account 在 V3.1 不可被多个 external mapping 同时占用

## 7. Balance difference

```text
external = observation exact mapped amount
ledger = balanceAt(account, observation.observedAt)
difference = external - ledger
```

同一 native asset 内计算，不使用 V2 price。

若 provider decimal 超过 Talli scale：

```text
precision_status = excess_precision
mapped_amount_atomic = null
```

禁止 silent rounding。

## 8. Reconciliation

用户点击“调整为外部余额”并二次确认后：

- 重新读取 observation/mapping/current balance
- 调用现有 ReconciliationService/writer
- 创建 snapshot
- 不创建 income/expense

## 9. Idempotency keys

Trade fill：

```text
kraken:trade:<trade-id>
```

Non-trade ledger：

```text
kraken:ledger:<ledger-id>
```

不得用 timestamp/amount/random UUID 当业务稳定键。

## 10. Trade authority

TradesHistory 是 spot trade candidate 的 primary source。

Ledgers 中 `type=trade`：

- 保存 source object
- 用于 fee/balance cross-check
- 只有明确 provider identifier 对应时 link
- 不额外生成第二个 trade candidate

禁止用“时间很近 + 金额类似”猜关系并直接写账。

## 11. Deposit / withdrawal

Kraken ledger type 只给 suggestion。

例如 deposit 可以由用户最终选择：

- Transfer（来自另一个 Talli account）
- Income（确实是收入，用户明确选择）
- Ignore

不得自动把 deposit=income、withdrawal=expense。

## 12. Imported candidate

一旦 imported：

- candidate_id import link UNIQUE
- ledger_event_id UNIQUE
- re-sync 不重复入账
- source 改变只 warning，不 mutate ledger
