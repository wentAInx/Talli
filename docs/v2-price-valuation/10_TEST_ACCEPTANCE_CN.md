# Talli V2.0 Test & Acceptance Matrix

只有本文件核心红线全部通过，才算 V2.0 完成。

# 1. V1 Regression Gate

所有现有 V1 tests 必须继续通过。

尤其：

- Money atomic precision。
- Transfer/Exchange invariants。
- third-asset fee。
- snapshot balance matrix。
- reports exclude principal。
- backup V1 facts。
- desktop/mobile E2E。

# 2. Price Decimal Unit Tests

## P-001

接受：

```text
1
0.9998
68123.456789
0.000000000000000001
```

拒绝：

```text
0
-1
1e-8
NaN
Infinity
空串
逗号数字
```

## P-002

Decimal normalization round-trip，不经 JS number 算术。

# 3. Quote Resolution Unit Tests

## Q-001 Identity

Home=CNY, base=CNY -> rate=1，不请求/不依赖 cache。

## Q-002 ECB direct

EUR->CNY 使用 EUR/CNY source leg。

## Q-003 ECB cross

给：

```text
EUR/USD = 1.10
EUR/CNY = 7.70
```

应：

```text
USD/CNY = 7.0
```

## Q-004 ECB inverse

USD->EUR = `1 / 1.10`，Decimal 精度正确。

## Q-005 Crypto via USD

给：

```text
BTC/USD = 68000 CoinGecko
USD/CNY = 7 ECB
```

应：

```text
BTC/CNY = 476000
```

provenance 保留两个 legs。

## Q-006 Manual override

存在 active manual BTC/CNY 时，不使用自动 BTC/USD/ECB legs。

## Q-007 Stablecoin redline

USDT/USD CoinGecko fixture = `0.9972`，resolver 必须输出 0.9972 路径，不得变成 1。

## Q-008 Custom

Custom asset 无 manual exact pair -> unsupported/missing。

# 4. Valuation Unit Tests

## V-001

1000.00 CNY -> Home CNY exactly 1000，不需要 external quote。

## V-002

BTC atomic/scale 计算不经 number。

## V-003

负 USD balance 经 FX 后为负估值，并减少 portfolio sum。

## V-004

零余额且 mapping missing 不影响 `isComplete`。

## V-005

非零 asset quote missing -> `isComplete=false`、missing count +1。

## V-006 Rounding drift

构造多个 line，使“逐项 2dp 后求和”与“精确求和后 2dp”不同；必须得到后者。

# 5. CoinGecko Adapter Tests（mock HTTP）

- Batch IDs 正确、`vs_currencies=usd`。
- 使用 provider IDs，不使用 symbol。
- Demo mode header `x-cg-demo-api-key` 正确。
- keyless 不发送 key header。
- 401/403 -> AUTH_ERROR。
- 429 + Retry-After -> cooldown。
- 500 -> UPSTREAM_ERROR。
- malformed/missing quote -> payload invalid。
- 一次失败不删除已有 cache。
- 所有 fixture tests 禁止真实网络。

# 6. ECB Adapter Tests（mock HTTP）

- series key 使用 `D.<OR currencies>.EUR.SP00.A`。
- `lastNObservations=1`。
- CSV 按 header parse，不依赖列序。
- EUR 不请求 series，identity=1。
- observation date 保存。
- invalid OBS_VALUE 拒绝。
- 周末返回上个工作日 observation 时仍可被视为最新 fetched official reference。

# 7. Cache State Tests

## C-001 fresh

10min 内 CoinGecko cache -> 不 auto refresh。

## C-002 stale but usable

超 fresh TTL 但 <24h -> render stale + refresh due。

## C-003 unusable

>24h 且 refresh failure -> missing/provider_error，不继续完整估值。

## C-004 ECB

6h refresh TTL，7d stale usable。

## C-005 manual refresh cooldown

force 不能绕过 60s cooldown / Retry-After。

## C-006 no external call in DB transaction

用 test transport/assertion 验证 provider fetch 发生时没有 active SQLite write transaction（可通过架构/spy 间接验证）。

# 8. DB Migration Integration Tests

- 从 V1 baseline schema migration 到 V2 成功。
- V1 tables/rows 保持。
- 新表存在、FK 开启、WAL 仍开启。
- migration idempotent through Drizzle migrator。
- 不修改历史 migration 文件。

建议 migration test：先按 V1 migration 创建 fixture DB，写入 V1 account/event/snapshot，记录 backup/balance，再应用 V2 migration，结果完全一致。

# 9. Ledger Isolation Tests

## L-001

价格刷新前后：

```text
ledger_events count unchanged
ledger_entries rows unchanged
balance_snapshots rows unchanged
current balances unchanged
```

## L-002

删除 `latest_price_quotes` + `price_provider_state` 后，同样完全不影响 V1 ledger/balance。

# 10. Backup Tests

## B2-001

V2 export `schemaVersion=2`。

## B2-002

包含 valuation settings/mappings/manual quotes。

## B2-003

明确不包含 latest cache/provider state/API key。

## B2-004

V1 `schemaVersion=1` fixture 可恢复到 V2 空 DB，V1 facts/balances 完整。

## B2-005

V2 backup round-trip config exact。

## B2-006

corrupt manual rate/mapping/home asset 在任何 write 前拒绝。

## B2-007

mid-transaction restore error 整库 rollback。

# 11. E2E

至少覆盖 desktop Chromium + mobile WebKit：

1. V1 native dashboard 仍工作。
2. Settings 设置 Home=CNY。
3. 使用 deterministic fake provider/cache fixture（不要 live API）显示 BTC 估值。
4. 显示 estimated total `≈`。
5. USDT fixture 0.9972，不显示固定 1。
6. provider missing 时显示 incomplete，不按 0 静默处理。
7. manual quote 创建后覆盖 exact pair，停用后恢复 automatic path。
8. refresh button 有 pending/cooldown UX。
9. mobile 无横向溢出。
10. CoinGecko attribution 可见。

# 12. Security Acceptance

- client bundle/source 不引用 `COINGECKO_API_KEY` value。
- HTML 不出现 key。
- backup 不出现 key。
- SQLite 不出现 key。
- provider error UI 不回显 header/key。

# 13. Build Gate

必须实际运行：

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

# 14. Definition of Done

- [ ] V1 regression 全绿。
- [ ] V2 additive schema/migration 完成。
- [ ] Home Asset 完成。
- [ ] CoinGecko current Crypto/USD 完成。
- [ ] ECB reference/cross FX 完成。
- [ ] Manual override 完成。
- [ ] cache/fresh/stale/error state 完成。
- [ ] SSR 不等待外网。
- [ ] portfolio valuation + incomplete semantics 完成。
- [ ] API key server-only。
- [ ] Backup v2 + V1 restore compatibility 完成。
- [ ] Dashboard/Settings UI 完成。
- [ ] Attribution 完成。
- [ ] 未实现 V2.1/non-goals。
