# TALLI V5.0 FINANCIAL FILE IMPORT — COMBINED CODEX ENGINEERING PACKAGE

Repository: `wentAInx/Talli`

Frozen baseline: `ef968976510e04f0532715c1e73f88595a607e89` / `v4.1.0`

Generated: 2026-08-13


---

# FILE: 00_README_CN.md

# Talli V5.0 — Financial File Import & Matching Foundation

Repository: `wentAInx/Talli`

Frozen baseline:

```text
v4.1.0
ef968976510e04f0532715c1e73f88595a607e89
```

V4.1 main release CI: `31700359476` — Quality & Build PASS / Playwright E2E PASS.

推荐开发分支：`feat/v5-financial-file-import`

## 下一阶段总路线

用户已批准三个连续主题：

```text
V5.0  Bank Statement / File Import + Duplicate / Match
V5.1  Rules & Recurring Automation
V6.0  Historical Net Worth & Analytics
```

本任务包只开发 **V5.0**，不要把 Rules、Recurring、Historical Price/Net Worth 混入本轮。

## V5.0 正式范围

首批支持：

- CSV
- OFX / QFX Banking & CreditCard statement subset
- ISO 20022 camt.053 Bank-to-Customer Statement

V5.0 不做 direct bank API / Open Banking OAuth。

最高边界：

```text
Imported file != Ledger
```

文件必须经过：

```text
Uploaded file
→ Parse / normalize
→ External source object
→ Candidate
→ Duplicate / Match review
→ Explicit Import OR Explicit Match Existing
→ V1 Ledger / provenance
```

禁止上传后直接创建 Ledger event/snapshot；禁止自动 Match；禁止自动 Import；
禁止精度 rounding；禁止 raw bank file 进入 SQLite/Backup。


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

# Codex Master Instruction — Talli V5.0

## Frozen baseline

```text
Repository: wentAInx/Talli
Tag: v4.1.0
SHA: ef968976510e04f0532715c1e73f88595a607e89
```

开始前实际执行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git tag --points-at HEAD
git log --oneline --decorate -10
```

推荐：

```bash
git checkout main
git pull --ff-only
git switch -c feat/v5-financial-file-import
```

如果 baseline 不匹配，停止并报告。

## 冻结语义

不得改变 V1 bigint Ledger、Expense/Income/Transfer/Exchange、snapshot/reconciliation、
V2 valuation derived boundary、V3 Kraken read-only/candidate/provenance、
V4/V4.1 EVM observation/review/import、Base/Arbitrum exact fee、Backup 1–5 兼容。

## V5.0 hard red lines

1. File import 是 external observation，不是 Ledger。
2. Preview 零 financial DB write。
3. Commit 只创建 import provenance/source/candidate/observation。
4. Explicit Import 使用同一个 V1 writer。
5. Explicit Match Existing 不修改被匹配的 Ledger event。
6. V5.0 不 auto-match / auto-import。
7. 不做 Rules/Recurring/Historical valuation/direct bank API。
8. raw file bytes 不进 DB/Backup。
9. full bank account number 不进 source/Backup。
10. 所有金额 exact，money 不用 JS `number`。
11. structured account/currency mismatch fail closed。
12. parse 在 SQLite write tx 外；batch persistence atomic。
13. file parser 不进行 HTTP。
14. XML 在 parser 前拒绝 `<!DOCTYPE` / `<!ENTITY`。
15. deterministic fixtures only。

支持：

```text
CSV
OFX 1.x SGML Banking/CreditCard subset
OFX 2.x XML Banking/CreditCard subset
QFX through OFX parser
camt.053.001.01 ... camt.053.001.14 common subset
```

不支持 QIF/MT940/PDF/OCR/camt.052/camt.054/investment OFX。

Limits：

```text
MAX_FILE_BYTES = 20 MiB
MAX_TRANSACTION_ROWS = 100000
MAX_TEXT_FIELD_CHARS = 10000
```

CSV 复用现有 `csv-parse`。

XML 允许新增一个 server-only parser dependency；必须先核对 upstream security。
截至 2026-08-13，`fast-xml-parser 5.10.1` 为当前版本，但即使使用它也必须预先拒绝 DTD/ENTITY。

Final gate：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```

不要 merge/tag；完成后返回 exact SHA + Actions run。


---

# FILE: 02_VERSION_ROADMAP_CN.md

# Talli Next Product Roadmap

## V5.0 — Financial File Import & Matching

```text
CSV / OFX / QFX / camt.053
→ source
→ candidate
→ review
→ import / match
```

## V5.1 — Rules & Recurring Automation

V5.0 freeze 后开发。

Rules：
- provider/account/payee/memo/amount/direction conditions；
- set category/payee/tags/note/suggested event type；
- preview affected candidates；
- 默认不自动写 Ledger。

Recurring：
- rent / salary / subscriptions / insurance / annual fee；
- daily/weekly/monthly/yearly + interval；
- exact / approx / range amount expectation；
- actual transaction link；
- history-based suggestion；
- future expectation != Ledger fact。

## V6.0 — Historical Net Worth & Analytics

单独 major version，引入 historical price/FX time series：

```text
historical_price_quotes
daily portfolio valuation
historical completeness
Net Worth chart
asset/currency allocation
cash-flow trends
market movement vs Ledger flow
```

仍然：

```text
Historical valuation != Ledger
```

Cost basis / tax / realized P&L 不默认混入 V6.0。


---

# FILE: 03_PRODUCT_ENGINEERING_BRIEF_CN.md

# V5.0 Product & Engineering Brief

用户从银行/信用卡/Wise/Revolut 等下载 statement，再进入 Talli：

```text
选择 Target Account
→ 上传 CSV/OFX/QFX/camt.053
→ Preview
→ CSV mapping / structured account & currency confirmation
→ Duplicate / Possible match
→ Create review candidates
→ Import / Match Existing / Ignore
```

每个 Import Profile 明确绑定一个 Talli target account。这个选择本身就是显式资产/账户映射，
不能从 `$`、`USD`、`人民币` 自动决定 Talli account。

单账户 statement row：

```text
negative → Expense OR Transfer
positive → Income OR Transfer
```

方向不自动等于 Expense/Income。

Match Existing 场景：

```text
8/10 用户手工记 Starbucks -35
8/12 bank statement 出现 STARBUCKS -35
```

Talli 只提示 Possible Match。用户明确 Match Existing 后：
- 不创建新 Ledger event；
- 建 provenance link；
- 原 Ledger event 不被自动改日期/Payee。

OFX/camt.053 若提供 closing ledger/booked balance：
作为 external balance observation，用户可明确 Reconcile。

隐私：
- 不保存 raw statement file；
- 保存 file hash、sanitized filename、选中 raw fields、source row hash、masked account clue；
- 不保存 full account number / 未选 CSV 列。


---

# FILE: 04_SCOPE_AND_DECISIONS_CN.md

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


---

# FILE: 05_IMPORT_DOMAIN_MODEL_CN.md

# File Import Domain Model

## File Import Profile

Persistent source definition：

```text
external_connection
provider = file_import
source_key = file:<connectionId>
credential_ref = local:file-import
```

Subtype：`file_import_profiles`。

Target account immutable；更换账户或 materially different CSV mapping 时新建 profile。

Provider asset key：

```text
file:<connectionId>:target
```

Profile 创建时，基于用户明确选择的 target account/asset 创建 external asset/account mapping。
这不是 symbol auto-map。

## Source object

扩展：

```text
external_source_objects.object_type += file_transaction
```

source payload 只保存 selected/audited raw fields。

## Candidate status

扩展：

```text
matched
```

完整状态：

```text
pending
needs_mapping
ignored
imported
matched
unsupported
source_changed
```

语义：

```text
imported → external_import_link
matched  → external_candidate_match_link
source_changed → exactly one provenance kind
```

## Direction

```text
in / out
```

只表示 statement account direction，不等于 income/expense。

Allowed：

```text
in  → income | transfer
out → expense | transfer
```

## Date precision

```text
timestamp
day
```

Date-only source：
- preserve source text；
- profile timezone local 12:00；
- canonical UTC occurredAt；
- UI 显示 date-only；
- matching按 calendar date。

## Identity strength

```text
strong
weak
```

Strong：
OFX FITID、safe CAMT references、CSV explicit stable ID。

Weak：
normalized signature + occurrence ordinal。


---

# FILE: 06_DATABASE_TARGET_SCHEMA_V5_DRAFT.sql

-- Documentation target schema only.
-- Real migration must generalize existing CHECK constraints and preserve V4.1 rows.

CREATE TABLE file_import_profiles (
  connection_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_connections(id) ON DELETE CASCADE,
  target_account_id TEXT NOT NULL
    REFERENCES accounts(id) ON DELETE RESTRICT,
  format TEXT NOT NULL CHECK(format IN ('csv','ofx','qfx','camt053')),
  parser_config_json TEXT NOT NULL,
  statement_account_fingerprint TEXT,
  statement_account_last4 TEXT,
  statement_currency_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE file_import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL
    REFERENCES file_import_profiles(connection_id) ON DELETE CASCADE,
  file_sha256 TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('csv','ofx','qfx','camt053')),
  parser_version INTEGER NOT NULL CHECK(parser_version > 0),
  ingested_at TEXT NOT NULL,
  source_row_count INTEGER NOT NULL CHECK(source_row_count >= 0),
  new_candidate_count INTEGER NOT NULL CHECK(new_candidate_count >= 0),
  duplicate_count INTEGER NOT NULL CHECK(duplicate_count >= 0),
  unsupported_count INTEGER NOT NULL CHECK(unsupported_count >= 0),
  statement_from_date TEXT,
  statement_to_date TEXT,
  UNIQUE(connection_id, file_sha256)
);

CREATE TABLE file_import_source_details (
  source_object_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_source_objects(id) ON DELETE CASCADE,
  identity_strength TEXT NOT NULL CHECK(identity_strength IN ('strong','weak')),
  source_id_kind TEXT NOT NULL CHECK(source_id_kind IN (
    'fitid','acct_svcr_ref','tx_id','ntry_ref','csv_id','weak_signature'
  )),
  original_date_text TEXT NOT NULL,
  date_precision TEXT NOT NULL CHECK(date_precision IN ('timestamp','day')),
  normalized_payee TEXT,
  memo TEXT,
  statement_currency_code TEXT
);

CREATE TABLE file_import_batch_source_objects (
  batch_id TEXT NOT NULL
    REFERENCES file_import_batches(id) ON DELETE CASCADE,
  source_object_id TEXT NOT NULL
    REFERENCES external_source_objects(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL CHECK(row_index >= 0),
  raw_row_sha256 TEXT NOT NULL,
  PRIMARY KEY(batch_id, source_object_id),
  UNIQUE(batch_id, row_index)
);

CREATE TABLE file_import_candidate_details (
  candidate_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  target_account_id TEXT NOT NULL
    REFERENCES accounts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  normalized_payee TEXT,
  memo TEXT,
  source_date_text TEXT NOT NULL,
  date_precision TEXT NOT NULL CHECK(date_precision IN ('timestamp','day'))
);

CREATE TABLE external_candidate_match_links (
  candidate_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  ledger_event_id TEXT NOT NULL
    REFERENCES ledger_events(id) ON DELETE RESTRICT,
  matched_at TEXT NOT NULL,
  match_fingerprint TEXT NOT NULL
);

CREATE INDEX external_candidate_match_ledger_event_idx
  ON external_candidate_match_links(ledger_event_id);

CREATE TABLE file_import_balance_observation_details (
  observation_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_balance_observations(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL
    REFERENCES file_import_batches(id) ON DELETE CASCADE,
  balance_kind TEXT NOT NULL
    CHECK(balance_kind IN ('closing_ledger','closing_booked')),
  source_date_text TEXT NOT NULL,
  date_precision TEXT NOT NULL CHECK(date_precision IN ('timestamp','day')),
  statement_currency_code TEXT NOT NULL
);


---

# FILE: 07_V41_TO_V5_MIGRATION_PLAN_CN.md

# V4.1 → V5.0 Migration Plan

已发布 migrations 0000–0006 全部 frozen。V5 新增 migration，例如：

```text
0007_v5_financial_file_import
```

需要 generalize：

### external_connections.provider

```text
kraken | evm_wallet | file_import
```

file_import：

```text
source_key = file:<connectionId>
credential_ref = local:file-import
```

### external_source_objects.object_type

新增：

```text
file_transaction
```

### external_transaction_candidates.status

新增：

```text
matched
```

新增 V5 tables：
- file_import_profiles
- file_import_batches
- file_import_source_details
- file_import_batch_source_objects
- file_import_candidate_details
- external_candidate_match_links
- file_import_balance_observation_details

SQLite rebuild discipline：
1. `PRAGMA foreign_keys=OFF` outside tx；
2. `BEGIN IMMEDIATE`；
3. create target；
4. exact copy old rows；
5. row-count guard；
6. drop/rename/reindex；
7. create V5 tables；
8. COMMIT；
9. foreign_keys=ON；
10. `foreign_key_check=[]`。

必须 byte-for-byte preserving existing V1/V2/V3/V4/V4.1 business facts。
Migration 不生成任何 file-import backfill。


---

# FILE: 08_TYPES_SERVICE_CONTRACTS.ts

export type FileImportFormat = "csv" | "ofx" | "qfx" | "camt053";
export type FileImportIdentityStrength = "strong" | "weak";
export type FileImportDatePrecision = "timestamp" | "day";
export type FileImportDirection = "in" | "out";

export type CsvEncoding = "utf-8" | "windows-1252" | "gb18030";
export type CsvDelimiter = "," | ";" | "\t";
export type CsvDateFormat =
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "YYYYMMDD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD.MM.YYYY";

export type CsvAmountMode =
  | { kind: "signed"; amountColumn: string }
  | { kind: "debit_credit"; debitColumn: string; creditColumn: string };

export interface CsvImportConfig {
  hasHeader: boolean;
  encoding: CsvEncoding;
  delimiter: CsvDelimiter;
  dateColumn: string;
  dateFormat: CsvDateFormat;
  timeColumn: string | null;
  timeFormat: "HH:mm" | "HH:mm:ss" | null;
  amountMode: CsvAmountMode;
  decimalSeparator: "." | ",";
  thousandsSeparator: "," | "." | " " | null;
  invertSign: boolean;
  idColumn: string | null;
  payeeColumn: string | null;
  memoColumn: string | null;
  currencyColumn: string | null;
  timezone: string;
}

export interface StructuredImportConfig {
  timezoneForDateOnly: string;
}

export interface FileImportProfileDraft {
  bookId: string;
  targetAccountId: string;
  name: string;
  format: FileImportFormat;
  parserConfig: CsvImportConfig | StructuredImportConfig;
}

export interface ParsedStatementIdentity {
  accountFingerprint: string | null;
  accountLast4: string | null;
  currencyCode: string | null;
}

export interface ParsedFileTransaction {
  sourceExternalId: string;
  identityStrength: FileImportIdentityStrength;
  sourceIdKind:
    | "fitid"
    | "acct_svcr_ref"
    | "tx_id"
    | "ntry_ref"
    | "csv_id"
    | "weak_signature";
  occurredAt: string;
  originalDateText: string;
  datePrecision: FileImportDatePrecision;
  rawSignedAmountText: string;
  signedAtomic: bigint;
  currencyCode: string | null;
  payee: string | null;
  memo: string | null;
  rawSelectedFields: Readonly<Record<string, string | null>>;
  rawRowSha256: string;
  unsupportedReason: string | null;
}

export interface ParsedStatementBalance {
  kind: "closing_ledger" | "closing_booked";
  asOf: string;
  originalDateText: string;
  datePrecision: FileImportDatePrecision;
  currencyCode: string;
  rawSignedAmountText: string;
  signedAtomic: bigint;
}

export interface ParsedFileBatch {
  format: FileImportFormat;
  fileSha256: string;
  sanitizedFilename: string;
  statementIdentity: ParsedStatementIdentity;
  statementFromDate: string | null;
  statementToDate: string | null;
  transactions: ParsedFileTransaction[];
  closingBalance: ParsedStatementBalance | null;
}

export interface LedgerMatchSuggestion {
  ledgerEventId: string;
  score: number;
  reasons: string[];
}

export interface FileImportPreview {
  fatalErrors: string[];
  warnings: string[];
  parsed: ParsedFileBatch | null;
  alreadyKnownSourceIds: string[];
  matchSuggestions: Readonly<Record<string, LedgerMatchSuggestion[]>>;
}

export interface FileImportCommitResult {
  batchId: string;
  sourceRows: number;
  candidatesCreated: number;
  duplicates: number;
  unsupported: number;
  balanceObservationId: string | null;
}

export interface MatchExistingInput {
  candidateId: string;
  ledgerEventId: string;
  confirmed: true;
}


---

# FILE: 09_IMPORT_PIPELINE_CN.md

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


---

# FILE: 10_CSV_IMPORT_SPEC_CN.md

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


---

# FILE: 11_OFX_QFX_IMPORT_SPEC_CN.md

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


---

# FILE: 12_CAMT053_IMPORT_SPEC_CN.md

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


---

# FILE: 13_IDENTITY_DEDUPE_SPEC_CN.md

# Identity & Duplicate Detection

Tier 1 exact file：

```text
connectionId + fileSha256
```

Tier 2 strong transaction：
OFX FITID、safe CAMT ref、CSV explicit ID。

Tier 3 weak：
date + signed amount + payee + memo + occurrence ordinal。

Persist `identity_strength=weak`，UI 可提示。

Candidate stable key：

```text
file:<sourceExternalId>
```

10 次 reimport：
source/candidate/link/Ledger counts stable。

Same strong source ID payload change：
- unresolved candidate 可 refresh；
- imported/matched candidate → source_changed；
- Ledger unchanged。


---

# FILE: 14_LEDGER_MATCHING_SPEC_CN.md

# Existing Ledger Matching

目标：避免 manual transaction + later bank import 形成 duplicate Ledger event。

Suggestion required：

```text
same target account entry
exact same signed atomic amount
```

初始 date window：

```text
source local date ±3 calendar days
```

deterministic score（非金额，可用 integer）：

```text
same date +5000
±1 +4000
±2 +3000
±3 +2000
payee exact +4000
contains +2500
memo exact +1000
cap 10000
```

V5.0 无论分数多高都不 auto-match。

Explicit Match server invariant：
- candidate pending/needs_mapping；
- provider=file_import；
- selected event same book；
- selected event 存在 target account exact signed atomic entry；
- no import/match link；
- confirmed=true。

Date 只影响 suggestion，不是 hard invariant。

Match action 单 transaction：

```text
insert external_candidate_match_links
update candidate status=matched
```

不 UPDATE Ledger。

V5.0 不自动覆盖 Ledger date/payee。
差异显示给用户，用户另行 explicit edit。

`match_fingerprint` 绑定 candidateId/ledgerEventId/sourceFingerprint/matchedAt。

Matched provenance 与后续 Ledger edit/delete：
推荐 server-side block incompatible edit/delete，直到 user explicit unlink，
避免 Backup provenance 静默失效。


---

# FILE: 15_STATEMENT_BALANCE_RECONCILIATION_CN.md

# Statement Balance → Reconciliation

支持：
OFX/QFX `LEDGERBAL`；
CAMT `CLBD closing booked balance`；
CSV 无 generic balance。

创建 `external_balance_observations`
+ `file_import_balance_observation_details`。

Exact timestamp 用 source instant。
Date-only 用 profile local date noon，并 UI 明确 “source provided date only”。

比较：

```text
queryBalanceAt(targetAccount, observation.asOf)
vs
statement observed amount
```

No valuation/cross-asset conversion。

只有 explicit Reconcile 才走 existing V1 snapshot writer。
Statement import 本身绝不创建 snapshot。


---

# FILE: 16_SECURITY_PRIVACY_SPEC_CN.md

# V5.0 Security & Privacy

Treat CSV/XML/OFX as hostile input.

Hard limits：

```text
20 MiB
100000 transaction rows
10000 chars per selected text field
bounded nesting
```

不保存 file blob/full raw XML/full raw CSV line with unselected columns。

Bank account PII：
不保存 raw full IBAN/account/card account number；
只保存 SHA-256 fingerprint + last4。

XML：
在 parser 前拒绝 `DOCTYPE` / `ENTITY`；
no external entity resolution；
no network。
若使用 fast-xml-parser，pin audited version + strict limits。

CSV text render 依赖 React escaping，禁止 raw HTML injection。

Upload only same-origin POST。
V5.0 不支持 import from URL。

Filename：
basename only；strip control chars/NUL；不得作为 filesystem path。

Default bounded memory parse。
若用 temp file：
server temp only、random path、finally delete、tests prove cleanup。

Client bundle 不得包含 server parser/bank internals beyond explicit preview DTO。

Security static checks应覆盖：
- importer 内无 fetch/HTTP；
- raw blob schema column；
- arbitrary path/url ingestion；
- account raw ID persistence；
- XML security precheck存在。


---

# FILE: 17_BACKUP_SCHEMA_V6_CN.md

# Backup schemaVersion 6

Product release = Talli V5.0；
Backup wire = schemaVersion 6。

Export 6，Accept 1/2/3/4/5/6。

新增 include：

```text
fileImportProfiles
fileImportBatches
fileImportSourceDetails
fileImportBatchSourceObjects
fileImportCandidateDetails
externalCandidateMatchLinks
fileImportBalanceObservationDetails
```

Existing union扩展：
- externalConnections.provider=file_import
- externalSourceObjects.objectType=file_transaction
- candidate.status=matched

Exclude：
raw file bytes、preview/temp/cache/local paths、full bank account number、
existing operational state/secrets。

Old schemaVersion5→6：
new arrays=[]，old IDs/facts exact preserve。

Validation：

Profile：
- connection provider=file_import
- credentialRef=local:file-import
- sourceKey=file:<connectionId>
- target account same book
- parser config format-compatible

Batch：
valid SHA/counts/profile relation；no raw blob fields。

Source：
file_transaction + source detail + batch link + payload hash。

Candidate：
file detail/profile/target account consistent；
stable key uses source external id；
direction/leg sign consistent。

Resolution：

```text
imported → import link yes / match link no
matched → match link yes / import link no
source_changed → exactly one provenance kind
other → neither
```

Match provenance edit/delete policy必须 server-side consistent。
推荐：会导致 matched target-account exact amount 失效的 Ledger edit/delete
必须先 explicit unlink match。

Restore：
full prevalidation → one BEGIN IMMEDIATE → FK check → any failure rollback all。


---

# FILE: 18_UI_UX_SPEC_CN.md

# V5.0 UI / UX

Add top-level `Import`，Account detail 增加 `Import statement`。

Import landing：
- Import Profiles
- Recent batches
- Supported formats

Profile card：
target account、format、last ingest、structured account `••••1234`。

Flow：

## Step 1
Choose target account + format/auto-detect + upload。

## Step 2 Preview

Structured：
format、masked statement account、currency、period、rows、closing balance。

CSV：
encoding/delimiter/header/date/amount/payee/memo/currency/ID mapping，
preview first 20 rows。

## Step 3 Duplicate/Match

每行：

```text
New
Already imported
Possible Ledger match
Unsupported
Invalid
```

Possible match并列展示 imported vs existing Ledger。

Parse/ingest阶段 button 必须叫：

```text
Create review candidates
```

不能叫 “Import to Ledger”。

Review candidate展示：
source format/file、identity strength、account/date/payee/memo/amount。

Out actions：
Expense / Transfer / Match Existing / Ignore。

In actions：
Income / Transfer / Match Existing / Ignore。

Statement balance：
Observed / Talli Ledger / Difference / Reconcile。

Batch summary：
rows / already known / possible matches / new / unsupported。

Mobile：
CSV mapping/preview cards or scroll containers，关键路径 WebKit 无 overflow。


---

# FILE: 19_TEST_ACCEPTANCE_CN.md

# V5.0 Acceptance Matrix

## Frozen regression
V1/V2/V3/V4/V4.1 all PASS。

## Migration
0000–0006 untouched；
V4.1→V5 all IDs/facts preserve；
provider/source/status CHECK generalization；
repeat startup stable；
FK check empty。

## CSV
UTF-8 BOM / Windows-1252 / GB18030；
comma/semicolon/tab；
signed + debit-credit；
invalid both columns；
decimal dot/comma/thousands；
excess precision reject；
all strict date formats；
date-only noon+precision；
optional time；
explicit ID strong；
no ID weak ordinal；
identical repeated rows preserved；
mixed currency reject；
malformed row blocks commit。

## OFX/QFX
OFX1 SGML；
OFX2 XML；
QFX extension；
credit card；
FITID strong/reimport；
changed strong payload source_changed；
account fingerprint/mismatch；
CURDEF mismatch；
LEDGERBAL observation；
unsupported investment statement；
malformed fail。

## CAMT.053
representative .02/.08/.13/.14；
CRDT/DBIT sign；
date/dateTime；
account fingerprint；
safe refs；
NOTPROVIDED weak；
CLBD；
multi-TxDtls unsupported；
currency mismatch；
unknown future namespace unsupported；
DOCTYPE/ENTITY reject。

## Atomicity
preview zero DB write；
commit parse error zero write；
late persistence failure whole batch rollback；
no parsing/HTTP inside tx。

## Duplicate
exact file hash；
strong identity across different files；
weak reimport；
10 reimports no Ledger duplicates。

## Match
same amount/date/payee suggestion；
no auto match；
explicit match no new Ledger event；
target account exact signed amount required；
transfer/exchange can match account leg；
wrong amount/book reject；
matched cannot import again；
matched source change→source_changed；
edit/delete invalidation policy tested。

## Import
out expense|transfer；
in income|transfer；
confirmed；
same V1 writer；
payee/memo default；
atomic provenance；
reimport no duplicate。

## Reconcile
OFX ledger / CAMT CLBD；
import no snapshot；
explicit reconcile snapshot only；
no income/expense side effect。

## Backup 6
export 6；
restore 1..6；
all file/match facts roundtrip；
no raw blob/full account number；
relation validation；
late failure rollback。

## Security
>20MiB；
>100000 rows；
>10k field；
DOCTYPE/ENTITY；
path traversal filename；
no HTTP importer；
no parser client bundle；
no raw account id persistence。

## E2E desktop/mobile
CSV profile/upload/mapping/preview/candidates；
one manual match；
one expense import；
same file reupload no duplicate；
OFX closing balance；
explicit reconcile；
backup schema6；
mobile critical path。

Final commands：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e
```


---

# FILE: 20_IMPLEMENTATION_PLAN_CN.md

# V5.0 Implementation Plan

Phase 0 baseline；
Phase 1 domain/provider/status/date precision；
Phase 2 forward migration；
Phase 3 bounded parser framework/sniff/hash/sanitize；
Phase 4 CSV；
Phase 5 OFX/QFX；
Phase 6 CAMT.053；
Phase 7 preview/full-reparse commit；
Phase 8 duplicate + explicit match；
Phase 9 file candidate Import；
Phase 10 statement balance observation/reconcile；
Phase 11 Backup schemaVersion6；
Phase 12 UI/mobile；
Phase 13 security/E2E/all regressions；
Phase 14 final audit delivery。

Final report：
exact SHA、Actions run、changed files、migration、parser dependency/version、
unit/integration/E2E counts、known limitations。

No merge/tag。


---

# FILE: 21_NON_GOALS_AND_NEXT_VERSIONS_CN.md

# Non-goals & Next Versions

Not V5.0：
direct bank API/Open Banking/Plaid/SimpleFIN/GoCardless、Rules、Recurring、
historical prices/net worth、QIF/MT940/PDF OCR、investment OFX、
multi-account auto routing、automatic transfer pairing。

## V5.1 — Rules & Recurring Automation

V5.0 file candidates 是第一主要 consumer。
Rules 对 unresolved candidate metadata 做 classify/annotate，默认不 auto-post。
Recurring 是 planned/expected fact，不是 Ledger event。

## Possible V5.2 — Direct Bank Sync Adapters

只有 duplicate/match foundation proven 且 region/provider/auth model 明确后再做。

## V6.0 — Historical Net Worth & Analytics

Separate historical quote time series + daily valuation + allocation/cash-flow analytics。


---

# FILE: 22_FIXTURE_EXPECTATIONS.json

{
  "version": 1,
  "baselineSha": "ef968976510e04f0532715c1e73f88595a607e89",
  "csv": {
    "rows": 4,
    "transactions": [
      {
        "id": "csv-001",
        "date": "2026-08-10",
        "amount": "-35.00",
        "currency": "CNY",
        "atomicScale2": "-3500"
      },
      {
        "id": "csv-002",
        "date": "2026-08-11",
        "amount": "20000.00",
        "currency": "CNY",
        "atomicScale2": "2000000"
      },
      {
        "id": null,
        "date": "2026-08-12",
        "amount": "-120.50",
        "currency": "CNY",
        "atomicScale2": "-12050"
      },
      {
        "id": null,
        "date": "2026-08-12",
        "amount": "-120.50",
        "currency": "CNY",
        "atomicScale2": "-12050"
      }
    ],
    "weakDuplicateRowsMustRemainTwo": true
  },
  "ofx1": {
    "accountLast4": "6789",
    "currency": "USD",
    "fitids": [
      "OFX-1001",
      "OFX-1002"
    ],
    "closingBalance": "1465.25"
  },
  "ofx2": {
    "accountLast4": "6789",
    "currency": "USD",
    "fitids": [
      "OFX2-2001"
    ],
    "closingBalance": "1425.25"
  },
  "camt053": {
    "namespace": "urn:iso:std:iso:20022:tech:xsd:camt.053.001.14",
    "accountLast4": "3000",
    "currency": "EUR",
    "entryRefs": [
      "ASR-3001",
      "ASR-3002"
    ],
    "signedAmounts": [
      "-42.50",
      "1200.00"
    ],
    "closingBookedBalance": "5157.50"
  }
}


---

# FILE: 23_EXTERNAL_REFERENCE_SNAPSHOT_20260813_CN.md

# External Reference Snapshot — 2026-08-13

Implementation should re-check first-party sources if current behavior changes.

## OFX
Financial Data Exchange OFX Work Group：
当前 OFX Banking 2.3；OFX 2.x XML；OFX 1.6 是最后 SGML-era spec。
https://financialdataexchange.org/about-fdx/ofx-work-group/

## ISO 20022
Current catalogue包含 `camt.053.001.14 BankToCustomerStatementV14`，
历史 versions 在 official archive。
https://www.iso20022.org/iso-20022-message-definitions?search=camt.053
https://www.iso20022.org/catalogue-messages/iso-20022-messages-archive

## Actual Budget
支持 CSV/QIF/OFX/QFX/CAMT；
duplicate strategy先 strong imported ID，再 date/amount/payee similarity，可匹配 manual tx。
https://actualbudget.org/docs/transactions/importing/

Talli V5.0 intentional difference：
never auto-match / never auto-edit existing Ledger。

## Firefly III
Data Importer 支持 reusable CSV config、CAMT.053、mapping/duplicate workflows。
https://docs.firefly-iii.org/how-to/data-importer/import/csv/
https://docs.firefly-iii.org/how-to/data-importer/advanced/cli/

## XML parser
截至 reference date `fast-xml-parser 5.10.1` current；
上游 2026 有多次 entity/DOCTYPE advisories，故 Talli 仍 pre-reject DTD/ENTITY。
https://www.npmjs.com/package/fast-xml-parser
https://github.com/NaturalIntelligence/fast-xml-parser/security


---

# FILE: 24_RISK_REGISTER_CN.md

# V5.0 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| file直接写Ledger | Critical | candidate-first + explicit Import |
| manual tx重复 | High | strong dedupe + explicit match |
| auto-match错 | Critical | V5.0 never auto-match |
| wrong account file | High | fingerprint + explicit profile |
| currency mismatch | High | explicit mapping + fail closed |
| precision rounding | Critical | exact parser + reject excess |
| CSV locale ambiguity | High | explicit separators/date |
| identical weak rows collapse | High | occurrence ordinal |
| strong source changes | High | source_changed |
| CAMT aggregate误拆 | Critical | unsupported unless provable |
| XML entity/DOCTYPE DoS | Critical | pre-reject + limits |
| raw bank file leak | High | no blob persistence |
| account number leak | High | hash + last4 |
| partial batch | High | parse outside tx + atomic commit |
| matched provenance edit drift | High | block/unlink incompatible edit |
| V3/V4 regress | Critical | full regression |


---

# FILE: 25_FINAL_AUDIT_CHECKLIST_CN.md

# V5.0 Independent Final Audit Checklist

Repository `wentAInx/Talli`  
Baseline `ef968976510e04f0532715c1e73f88595a607e89`  
Feature `feat/v5-financial-file-import`

Audit：
- descendant of v4.1.0；
- old migrations untouched；
- parser limits/DTD/ENTITY/no HTTP/no raw blob/PII；
- exact CSV/OFX/CAMT bigint amounts；
- FITID/CAMT refs/CSV ID/weak ordinals；
- no auto-match；
- explicit match exact target-account signed amount；
- match does not mutate Ledger；
- file commit no Ledger；
- explicit Import same V1 writer；
- statement balance observation + explicit snapshot reconcile；
- Backup schemaVersion6 / restore 1..6 / privacy / rollback；
- V1/V2/V3/V4/V4.1 regressions；
- desktop/mobile；
- exact SHA CI.

Verdict：

```text
Critical
High
Medium blocking
Low

Architecture
Parser correctness
Duplicate/match
Ledger isolation
Backup
Security
CI

GO / NO-GO
```


---

# FILE: CODEX_HANDOFF_PROMPT.txt

你现在负责 Talli V5.0。

Repository:
wentAInx/Talli

Frozen baseline:
v4.1.0
ef968976510e04f0532715c1e73f88595a607e89

Main release CI:
31700359476

目标：
Talli V5.0 — Financial File Import & Matching Foundation

推荐分支：
feat/v5-financial-file-import

首批格式：
CSV
OFX/QFX Banking/CreditCard statement subset
ISO 20022 camt.053

请先完整阅读任务包 00 → 25 与 fixtures。

最高红线：
Imported file != Ledger

文件 commit 只能创建 source / batch / candidate / observation / provenance，
不得直接创建 Ledger event/snapshot。

只有 Explicit Import / Explicit Match Existing / Explicit Reconcile
才可进入相应写路径。

关键：
- Account-first explicit profile；
- no asset auto-map by symbol；
- exact amounts/no rounding；
- strong+weak dedupe；
- identical weak rows not collapsed；
- no automatic Ledger match；
- Match Existing does not edit Ledger；
- OFX LEDGERBAL / CAMT CLBD observation only；
- raw file/full account number not persisted；
- DTD/ENTITY rejected；
- parse outside DB tx；
- atomic batch；
- Backup schemaVersion6 accepts 1..6；
- all V1/V2/V3/V4/V4.1 regressions pass。

开始前：
git status --short
git branch --show-current
git rev-parse HEAD
git tag --points-at HEAD

按 Phase 0→14 实施。

Final gate：
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e

不得伪造结果。
完成后 push feature branch（用户要求时），不要 merge main/tag v5.0.0。

返回：
exact SHA
Actions run ID
migration
parser dependency/version
unit/integration/E2E counts
known limitations
