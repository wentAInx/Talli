# Codex Master Instruction — Talli V6.0

你正在实现 `Talli V6.0 — Historical Net Worth & Analytics`。

## 0. 起点必须精确

开始前执行并报告：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse v5.1.0^{commit}
git log --oneline --decorate -8
```

预期 base：

```text
v5.1.0
dd39ff06aa52c681f42a0165b2e7a0552c022d09
```

如果工作区不是这个 base，先判断是否用户已经明确给出新的 canonical base。不得猜。

建议创建：

```text
feat/v6-historical-analytics
```

禁止：

- rewrite `v5.1.0`
- force push
- squash/rebase 已发布 release history
- 为“整理 release”制造无关 commit

## 1. Canonical precedence

V6 工作发生冲突时，按以下优先级：

1. 本文件
2. `03_ARCHITECTURE_INVARIANTS_CN.md`
3. `05_TIME_AND_DAILY_VALUATION_SEMANTICS_CN.md`
4. `06_HISTORICAL_QUOTE_DOMAIN_SPEC_CN.md`
5. `08_ANALYTICS_MATH_AND_DECOMPOSITION_CN.md`
6. `17_TEST_ACCEPTANCE_CN.md`
7. SQL / TS target drafts
8. UI / implementation guidance
9. 旧版本中仅仅因为“当时尚未实现”而写下的 non-goal

但 V6 **无权覆盖**已经冻结的 V1 Ledger、snapshot、money precision、V3–V5 provenance、安全和显式写入边界。

## 2. V6 必须实现

### P0 Core

- CoinGecko historical crypto/USD observations。
- ECB historical EUR reference observations。
- manual historical exact-pair quote。
- resumable explicit historical refresh。
- historical quote resolver。
- batched historical balance series。
- daily historical net worth。
- completeness + provenance。
- positive asset / liability breakdown。
- asset / asset-class / fiat-currency allocation。
- income / expense / net cash-flow historical trend。
- net-worth change decomposition。
- `/analytics` UI。
- Backup schema V8。
- migration + deterministic tests + E2E。

## 3. 明确不做

V6.0 禁止顺手加入：

- tax lots
- FIFO / LIFO
- realized / unrealized tax P&L
- wash sale
- jurisdiction tax rules
- performance IRR / TWR unless separately designed later
- benchmark comparison
- DeFi accounting
- stock/bond brokerage sync
- automatic provider fallback mixing
- stablecoin peg assumptions
- cron/background collectors
- provider data -> Ledger
- auto-post / auto-link
- multi-user auth/SaaS
- Redis/queue/microservice/event bus

## 4. Provider I/O rule

历史 provider fetch 必须：

```text
explicit user action
→ claim bounded refresh unit in DB
→ HTTP outside DB transaction
→ validate complete provider payload
→ re-check mapping fingerprint
→ atomic quote-cache write + unit status
```

Resolver / analytics reads必须 cache-only。

Server Component 不能 await CoinGecko / ECB。

## 5. Exact arithmetic rule

Ledger quantities：

```text
SQLite TEXT <-> bigint
```

Price/rate/value：

```text
positive decimal TEXT
+ decimal.js / existing PriceDecimal
```

禁止使用 JS `number` / `parseFloat` / SQLite REAL 做任何 authoritative financial arithmetic。

唯一允许 `number` 的地方：

- timestamps / durations；
- chart pixel geometry after server-side exact decimal values have already been computed；
- provider JSON number → existing external-decimal normalization boundary。

Chart geometry 的 number 绝不能反馈到 financial result / tooltip exact value / persisted value。

## 6. History must include archived facts

V6 historical read 不得复制 V2 current valuation 的“只看 active accounts/assets”行为。

只要某个 archived account / asset 在历史 cutoff 有非零余额或区间内有相关活动，它必须参与历史结果。

当前 Home Asset 仍必须是 active fiat；历史图统一按“当前 Home Asset”重估历史。

## 7. Incomplete is first-class

任意 nonzero exposure 缺 quote：

- 不得填 0；
- 不得 carry crypto beyond policy；
- 不得假设 USDT/USDC=USD；
- 不得把 known subtotal 冒充完整 net worth。

返回：

- known subtotal；
- missing asset list；
- `isComplete=false`；
- chart complete series 用 gap/null；
- UI 清楚显示 provider/date/provenance。

## 8. Implementation discipline

每阶段：

1. 先读现有 source。
2. 列出受影响 invariant。
3. 先写/更新 domain tests。
4. 再实现最小代码。
5. targeted tests。
6. full gate。
7. diff audit。

禁止删除、skip 或弱化 regression test 来换绿灯。
