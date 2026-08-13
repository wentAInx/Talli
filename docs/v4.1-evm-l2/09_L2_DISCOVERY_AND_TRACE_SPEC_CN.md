# L2 Discovery & Native Trace Spec

# 1. Discovery limitation

Base / Arbitrum 的 activity discovery：

```text
alchemy_getAssetTransfers(external,erc20)
```

只负责找 known tx hashes / ERC20 logs / top-level evidence。

它不是完整的 internal-native historical index。

永久 product label：

```text
historyCoverage = discovery_limited
```

# 2. Trace authority

对于每个 discovered tx：

```text
debug_traceTransaction(callTracer)
```

sanitized projection 是 native ETH movement authority。

不要同时：

```text
Alchemy external ETH
+
trace root ETH
```

相加。

否则 top-level value 会 double count。

# 3. ERC20 authority

ERC20 movement：

```text
Alchemy Transfers ERC20 rawContract.value
```

继续为 authority。

Trace 不从 calldata 猜 ERC20。

# 4. Safe call-frame projection

只保留审计所需字段：

```text
path
type
from
to
value
reverted
```

不要持久化：

```text
input
output
memory
storage
full opcode trace
```

避免 backup 爆炸。

# 5. Counted native frame types

允许真正的 value movement：

```text
CALL
CREATE
CREATE2
SELFDESTRUCT / SUICIDE（normalize 为 SELFDESTRUCT）
```

明确不计：

```text
DELEGATECALL
STATICCALL
CALLCODE
```

因为它们不代表不同账户间的真实 ETH value transfer。

# 6. Revert propagation

如果 receipt failed：

```text
all native movement = non-importable / zero committed movement
gas can remain
```

如果某 ancestor call frame reverted：

```text
descendants 不得计入 balance movement
```

即使 child frame 本身没带 error。

Trace normalization 必须传播 ancestor failure。

# 7. Net movement

对 wallet relative net：

```text
from wallet -> negative
to wallet   -> positive
```

native trace + ERC20 logs 按 provider asset key bigint aggregate。

0 legs 删除。

然后复用 V4 movement classification。

# 8. Trace unavailable

发现 tx 但 trace capability 不可用：

```text
movement candidate 不生成可导入版本
```

本轮推荐整个 L2 activity snapshot不持久化/不推进 cursor，
而不是留下一个看似完整的 transfer-only candidate。

# 9. Historical completeness warning

即使所有 discovered tx 都 trace exact：

```text
historyCoverage remains discovery_limited
```

原因：可能存在 wallet 只在 internal native call 中出现，
该 tx 没有 external/ERC20 discovery evidence。

Balance reconciliation 可以帮助暴露这种遗漏，
但不能自动创建 transaction。

# 10. Arbitrum pre-Nitro

V4.1 不实现 legacy `arbtrace_*`。

官方 Alchemy 当前说明：

```text
arbtrace_* pre-Nitro only
post-Nitro use Geth debug_*
```

如果 history window 穿过不支持区间，
UI 必须显示实际 activity coverage start。
