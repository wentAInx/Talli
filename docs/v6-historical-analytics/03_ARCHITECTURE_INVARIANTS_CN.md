# V6 Architecture Invariants

## A. Ledger remains the only financial fact layer

```text
historical quote
historical analytics
historical refresh run
chart
allocation
decomposition
```

全部禁止写 Ledger。

## B. Snapshot semantics cannot drift

V6 必须与现有 `queryBalanceAt/queryBalancesAt` 等价：

```text
latest snapshot S <= Q
balance(Q)
=
S.balance
+
entries in (S.asOf, Q]
```

若没有 snapshot：

```text
0 + entries <= Q
```

新 batched series 必须用 randomized / fixture differential test 与现有 query function 对拍。

## C. Natural date = App timezone

- range labels
- daily cutoff
- monthly bucket
- “last completed day”
- cash-flow day/month

统一使用 App timezone。

禁止 browser UTC date / server local date 偷偷进入 accounting calendar。

## D. Historical provider observations are replaceable derived data

Provider quote cache：

- 可删除；
- 可重新抓；
- 不进入 Backup；
- 不进入 Ledger CSV；
- 不改变 native balances。

Manual historical quote 是 user-authored valuation fact，必须进 Backup。

## E. Provider resolution has provenance

每个 resolved leg 至少保留：

- source
- provider
- base/quote asset
- rateText
- provider observed time/date
- fetched time
- granularity
- carry/fallback kind

## F. Missing != zero

对非零 quantity：
- no mapping → incomplete
- no observation → incomplete
- too-old crypto quote → incomplete
- ECB carry > policy → incomplete
- provider error without cached quote → incomplete

## G. No implicit stablecoin peg

USDT / USDC / future stablecoin 都按 crypto mapping + market quote。

## H. Historical views include archived accounts/assets

Archive 是当前 availability/UI state，不是“删除历史”。

## I. Current V2 remains intact

不要把 current `latestPriceQuotes` 改造成 history table。
V2 current resolver/API/UI 继续工作。

V6 新增独立 historical observations/resolver，允许共享：

- decimal math
- asset/mapping semantics
- HTTP transport
- provider error mapping

## J. Provider HTTP never inside write transaction

遵守：

```text
claim
COMMIT
HTTP
validate
BEGIN IMMEDIATE
re-check mapping/run state
write
COMMIT
```

## K. No background collector

V6 refresh 只能是：
- user explicitly starts;
- foreground client may issue bounded continuation steps;
- interrupted run may be resumed manually/foreground.

没有 cron / queue / daemon。

## L. Normal reachable state must be Backup-valid

新增 manual historical quote 的每个正常 mutation 都必须满足 V8 exporter/validator。
