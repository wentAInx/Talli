# V4.1 Scope & Capability Decision

# Production scope

```text
Ethereum Mainnet  1
Base Mainnet      8453
Arbitrum One      42161
```

Ethereum 行为是 frozen regression。

# L2 activity discovery

## Provider fact

Alchemy Transfers API 当前：

```text
Base supported
Arbitrum supported
internal transfer data:
Ethereum Mainnet + Polygon Mainnet only
```

所以 Base / Arbitrum 不得设置：

```text
category = ["external","internal","erc20"]
```

正确：

```text
category = ["external","erc20"]
```

## Native internal movement

对 discovered tx：

```text
debug_traceTransaction(
  txHash,
  {
    tracer: "callTracer",
    tracerConfig: { onlyTopCall: false }
  }
)
```

Trace 是该 transaction 的 native movement authority。

Transfers `external` native row 在 L2 仅做 discovery/cross-check，
不能和 trace root 再加一次，避免 double count。

ERC-20 仍以 Transfer logs / Transfers API 为 authority。

# Capability matrix

| Chain | Balance | ERC20 | Native internal movement | Historical coverage |
|---|---|---|---|---|
| Ethereum | V4.0 | V4.0 | Transfers internal | complete（按 V4.0 contract） |
| Base | yes | yes | Debug on discovered tx | discovery_limited |
| Arbitrum | yes | yes | Debug on discovered tx | discovery_limited |

# Free/PAYG boundary

Alchemy 当前 Debug API：

```text
Free: unavailable
PAYG: available
Enterprise: available
```

产品不能把 plan 名称写成业务 invariant，
只检测 capability。

没有 Debug：

```text
balances = available
activity movement = disabled
activity cursor = unchanged
overall sync = partial / balance_only
```

# Arbitrum historical boundary

Alchemy 当前 `arbtrace_*` 只支持 pre-Nitro，
post-Nitro 官方建议使用 Geth `debug_*`。

V4.1 不实现 legacy `arbtrace_*` adapter。

若用户 historyStartAt 对应到 pre-Nitro block：

- balance 仍可正常同步；
- activity effective start 必须明确 clamp 到 Nitro-era supported boundary，
  或直接标记 earlier activity unsupported；
- UI 必须显示范围；
- 不得声称 pre-Nitro history complete。

# No webhook

Alchemy Address Activity webhook 当前可覆盖 Base/Arbitrum internal transfers，
但 V4.1 不引入 webhook/server exposure/background collector。

未来 V4.2 可单独研究 future-event completeness。
