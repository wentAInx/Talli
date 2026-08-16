# ISO 20022 camt.053 Import Spec

只支持 `BankToCustomerStatement` namespaces：

```text
camt.053.001.01 ... camt.053.001.14
```

unknown future version = explicit unsupported。

## XML security

在 XML library 前 case-insensitive reject：

```text
<!DOCTYPE
<!ENTITY
```

20MiB max、nesting/text limits、no external resources、no XInclude。

## Account

parse：

```text
Stmt/Acct/Id/IBAN
or Stmt/Acct/Id/Othr/Id
```

持久化 hash fingerprint + last4，不保存 full ID。

## Currency

prefer `Stmt/Acct/Ccy`；
每个 `Ntry/Amt @Ccy` 必须符合 profile currency。
mixed currency fatal in V5.0。

## Amount

```text
Ntry/Amt
Ntry/CdtDbtInd
```

CRDT positive，DBIT negative。No sign guessing。

## Date

authority：

```text
BookgDt/DtTm
BookgDt/Dt
```

保留 ValDt。date-only → profile timezone noon + precision=day。

## Identity

strong priority：

```text
AcctSvcrRef
TxId (only when exactly one TxDtls)
NtryRef
```

`NOTPROVIDED` 不算 strong。EndToEndId 单独不默认 strong。
无 safe ID → weak signature。

## Payee/memo

Debit prefer creditor display party；
Credit prefer debtor display party；
`RmtInf/Ustrd` → bounded memo。
BkTxCd 不自动映射 Talli category。

## Multi-TxDtls aggregate

如果一个 Ntry 有多个 TxDtls 且无法证明 exact non-overlapping split whose sum=Ntry/Amt：

```text
source persists
candidate=unsupported
```

禁止 heuristic split。

## Closing booked balance

`Bal` with code `CLBD` → `closing_booked` observation。
多个 CLBD 无法唯一选择时，不建 observation 并 warning。
