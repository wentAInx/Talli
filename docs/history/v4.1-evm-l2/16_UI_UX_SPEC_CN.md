# V4.1 UI / UX

# 1. Add wallet

`/sync` 的 Add Wallet 增加 Network：

```text
Ethereum Mainnet
Base
Arbitrum One
```

同一地址可分别添加不同 network。

仍显示：

```text
只输入 public address
不要输入 private key / seed phrase
```

# 2. Connection card

例如：

```text
Base · Main Wallet
chainId 8453
0x1234…abcd

Current balance: synced
Finalized activity through block ...
Historical discovery: Limited
Debug trace: Available / Unavailable / Not checked
```

Arbitrum 同理。

# 3. Mandatory L2 warning

Base / Arbitrum 永远显示：

```text
Historical discovery is limited:
transactions that touch this address only through an internal native ETH call
may not be discovered by the current historical index.
Talli never treats missing activity as zero or complete.
```

中文主 UI 可翻译，但语义必须完整。

# 4. Debug unavailable

显示：

```text
余额同步可用
L2 movement 审核/导入暂不可用
需要 Alchemy Debug API capability
```

不得让用户以为整个 Wallet 功能坏了。

# 5. Asset identity

展示 chain：

```text
Base USDC
eip155:8453/erc20:0x...

Arbitrum USDC
eip155:42161/erc20:0x...
```

contract visible/truncated/copy。

# 6. Gas breakdown

Base：

```text
Network fee
L2 execution       ...
L1 data/security   ...
Operator fee       ...
Total              ...
```

Arbitrum：

```text
Network fee
Child execution        ...
Parent-chain posting   ...
Total                  ...
```

unresolved：

```text
Fee incomplete
Import disabled
```

# 7. Movement trace provenance

Candidate detail 可显示：

```text
Native movement evidence: call trace
Trace frames used: N
Historical coverage: discovery_limited
```

不要默认展示 calldata/output。

# 8. Bridge

可显示地址/tx来源，
但不显示“已匹配到 Ethereum bridge transaction”。

如果用户选择 Transfer：

```text
这是用户明确分类
```

# 9. Mobile

Base/Arbitrum chain identity、fee breakdown、coverage warning
都必须在 mobile WebKit 无横向 overflow。
