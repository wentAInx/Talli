# V4 Implementation Plan

1. **Baseline**：从 v3.0.0 创建 `feat/v4-evm-wallet-sync`，旧 gates green。
2. **Schema generalization**：provider/sourceKey/object types + forward migration + EVM tables；先做 V3 migration/Regression tests。
3. **Domain primitives**：address、asset keys、hex bigint、atomic↔decimal、tx hash/uniqueId。
4. **Alchemy shell/security**：env、fixed origin、method allowlist、chainId、injectable transport、safe error。
5. **Balances**：ETH、ERC20 pagination、metadata、observations。
6. **Activity**：finalized head、history timestamp→block binary search、from/to pagination、tx/receipt enrichment。
7. **Persistence**：source objects、EVM cursor、no Ledger mutation。
8. **Normalizer**：net movement、simple/complex、failed tx。
9. **Gas**：execution/blob fee、separate candidate。
10. **Import**：reuse ExternalImportService/V1 writer，atomic provenance；Kraken regression。
11. **Reconcile**：exact only，explicit snapshot。
12. **Backup v4**：1/2/3/4、validation/roundtrip/rollback。
13. **UI**：wallet/mapping/balance/activity/gas/complex/provenance/mobile。
14. **Security/E2E/CI**：no real Alchemy，all old + V4 tests。
15. **Final audit prep**：输出 final SHA、migration、test counts、CI run、known limitations，交 ChatGPT 独立审计。
