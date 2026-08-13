# Security & Capability Spec

# 1. Wallet secrets

仍然只有：

```text
public address
```

绝不：

- private key；
- mnemonic；
- seed phrase；
- keystore；
- WalletConnect；
- sign；
- send。

# 2. Provider secret

```text
ALCHEMY_API_KEY
```

server-only。

同一个 key 可服务 3 个 chain origins。

# 3. Fixed origins

只有 registry 常量可以构造 URL。

不能把：

```text
origin
rpcUrl
host
scheme
```

作为 DB/user input。

# 4. Secret in URL

Alchemy key 位于 `/v2/<key>`。

禁止 log：

- URL；
- response.url；
- fetch exception with raw URL；
- request object。

# 5. Read method allowlist

增加：

```text
debug_traceTransaction
eth_getRawTransactionByHash
eth_call
```

security:check 仍禁止：

```text
eth_sendTransaction
eth_sendRawTransaction
eth_sign
eth_signTransaction
eth_signTypedData
personal_
wallet_
```

# 6. eth_call scope

`eth_call` 只允许 Base fee adapter：

```text
to = 0x420...000F
method = getL1Fee/getOperatorFee
block = transaction block
```

业务 route/UI 不得传任意 contract/data。

# 7. Debug capability

Provider paywall不是 financial error。

安全状态：

```text
trace_unavailable
```

不能记录 Alchemy 原始付费/credential error payload。

UI 用安全文案：

```text
Alchemy Debug API unavailable for reviewed L2 activity.
Balance sync remains available.
```

# 8. CI

CI：

```text
ALCHEMY_API_KEY=""
```

fixture-only。

新增静态检查：

- Base/Arbitrum origins只在 server chain registry；
- no write/sign；
- no raw API key in static bundle；
- no arbitrary RPC env var。
