# V4.1 Product & Engineering Brief

# 1. 用户能力

V4.1 完成后，用户可以为同一个公开地址分别创建：

```text
Ethereum Mainnet wallet
Base wallet
Arbitrum One wallet
```

地址 identity 按 chain 隔离。

每个 connection 可以：

- current ETH balance；
- current ERC-20 balances；
- exact asset/account mapping；
- observed vs Ledger difference；
- explicit Reconcile；
- finalized historical activity discovery；
- 对已发现 transaction 做 L2 call trace；
- simple movement review/import；
- exact network fee review/import；
- provenance + idempotent resync。

# 2. 历史完整性不是二元假象

Base / Arbitrum：

```text
Transfers API:
  external + erc20 discovery
       ↓
known tx hash
       ↓
debug_traceTransaction
       ↓
完整分析该已发现 tx 内部 native movement
```

但一个地址如果只在某个 tx 的 internal native call 中出现，
且没有其他可被 Transfers API 发现的 external/ERC20 evidence，
该 tx 可能根本不会进入 discovery set。

因此 UI 和数据模型必须明确：

```text
historyCoverage = discovery_limited
```

这不是 error，也不能悄悄标成 complete。

# 3. Capability

Alchemy Debug API：

```text
trace_available
trace_unavailable
unknown
```

`trace_unavailable` 时：

- balances 继续；
- balance reconcile 继续；
- movement activity 不落可导入 candidate；
- activity cursor 不推进；
- UI 明确要求具备 Debug API capability 才开启 reviewed L2 activity。

# 4. Candidate policy

对已 trace-complete 的 discovered tx：

```text
1 positive asset
→ simple_in / unknown

1 negative asset
→ simple_out / unknown

1 negative A + 1 positive B
→ simple_exchange

3+ nonzero assets
→ complex / unsupported
```

和 V4.0 一样，不自动 Income/Expense。

Gas candidate 独立。

# 5. Bridge

Bridge tx 可以作为链上 source/candidate 出现，
但：

```text
Ethereum tx
Base tx
Arbitrum tx
```

永远是三个独立事实。

V4.1 不基于：

- tx hash；
- retryable ticket；
- message nonce；
- gateway event；
- 相近时间/金额

自动合并为跨链 Transfer。

用户可以在 Review 中明确选择 Talli Transfer。
