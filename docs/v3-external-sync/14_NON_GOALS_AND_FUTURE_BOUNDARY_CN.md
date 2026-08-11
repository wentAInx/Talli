# Non-goals / Future Boundary

## V3 本轮不做

- wallet addresses / chain scanning
- EVM/Solana/Bitcoin token parsing
- Coinbase/Binance/OKX
- Kraken Futures
- automated import
- scheduled cron
- WebSocket
- secret vault
- historical market price V2.1
- cost basis
- P&L
- tax

## Wallet

放 V3.3 或后续独立包。
Wallet 的 transfer/gas/swap/bridge 语义不要与交易所 Spot 强行共用 parser。

## Other providers

Schema/interfaces 应可 additive 扩展：

```text
provider = coinbase
provider = wallet_evm
```

但不要为了未知未来造微服务/Redis/queue。

## Auto-import

未来即使做也必须：

- explicit opt-in
- deterministic rules
- candidate/provenance retained
- V1 invariants unchanged

## Cron

V3 P0 manual sync only。
后续再加 scheduled sync/notifications。

## Secret vault

V3.1 server env。
多 connection 后再设计 encrypted secret store + master key + rotation。
