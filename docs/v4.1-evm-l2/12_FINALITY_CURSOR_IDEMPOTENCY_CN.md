# Finality, Cursor & Idempotency

# 1. Current balance

三链：

```text
latest
```

余额 observation 明确标记 current fetch time。

# 2. Activity

只处理 numeric finalized head：

```text
eth_getBlockByNumber("finalized", false)
```

Base 官方把 finalized L2 head与 finalized L1 data绑定；
普通交易不等于 7-day withdrawal challenge。

Arbitrum sequencer soft confirmation也不等于 parent-chain finality。

# 3. Cursor per connection

现有：

```text
last_finalized_block_text
```

继续 per chain connection 使用。

下一轮：

```text
fromBlock=max(historyStartBlock,lastFinalized-32)
```

32-block overlap 是 buffer，
idempotency 才是 correctness。

# 4. L2 activity cursor rules

只有：

```text
Transfers pages complete
+
all required tx/receipt complete
+
Debug capability available
+
required traces complete
+
fee evidence complete or explicitly unresolved per candidate
```

activity snapshot 才可进入 persistence。

如果 Debug capability 不可用：

```text
cursor 不推进
activity sources/candidates 不提交
balances 可提交
run partial/balance_only
```

如果 transfer pagination expired：

```text
activity 全部不提交
cursor 不推进
```

# 5. Source identity

继续：

```text
(connection, evm_transaction, txHash)
(connection, evm_transfer, Alchemy uniqueId)
```

不新增 full trace source type；
sanitized native trace projection进入 `evm_transaction.payload_json`，
因此 source fingerprint 覆盖 trace evidence。

# 6. Candidate key

```text
evm:<chainId>:movement:<txHash>
evm:<chainId>:gas:<txHash>
```

同 hash 在不同链不会冲突。

# 7. Resync

10 次相同 sync：

```text
source count stable
candidate count stable
import link stable
ledger events stable
observations append-only
```

# 8. Source change

before import：

```text
re-normalize
```

after import：

```text
candidate -> source_changed
Ledger unchanged
```

保持 V4.0。
