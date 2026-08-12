# Codex Master Instruction — V4

## Baseline

```text
Repository: wentAInx/Talli
main/tag baseline: 51a7f0c346c10c8bcd4e29261730eee5eb360df5
tag: v3.0.0
```

开工前运行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -10
git tag --points-at HEAD
```

若不是 `51a7f0c346c10c8bcd4e29261730eee5eb360df5` 或用户明确批准的 release-only descendant：停止并报告；不得 reset/rebase/force。

推荐分支：`feat/v4-evm-wallet-sync`。

## Frozen V1/V2/V3 semantics

不得改变 atomic TEXT + bigint、Account 单一 asset、Transfer/Exchange/Fee/Snapshot/Balance/Reports 语义、V2 valuation derived-only、V3 Kraken read-only/candidate/import/reconciliation/provenance/backup semantics。

允许为了 V4 做**最小 external-sync schema generalization**，但 V3 Kraken migration 后必须行为等价且 regression 全绿。

## V4 硬红线

1. On-chain sync 不自动写 Ledger。
2. Provider HTTP 永远在 SQLite write transaction 外。
3. 绝不请求/保存 private key、mnemonic、seed、WalletConnect session。
4. `ALCHEMY_API_KEY` 仅 server env。
5. Provider 不得存在任何 write/sign RPC：`eth_sendTransaction`、`eth_sendRawTransaction`、`eth_sign*`、`personal_*`、`wallet_*`。
6. 用户不得配置任意 RPC URL。
7. ERC-20 identity = chain + contract address，不是 symbol。
8. 钱的算术只用 JSON-RPC hex / `rawContract.value` → bigint；Alchemy human `value` number 绝不能用于 money arithmetic。
9. complex transaction 不猜 income/expense/exchange。
10. gas 与 movement 拆成两个 candidate，继续保持 one candidate -> at most one V1 event。
11. V4.0 production 仅 `chainId=1`。
12. V3 Kraken 必须完整 regression。

## Provider

Alchemy raw fetch + injectable transport。不要把 Alchemy SDK 变成必要依赖。

P0 read-only methods：

```text
eth_chainId
eth_blockNumber
eth_getBlockByNumber
eth_getBalance
eth_getTransactionByHash
eth_getTransactionReceipt
alchemy_getTokenBalances
alchemy_getTokenMetadata
alchemy_getAssetTransfers
```

不使用 Alchemy Prices；估值仍由 V2 负责。

## CI

禁止真实 Alchemy 网络：fixture/injectable transport only。

最终实际执行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```

不要伪造结果；不要 merge/tag/deploy，除非用户明确要求。
