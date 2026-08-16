# V4 UI / UX

复用 `/sync`，分区显示 Kraken 与 Ethereum Wallets，不另做割裂 app。

Add Wallet：名称、Public Ethereum address、History start date；固定 Ethereum Mainnet；文案明确“不要输入 private key / seed phrase”。

Credential card：Alchemy server env Configured/Missing，不显示 key 前后缀。

Wallet card：label、0x1234…abcd、Current balances、History synced through finalized block、Sync Now。

Asset mapping：native/contract address、symbol、decimals、Talli asset、Talli account；contract address 必须可见，symbol 不作为 identity。

Balance card：on-chain observed / Talli Ledger / difference / observedAt / explicit Reconcile；说明创建 snapshot，不是 income/expense。

Activity 按 tx hash 视觉分组：

```text
Tx 0xabc...
  Movement: 100 USDC -> 0.04 ETH   [Review]
  Network fee: 0.001 ETH           [Review]
```

Complex tx：显示 net movements + source/provenance + `Automatic import unavailable`，只允许 Ignore / 普通 Talli 手工记账。

Imported event detail：Imported from Ethereum、wallet、tx hash、candidate；不依赖 Alchemy 才能打开。

Mobile WebKit 必测无横向 overflow、mapping、tx group、review/provenance。
