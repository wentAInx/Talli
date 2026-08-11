# Codex Master Instruction — Talli V3

## Baseline

Repository:

```text
wentAInx/Talli
```

Frozen V2 baseline:

```text
ad0de1d26d060fd391449f869a5c99a36f1901ed
```

开工前：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -8
```

若 HEAD 不是 baseline 或用户明确批准的 descendant：

- 不 reset
- 不 rebase
- 不 force push
- 先报告差异

推荐创建：

```text
feat/v3-external-sync
```

## V1/V2 frozen semantics

V3 不得改变：

- monetary atomic integer TEXT + bigint
- Account 单一 asset
- Transfer 同资产本金
- Exchange 跨资产真实数量
- fee 独立 entry，可第三资产
- snapshot 强锚点
- balance = latest snapshot + `(snapshot.asOf, queryTime]`
- reports 排除 transfer/exchange principal
- V2 quote/valuation 不修改 Ledger
- USDT/USDC 不固定等于 USD
- V2 cache derived-only

允许为了 **V3 原子导入** 做最小内部重构，但必须：

- 公共行为不变
- 所有 V1/V2 regression tests 继续 PASS
- 不复制 Ledger invariants
- 不建立“同步专用绕过通道”

## 外部同步硬红线

1. Provider HTTP 永远在 SQLite write transaction 外。
2. Sync 只能先写 V3 observation/source/candidate。
3. 外部余额变化绝不自动创建 snapshot。
4. 外部交易绝不自动创建 ledger event。
5. 只有用户明确点击 Import/Reconcile 后才可写 V1 Ledger。
6. re-sync 同一 external ID 不得重复 candidate。
7. imported candidate re-sync 不得重复入账。
8. provider source 改变后不得自动修改已导入 Ledger。
9. API key/secret 不得进入 SQLite、backup、client、HTML、logs、source JSON。
10. Kraken client 不得实现交易/提现/资金写 API。

## Kraken P0 endpoints

仅 Spot REST：

```text
/private/GetApiKeyInfo
/private/Balance
/private/Ledgers
/private/TradesHistory
/public/Assets?assetVersion=1
/public/AssetPairs?assetVersion=1
```

默认自动测试禁止真实 Kraken，使用 injectable transport + deterministic fixtures。

## Release gate

最终必须真实运行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

并要求 GitHub Actions exact final SHA：

```text
Quality & Build = success
Playwright E2E = success
```
