# V4 Security Spec

V4 UI/API **只接收 public address**。不存在 private key / mnemonic / seed / keystore / WalletConnect / signing。

`.env.example`：`ALCHEMY_API_KEY=` 空占位；SQLite/backup/client/source payload/logs 都不能保存 key。

扩展 `pnpm security:check`：

- client/persistence/built static 不得出现 `ALCHEMY_API_KEY` 或 sentinel；
- `src/providers/evm` 禁止 JSON-RPC method strings：`eth_sendTransaction`、`eth_sendRawTransaction`、`eth_sign`、`eth_signTransaction`、`eth_signTypedData`、`personal_`、`wallet_`；
- production 不允许 custom RPC URL；
- CI `ALCHEMY_API_KEY=""`，fixture mode 外的 live transport 在 `CI=true` 直接拒绝。

Alchemy key 位于 URL path，所以 provider error/log 只能输出 method/chain/error code，不能输出 request URL。

所有 sync/import/ignore/reconcile/add-wallet mutation route 必须 same-origin。
