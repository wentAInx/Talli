# CSV Import Spec

复用现有 `csv-parse`，禁止自己写 CSV quoting parser。

## Encoding

```text
utf-8
windows-1252
gb18030
```

UTF-8 BOM accepted。解码失败要 explicit error，不 silent replacement。

## Delimiter

```text
,
;
TAB
```

Preview 可 suggest，但 user confirms profile。

## Amount

两种模式：

```text
signed amount
```

或：

```text
debit + credit
```

debit 和 credit 同时非空 = invalid。

明确配置 decimal/thousands separator。
归一化后走 existing exact decimal parser → target asset scale → bigint。
Excess fractional digits reject，禁止 rounding。

`invertSign` 只能是 explicit profile option。

## Date

strict formats：

```text
YYYY-MM-DD
YYYY/MM/DD
YYYYMMDD
DD/MM/YYYY
MM/DD/YYYY
DD.MM.YYYY
```

optional time：

```text
HH:mm
HH:mm:ss
```

date-only：
`datePrecision=day`，profile timezone local 12:00 → canonical UTC。

## Optional

ID/payee/memo/currency columns。

若 currency column 存在：
所有 row 必须符合 profile 明确确认的 statement currency；
mixed currency fatal。

无 currency column：
target account asset 为 user-selected authority。

## Weak identity

无 explicit ID：

```text
signature =
profile
+ local source date
+ normalized signed raw amount
+ normalized payee
+ normalized memo
```

相同 signature 在同文件内：

```text
occurrenceOrdinal=1..N
```

external id：

```text
weak:<sha256(signature)>:<ordinal>
```

合法的两个 identical transactions 不能被 collapse。
