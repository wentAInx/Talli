# Sync / Idempotency State Machine

## Manual sync only

V3 P0 无 cron。

```text
用户点击 Sync Now
```

## Connection lock

同一 connection 同时只允许一个 sync。

- process-local lock
- operational state
- duplicate request safe skip/409
- 不持 SQLite transaction 等 HTTP

## Phases

```text
START
→ credentials?
→ GetApiKeyInfo
→ permission gate
→ Assets / AssetPairs
→ Balance
→ Ledgers pages
→ TradesHistory pages
→ normalize in memory
→ BEGIN IMMEDIATE
→ upsert metadata/source
→ append observations
→ upsert candidates
→ state/run
→ COMMIT
```

## Source upsert

唯一：

```text
connection + objectType + externalId
```

同 source 再同步：

- count 不增加
- update lastSeenAt
- compare payloadHash

如果 source changed：

- 未 import → re-normalize
- 已 import → mark warning/source_changed
- Ledger 不动

## Candidate key

```text
kraken:trade:<trade-id>
kraken:ledger:<ledger-id>
```

不要 random/time/amount 作为稳定键。

## Re-sync imported candidate

必须：

```text
candidate one
import link one
ledger event one
```

## Pagination overlap

incremental sync 可留时间 overlap，由 provider stable ID 去重。

cursor 是性能 hint，不是 correctness source。

## First sync

P0 默认合理 lookback（建议 90 天）而非无限抓全部历史。
后续可提供更早历史导入。

## Partial failure

不删除此前成功数据。

若分页未完整：

- run 标记 partial/error
- 不把 incomplete source set 当完整
- 下一 sync 重试

## Payload hash

SHA-256 canonical sanitized JSON。

不得把 auth/nonce/secret 放入 canonical payload。
