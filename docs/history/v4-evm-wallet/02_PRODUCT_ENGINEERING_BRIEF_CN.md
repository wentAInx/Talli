# Product & Engineering Brief

V4 的目标不是“把区块链当账本”，而是把公开链上状态转成 Talli 可审核的 observation / source object / candidate。

## P0

- 多个 Ethereum Mainnet raw address；
- address label + history start date；
- manual sync；
- ETH + ERC20 current balances；
- token metadata；
- external asset/account mapping；
- exact balance difference + explicit snapshot reconciliation；
- external/internal/ERC20 activity；
- finalized history；
- tx/receipt enrichment；
- movement candidate + gas candidate；
- idempotency/provenance；
- simple import；
- complex tx safe unsupported state；
- backup schemaVersion 4；
- V1/V2/V3 compatibility；
- desktop/mobile E2E。

## Gas 独立 candidate

一笔 tx：

```text
-100 USDC
+0.04 ETH
gas 0.001 ETH
```

生成：

```text
movement candidate -> Exchange suggestion
gas candidate      -> Expense suggestion
```

这样保留 V3 `external_import_links` 的 one candidate ↔ one Ledger event，不需要一条 on-chain candidate 隐式创建多条 V1 events，也能正确覆盖 gas-only / failed tx。

## 自动分类边界

```text
1 positive asset only                 -> simple_in / unknown
1 negative asset only                 -> simple_out / unknown
1 negative A + 1 positive B, A != B   -> simple_exchange / exchange suggestion
3+ nonzero assets / complex movement  -> unsupported complex
no movement + wallet pays gas         -> gas candidate only
```

Inbound 不自动 income；outbound 不自动 expense。用户必须明确选择。
