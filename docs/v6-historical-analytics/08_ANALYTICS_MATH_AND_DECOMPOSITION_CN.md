# Analytics Math & Net-worth Decomposition

## 1. Daily portfolio valuation

对 date D：

```text
T_D = App-timezone local day end
Q_a(D) = ledger balance of asset a at T_D
P_a(D) = historical resolved home rate at T_D

V_a(D) = Q_a(D) × P_a(D)
```

使用 existing `PriceDecimal` / decimal text。

Portfolio：

```text
known = Σ known V_a
complete = every nonzero Q_a has P_a
```

如果 incomplete：
- `knownValue` 可返回；
- authoritative chart total = null。

## 2. Gross assets / liabilities

按 home value sign：

```text
grossAssets      = Σ max(V_a, 0)
grossLiabilities = Σ min(V_a, 0)
netWorth         = grossAssets + grossLiabilities
```

负债不塞进 pie percentage denominator。

## 3. Allocation

### Asset allocation
只对 positive values：
```text
share_a = V_a / grossAssets
```

### Asset class
```text
fiat
crypto
custom
```

### Fiat currency allocation
仅 fiat positive holdings：
```text
CNY / USD / EUR / HKD / ...
```

crypto 不伪装成“currency allocation”。

若 denominator=0，返回 empty—not NaN。

## 4. Historical cash-flow trend

沿用 V1 report inclusion：

- income/main
- expense/main
- transfer/exchange fee

排除：
- transfer principal
- exchange principal
- snapshot

每个 included entry在 `occurredAt` 解析 historical home rate：

```text
homeValue = nativeQuantity × rateAt(event time)
```

bucket 使用 App timezone month。

结果：
- income
- expense
- fees
- netFlow
- isComplete
- missing entries/assets count

缺 quote 不填 0。

## 5. Daily net-worth bridge identity

对 asset `a`，相邻日：

```text
Q0 = prior cutoff quantity
Q1 = current cutoff quantity
P0 = prior cutoff home rate
P1 = current cutoff home rate

ΔQ = Q1 - Q0
ΔP = P1 - P0

MarketEffect_a = Q0 × ΔP
QuantityEffect_a = ΔQ × P1

ΔV_a
= Q1×P1 - Q0×P0
= MarketEffect_a + QuantityEffect_a
```

这是 algebraic attribution，不是 cost basis / realized P&L。

## 6. Quantity-effect classification

对 `(T0, T1]` 的 Ledger entries按 event type / entry role求 native delta：

- `income/main` → income
- `expense/main` → expense
- transfer/exchange `fee` → fees
- transfer principal → internal_transfer
- exchange principal → trade_rebalance

对每类：

```text
component = Σ nativeDelta_a × P1_a
```

### Reconciliation effect

Snapshot 会覆盖历史 entry accumulation，因此定义：

```text
EntryDelta_a = Σ all ledger entry amount in (T0,T1]
ReconDelta_a = Q1 - Q0 - EntryDelta_a

ReconciliationEffect_a = ReconDelta_a × P1_a
```

这确保 snapshot reset 被显式暴露。

## 7. Exact bridge

Portfolio：

```text
NetWorthDelta
=
MarketAndFx
+ Income
+ Expense
+ Fees
+ InternalTransfer
+ TradeRebalance
+ Reconciliation
```

`InternalTransfer` 在 portfolio aggregate、同资产双腿正常情况下必须 exact 0。
若非 0，优先视为 implementation/data invariant bug，不要静默吞掉。

`TradeRebalance` 可以非 0：
- end-of-day prices下交换两腿价值可能不同；
- 它不是 realized P&L；
- UI 名称用 `Trade / rebalance effect`。

## 8. Incomplete decomposition

只要某 asset 在公式中需要 `P0` 或 `P1` 而缺失：
- entire affected day bridge `isComplete=false`；
- 不把 missing component 当 0；
- 可返回 known components + missing asset IDs；
- 总 bridge 不应冒充 exact reconciliation。

## 9. Archived + zero endpoint edge

即使 asset 在 Q0/Q1 都为 0，只要 day 内有 nonzero Ledger activity，decomposition 仍需考虑它。

因此 decomposition asset set：

```text
assets with Q0 != 0
OR Q1 != 0
OR nonzero entries in interval
OR snapshot delta in interval
```
