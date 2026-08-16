# Import Pipeline

## Preview

Browser 上传 file + profile/draft config。

Server：

```text
size check
content sniff
decode
parse outside DB write tx
normalize exact amounts
validate target account/currency/account fingerprint
lookup known source IDs
compute match suggestions
return preview
```

Preview 不写 source/candidate/ledger/snapshot/batch。

## Commit

浏览器重新提交同一 file + confirmed config。
Server 必须重新 hash/reparse/revalidate，不能信任 preview。

随后一个 `BEGIN IMMEDIATE` 原子持久化：

- batch
- source objects/details
- batch-source links
- candidates/details/legs
- optional closing balance observation

No parsing inside tx.

## Failure semantics

Statement-level malformed → whole batch rejected。

CSV 任一非空 transaction row 的 required date/amount 无法解析：
preview fatal，必须修 mapping/config 后才能 commit。

Structured malformed amount/date/account/currency：
batch fatal。

Valid-but-unsupported semantic row（例如 CAMT aggregate entry 无法安全拆分）：
source persist + candidate unsupported + no import action。

## Source payload

只持久化 selected/audited raw fields，不保存 entire file/account number。

## Filename

只保存 basename，去 path/control/NUL，max 255 chars。

## Candidate

```text
out → external_out → expense|transfer
in  → external_in  → income|transfer
```

No auto category/event type。

## Batch idempotency

同 `(connectionId,fileSha256)` 再上传：
识别为 exact file duplicate，不创建新 batch/candidate。
