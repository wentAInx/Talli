# OFX / QFX Statement Import Spec

Scope：

```text
STMTRS
CCSTMTRS
BANKTRANLIST
STMTTRN
LEDGERBAL
```

不支持 investment/loan/billpay/wire/tax。

支持 OFX1 SGML / OFX2 XML；`.qfx` 走同一 statement parser，extension 不是 authority。

Transaction required：

```text
DTPOSTED
TRNAMT
```

preferred strong ID：

```text
FITID
```

optional：

```text
TRNTYPE DTUSER NAME MEMO CHECKNUM REFNUM SIC
```

所有 amount 走 exact decimal→bigint。

## OFX date

支持：

```text
YYYYMMDD
YYYYMMDDHHMMSS
YYYYMMDDHHMMSS.XXX
optional [offset:zone]
```

有 offset 用它；无 offset 用 profile timezone；date-only 保留 precision=day。

## Statement account

Bank 解析 BANKID/ACCTID/ACCTTYPE；
CreditCard 解析 ACCTID。

不保存 full ACCTID，只保存：
`sha256(normalized identity)` + `last4`。

首次 structured import 用户确认 statement account→target Talli account。
之后 fingerprint mismatch = fatal。

## Currency

`CURDEF` 必须匹配 profile explicitly confirmed currency mapping。

## Closing balance

`LEDGERBAL/BALAMT + DTASOF` → external balance observation。
不把 available balance 当 Ledger truth。

## SGML hardening

bounded OFX statement tokenizer：
known containers/leaves、size/depth/text limits、reject DTD/ENTITY。
不要把 arbitrary SGML 当 HTML。

## Dedupe

FITID 非空：

```text
external_id=ofx:fitid:<FITID>
identity_strength=strong
```

same profile+FITID = same source；resolved 后 payload changed → source_changed。
