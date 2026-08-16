# V5.0 Scope Decisions

## CSV

- target account；
- header/no-header；
- delimiter comma/semicolon/tab；
- encoding UTF-8 / Windows-1252 / GB18030；
- strict date format + optional time；
- signed amount 或 debit+credit columns；
- decimal/thousands separator config；
- optional source-id/payee/memo/currency；
- preview + saved profile。

## OFX/QFX

Statement-only：

```text
BANKMSGSRSV1 / STMTRS
CREDITCARDMSGSRSV1 / CCSTMTRS
BANKTRANLIST / STMTTRN
LEDGERBAL
```

支持 OFX1 SGML / OFX2 XML，QFX 走同一 parser。
不支持 investment/loan/billpay/wire/tax message sets。

## camt.053

Common subset：

```text
BkToCstmrStmt / Stmt / Acct / Ntry / Amt / CdtDbtInd
BookgDt / ValDt / NtryRef / AcctSvcrRef / BkTxCd
NtryDtls/TxDtls / Refs / RltdPties / RmtInf / Bal
```

Namespace whitelist：camt.053.001.01–14。

## Out of scope

QIF、MT940、PDF/OCR、CAMT.052/054、direct bank sync、Rules、Recurring、
auto-match、auto-import、multi-account auto-routing、FX split inference、budget。
