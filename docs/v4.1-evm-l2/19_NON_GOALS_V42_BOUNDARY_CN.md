# V4.1 Non-goals / V4.2 Boundary

V4.1 不做：

- complete historical internal-only discovery；
- webhook；
- cron；
- WebSocket；
- bridge auto-link；
- Optimism；
- Polygon；
- BNB；
- Arbitrum Nova；
- Base Flashblocks；
- pre-Nitro Arbitrum trace adapter；
- NFT；
- DeFi position；
- AA/paymaster gas semantics；
- private key / signing；
- auto import；
- L2 price engine。

# Suggested V4.2

> L2 Activity Completeness & Live Monitoring

候选：

- Alchemy Address Activity webhook；
- future internal transfer notification；
- webhook authenticity / replay protection；
- self-hosted public endpoint security；
- historical gap marking；
- explicit backfill strategy。

只有 V4.1 freeze 后再设计。

# Other chains

Bitcoin / Solana 仍不应塞进 EVM abstraction。
建议未来独立 major version。
