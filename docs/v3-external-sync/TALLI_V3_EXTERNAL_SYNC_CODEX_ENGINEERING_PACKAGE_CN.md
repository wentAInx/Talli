# TALLI V3 EXTERNAL SYNC — COMBINED CODEX ENGINEERING PACKAGE

Repository: `wentAInx/Talli`

Frozen V2 baseline: `ad0de1d26d060fd391449f869a5c99a36f1901ed`

Generated: 2026-08-11


---

# FILE: 00_README_CN.md

# Talli V3 External Sync Codex 工程任务包

Repository: `wentAInx/Talli`

Frozen V2 engineering baseline:

```text
ad0de1d26d060fd391449f869a5c99a36f1901ed
```

该 baseline 对应 GitHub Actions run `31470971297`，Quality & Build 与 Playwright E2E 均通过。

## V3 正式范围

> **Talli V3 — External Sync Foundation & Kraken Read-only Integration**

本任务包包含：

1. **V3.0 External Sync Foundation**
2. **V3.1 Kraken Spot Read-only Sync**
3. **V3.2 Review & Import Foundation**

不包含：

- Kraken Futures
- 钱包链上同步
- Coinbase/Binance/OKX
- WebSocket
- 定时 cron
- 自动导入
- 自动余额调整
- 交易/提现 API
- V2.1 历史净资产
- tax / cost basis / P&L
- OCR / AI

## 最高优先级原则

```text
V1 Ledger       = 用户确认后的财务事实
V2 Valuation    = 派生市场估值
V3 External Sync= 外部观测与待确认候选
```

必须保持：

```text
External API != Ledger
```

禁止：

```text
Kraken API -> 直接 UPDATE account balance
Kraken API -> 直接 INSERT ledger_entries
```

正确路径：

```text
Kraken
  ↓
Source Object / Balance Observation / Candidate
  ↓
用户 Review
  ↓
已有 V1 invariant + writer
```

余额也只能：

```text
External Observation
  ↓
显示差异
  ↓
用户明确确认
  ↓
ReconciliationService -> snapshot
```

## 开工前 release preflight

推荐先使：

```text
main
feat/v2-valuation
v2.0.0
```

都指向 `ad0de1d26d060fd391449f869a5c99a36f1901ed`，或仅包含 release metadata 的明确 descendant。

若当前 repo 不满足，不得擅自 reset/rebase/force push；先报告。

## 阅读顺序

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md`
3. `03_EXTERNAL_SYNC_DOMAIN_SPEC_CN.md`
4. `04_DATABASE_SCHEMA_V3_DRAFT.sql`
5. `05_TYPES_AND_SERVICE_CONTRACTS.ts`
6. `06_KRAKEN_PROVIDER_IMPLEMENTATION_SPEC_CN.md`
7. `07_SYNC_IDEMPOTENCY_STATE_MACHINE_CN.md`
8. `08_CREDENTIALS_SECURITY_SPEC_CN.md`
9. `09_CANDIDATE_NORMALIZATION_IMPORT_SPEC_CN.md`
10. `10_BACKUP_V3_MIGRATION_SPEC_CN.md`
11. `11_UI_UX_SPEC_CN.md`
12. `12_TEST_ACCEPTANCE_CN.md`
13. `13_IMPLEMENTATION_PLAN_CN.md`
14. `14_NON_GOALS_AND_FUTURE_BOUNDARY_CN.md`
15. `15_KRAKEN_FIXTURES.json`
16. `16_EXTERNAL_API_REFERENCE_20260811_CN.md`
17. `CODEX_HANDOFF_PROMPT.txt`


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

# Codex Master Instruction — Talli V3

## Baseline

Repository:

```text
wentAInx/Talli
```

Frozen V2 baseline:

```text
ad0de1d26d060fd391449f869a5c99a36f1901ed
```

开工前：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -8
```

若 HEAD 不是 baseline 或用户明确批准的 descendant：

- 不 reset
- 不 rebase
- 不 force push
- 先报告差异

推荐创建：

```text
feat/v3-external-sync
```

## V1/V2 frozen semantics

V3 不得改变：

- monetary atomic integer TEXT + bigint
- Account 单一 asset
- Transfer 同资产本金
- Exchange 跨资产真实数量
- fee 独立 entry，可第三资产
- snapshot 强锚点
- balance = latest snapshot + `(snapshot.asOf, queryTime]`
- reports 排除 transfer/exchange principal
- V2 quote/valuation 不修改 Ledger
- USDT/USDC 不固定等于 USD
- V2 cache derived-only

允许为了 **V3 原子导入** 做最小内部重构，但必须：

- 公共行为不变
- 所有 V1/V2 regression tests 继续 PASS
- 不复制 Ledger invariants
- 不建立“同步专用绕过通道”

## 外部同步硬红线

1. Provider HTTP 永远在 SQLite write transaction 外。
2. Sync 只能先写 V3 observation/source/candidate。
3. 外部余额变化绝不自动创建 snapshot。
4. 外部交易绝不自动创建 ledger event。
5. 只有用户明确点击 Import/Reconcile 后才可写 V1 Ledger。
6. re-sync 同一 external ID 不得重复 candidate。
7. imported candidate re-sync 不得重复入账。
8. provider source 改变后不得自动修改已导入 Ledger。
9. API key/secret 不得进入 SQLite、backup、client、HTML、logs、source JSON。
10. Kraken client 不得实现交易/提现/资金写 API。

## Kraken P0 endpoints

仅 Spot REST：

```text
/private/GetApiKeyInfo
/private/Balance
/private/Ledgers
/private/TradesHistory
/public/Assets?assetVersion=1
/public/AssetPairs?assetVersion=1
```

默认自动测试禁止真实 Kraken，使用 injectable transport + deterministic fixtures。

## Release gate

最终必须真实运行：

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

并要求 GitHub Actions exact final SHA：

```text
Quality & Build = success
Playwright E2E = success
```


---

# FILE: 02_PRODUCT_AND_ENGINEERING_BRIEF_CN.md

# Product & Engineering Brief

## 用户目标

V3 让用户无需手工比对 Kraken：

- 自动读取资产余额；
- 自动读取 Ledger/Trade history；
- 显示 Talli Ledger 与 Kraken observation 的差异；
- 生成待审核交易候选；
- 用户明确确认后才导入 Ledger。

## P0

- generic external connection model
- one Kraken Spot credential slot
- permission validation
- server-only auth/signing
- asset metadata normalization
- Balance sync
- Ledgers pagination
- TradesHistory pagination
- source object persistence
- balance observations
- asset/account mappings
- deterministic candidate normalization
- idempotency
- candidate queue/review/ignore/import
- explicit balance reconciliation
- V3 backup schemaVersion 3
- V1/V2 backup backward compatibility
- responsive UI
- unit/integration/E2E/CI

## P1

- candidate filters
- sync run detail
- raw sanitized source JSON viewer
- order-level display grouping of multiple fills
- source-changed-after-import warning UX

P1 不得压过 P0。

## 成功标准

V3 成功不是“Kraken API 能通”，而是：

```text
外部数据可重复抓取
    ↓
稳定去重、可追溯
    ↓
用户能审核
    ↓
确认后才进入 V1 Ledger
```

删除全部 V3 observation/candidate 数据后：

```text
V1 balance
V2 valuation
```

仍保持原语义。


---

# FILE: 03_EXTERNAL_SYNC_DOMAIN_SPEC_CN.md

# External Sync Domain Spec

## 1. Source Object

保存 provider 的外部对象：

```text
kraken_ledger
kraken_trade
```

唯一：

```text
(connection_id, object_type, external_id)
```

包含：

- occurredAt
- sanitized payload JSON
- payload hash
- firstSeenAt
- lastSeenAt

Source Object 不是 Ledger Event。

## 2. Balance Observation

一次 sync 的 asset balance observation。

保存：

- raw provider asset key
- provider amount decimal text
- observedAt
- optional mapped Talli asset
- optional exact atomic amount
- precision status

Observation 不是 snapshot。

## 3. Transaction Candidate

一个或多个 Source Object 归一化出的待审核财务事件。

状态：

```text
pending
needs_mapping
ignored
imported
unsupported
source_changed
```

Candidate 不是 Ledger Event。

## 4. Connection

V3.1 一个 credential slot：

```text
env:kraken.primary
```

SQLite 只保存 opaque credential_ref，不保存 key/secret。

## 5. Asset identity

Kraken private APIs 可能返回：

```text
XXBT
ZUSD
USDT
USD.M
USDT.F
```

禁止直接：

```text
strip leading X/Z
```

主路径必须使用 Kraken Assets metadata 建立 raw→display identity。

对于：

```text
.B .F .M .S .T
```

保留 raw identity。可建议映射到 base asset，但不得静默合并。

## 6. Account mapping

最小 external account identity：

```text
connection + providerAssetKey
```

映射到一个 Talli account。

必须验证：

- Talli account active
- account.assetId == mapped asset
- 一个 Talli account 在 V3.1 不可被多个 external mapping 同时占用

## 7. Balance difference

```text
external = observation exact mapped amount
ledger = balanceAt(account, observation.observedAt)
difference = external - ledger
```

同一 native asset 内计算，不使用 V2 price。

若 provider decimal 超过 Talli scale：

```text
precision_status = excess_precision
mapped_amount_atomic = null
```

禁止 silent rounding。

## 8. Reconciliation

用户点击“调整为外部余额”并二次确认后：

- 重新读取 observation/mapping/current balance
- 调用现有 ReconciliationService/writer
- 创建 snapshot
- 不创建 income/expense

## 9. Idempotency keys

Trade fill：

```text
kraken:trade:<trade-id>
```

Non-trade ledger：

```text
kraken:ledger:<ledger-id>
```

不得用 timestamp/amount/random UUID 当业务稳定键。

## 10. Trade authority

TradesHistory 是 spot trade candidate 的 primary source。

Ledgers 中 `type=trade`：

- 保存 source object
- 用于 fee/balance cross-check
- 只有明确 provider identifier 对应时 link
- 不额外生成第二个 trade candidate

禁止用“时间很近 + 金额类似”猜关系并直接写账。

## 11. Deposit / withdrawal

Kraken ledger type 只给 suggestion。

例如 deposit 可以由用户最终选择：

- Transfer（来自另一个 Talli account）
- Income（确实是收入，用户明确选择）
- Ignore

不得自动把 deposit=income、withdrawal=expense。

## 12. Imported candidate

一旦 imported：

- candidate_id import link UNIQUE
- ledger_event_id UNIQUE
- re-sync 不重复入账
- source 改变只 warning，不 mutate ledger


---

# FILE: 04_DATABASE_SCHEMA_V3_DRAFT.sql

CREATE TABLE external_connections (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('kraken')),
  name TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(book_id, provider, credential_ref)
);

CREATE TABLE external_connection_state (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  cooldown_until TEXT,
  last_nonce_text TEXT NOT NULL DEFAULT '0',
  last_ledger_sync_at TEXT,
  last_trade_sync_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE external_asset_mappings (
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  provider_asset_key TEXT NOT NULL,
  provider_display_code TEXT,
  talli_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  mapping_status TEXT NOT NULL DEFAULT 'unmapped'
    CHECK (mapping_status IN ('mapped','unmapped','ignored')),
  provider_metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(connection_id, provider_asset_key)
);

CREATE INDEX external_asset_mappings_talli_asset_idx
  ON external_asset_mappings(talli_asset_id);

CREATE TABLE external_account_mappings (
  connection_id TEXT NOT NULL,
  provider_asset_key TEXT NOT NULL,
  talli_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(connection_id, provider_asset_key),
  FOREIGN KEY(connection_id, provider_asset_key)
    REFERENCES external_asset_mappings(connection_id, provider_asset_key)
    ON DELETE CASCADE,
  UNIQUE(talli_account_id)
);

CREATE TABLE external_sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','success','partial','error')),
  balances_seen INTEGER NOT NULL DEFAULT 0,
  source_objects_seen INTEGER NOT NULL DEFAULT 0,
  candidates_created INTEGER NOT NULL DEFAULT 0,
  candidates_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX external_sync_runs_connection_started_idx
  ON external_sync_runs(connection_id, started_at DESC);

CREATE TABLE external_source_objects (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('kraken_ledger','kraken_trade')),
  external_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(connection_id, object_type, external_id)
);

CREATE INDEX external_source_objects_time_idx
  ON external_source_objects(connection_id, occurred_at DESC);

CREATE TABLE external_balance_observations (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  provider_asset_key TEXT NOT NULL,
  talli_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  provider_amount_text TEXT NOT NULL,
  mapped_amount_atomic TEXT,
  precision_status TEXT NOT NULL
    CHECK (precision_status IN ('exact','excess_precision','unmapped')),
  observed_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(connection_id, provider_asset_key)
    REFERENCES external_asset_mappings(connection_id, provider_asset_key)
    ON DELETE RESTRICT
);

CREATE INDEX external_balance_latest_idx
  ON external_balance_observations(connection_id, provider_asset_key, observed_at DESC);

CREATE TABLE external_transaction_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  suggested_event_type TEXT NOT NULL
    CHECK (suggested_event_type IN ('exchange','transfer','income','expense','unknown')),
  status TEXT NOT NULL
    CHECK (status IN ('pending','needs_mapping','ignored','imported','unsupported','source_changed')),
  occurred_at TEXT NOT NULL,
  title TEXT NOT NULL,
  normalization_version INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(connection_id, stable_key)
);

CREATE INDEX external_candidates_status_time_idx
  ON external_transaction_candidates(connection_id, status, occurred_at DESC);

CREATE TABLE external_candidate_source_objects (
  candidate_id TEXT NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  source_object_id TEXT NOT NULL REFERENCES external_source_objects(id) ON DELETE RESTRICT,
  relation TEXT NOT NULL CHECK (relation IN ('primary','cross_check')),
  PRIMARY KEY(candidate_id, source_object_id)
);

CREATE TABLE external_transaction_legs (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  leg_index INTEGER NOT NULL CHECK (leg_index >= 0),
  role TEXT NOT NULL
    CHECK (role IN ('source','destination','fee','external_in','external_out','unknown')),
  provider_asset_key TEXT NOT NULL,
  talli_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  amount_text TEXT NOT NULL,
  amount_atomic TEXT,
  precision_status TEXT NOT NULL
    CHECK (precision_status IN ('exact','excess_precision','unmapped')),
  note TEXT,
  UNIQUE(candidate_id, leg_index)
);

CREATE TABLE external_import_links (
  candidate_id TEXT PRIMARY KEY NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE RESTRICT,
  ledger_event_id TEXT NOT NULL UNIQUE REFERENCES ledger_events(id) ON DELETE RESTRICT,
  imported_at TEXT NOT NULL,
  import_fingerprint TEXT NOT NULL
);


---

# FILE: 05_TYPES_AND_SERVICE_CONTRACTS.ts

export type ExternalProviderId = "kraken";

export type ExternalCandidateStatus =
  | "pending"
  | "needs_mapping"
  | "ignored"
  | "imported"
  | "unsupported"
  | "source_changed";

export interface ExternalConnectionView {
  id: string;
  bookId: string;
  provider: ExternalProviderId;
  name: string;
  credentialRef: string; // Opaque only.
  isEnabled: boolean;
}

export interface ExternalBalanceRecord {
  providerAssetKey: string;
  amountText: string; // Exact plain decimal string.
}

export interface ExternalSourceObject {
  objectType: "kraken_ledger" | "kraken_trade";
  externalId: string;
  occurredAt: string;
  payloadJson: string;
  payloadHash: string;
}

export interface CandidateLegDraft {
  role: "source" | "destination" | "fee" | "external_in" | "external_out" | "unknown";
  providerAssetKey: string;
  amountText: string;
  note?: string | null;
}

export interface ExternalCandidateDraft {
  stableKey: string;
  suggestedEventType: "exchange" | "transfer" | "income" | "expense" | "unknown";
  occurredAt: string;
  title: string;
  normalizationVersion: number;
  sourceFingerprint: string;
  primarySourceExternalIds: string[];
  crossCheckSourceExternalIds: string[];
  legs: CandidateLegDraft[];
}

export interface KrakenPermissionCheck {
  ok: boolean;
  permissions: string[];
  missingRequired: string[];
  forbiddenWritePermissions: string[];
  extraReadOnlyPermissions: string[];
}

export interface KrakenReferenceData {
  assets: Record<string, unknown>;
  assetPairs: Record<string, unknown>;
}

export interface KrakenSyncSnapshot {
  fetchedAt: string;
  permissions: KrakenPermissionCheck;
  referenceData: KrakenReferenceData;
  balances: ExternalBalanceRecord[];
  ledgers: ExternalSourceObject[];
  trades: ExternalSourceObject[];
}

export interface KrakenHttpTransport {
  request(input: {
    method: "GET" | "POST";
    url: URL;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; headers: Headers; text: string }>;
}

export interface KrakenReadOnlyProvider {
  validateCredentials(): Promise<KrakenPermissionCheck>;
  fetchSnapshot(input: {
    sinceLedger?: string | null;
    sinceTrade?: string | null;
  }): Promise<KrakenSyncSnapshot>;
}

export interface ExternalSyncService {
  syncNow(connectionId: string): Promise<{
    runId: string;
    balancesSeen: number;
    sourceObjectsSeen: number;
    candidatesCreated: number;
    candidatesUpdated: number;
  }>;
}

export interface CandidateImportInput {
  candidateId: string;
  chosenEventType: "expense" | "income" | "transfer" | "exchange";
  sourceAccountId?: string;
  destinationAccountId?: string;
  mainAccountId?: string;
  feeAccountId?: string | null;
  categoryId?: string | null;
  note?: string | null;
}

export interface ExternalImportService {
  importCandidate(input: CandidateImportInput): Promise<{
    candidateId: string;
    ledgerEventId: string;
  }>;
  ignoreCandidate(candidateId: string): Promise<void>;
}

export interface ExternalReconciliationService {
  reconcileObservation(input: {
    observationId: string;
    accountId: string;
    confirmed: true;
    note?: string | null;
  }): Promise<void>;
}

/*
Atomic import requirement:

ExternalImportService must be able to open one BEGIN IMMEDIATE transaction,
lock/revalidate the candidate, call the SAME executor-scoped V1 invariant/writer
used by normal commands, create external_import_link, and mark imported.

Do not duplicate Ledger invariants and do not directly insert ledger_entries
from a V3-specific bypass.
*/


---

# FILE: 06_KRAKEN_PROVIDER_IMPLEMENTATION_SPEC_CN.md

# Kraken Spot Read-only Provider Spec

## 1. Files

推荐：

```text
src/providers/kraken/
  auth.ts
  nonce.ts
  client.ts
  normalize.ts
  errors.ts
  types.ts
```

Provider 不直接写 Ledger。

## 2. Credentials

V3.1：

```text
KRAKEN_API_KEY
KRAKEN_API_SECRET
```

仅 server env。

Credential ref：

```text
env:kraken.primary
```

不做 DB secret storage，不做 UI 输入 secret。

## 3. Permission gate

先调用：

```text
POST /0/private/GetApiKeyInfo
```

required：

```text
query-funds
query-ledger
query-closed-trades
```

缺失任何 required → refuse sync。

已知 write-capable deny list：

```text
add-funds
withdraw-funds
earn-funds
modify-trades
close-trades
add-withdraw-address
update-withdraw-address
```

发现任一 → `KRAKEN_WRITE_PERMISSION_FORBIDDEN`，拒绝 sync。

额外只读 permission 可提示但无需拒绝。

## 4. API-key 2FA

V3.1 不管理 rotating OTP。

如果 dedicated API key 要求 OTP：

```text
KRAKEN_API_2FA_UNSUPPORTED
```

要求用户重新创建专用只读 key。

## 5. Authentication

按 Kraken Spot REST：

```text
API-Sign =
base64(
  HMAC-SHA512(
    base64Decode(secret),
    URI_PATH + SHA256(nonce + POST_DATA)
  )
)
```

URI path 从 `/0/private` 开始。

## 6. Nonce

Nonce 必须单调递增。

实现：

```text
KrakenNonceService.next(connectionId)
```

短 `BEGIN IMMEDIATE`：

1. read last_nonce_text
2. nowMs as bigint
3. next = max(nowMs, previous+1)
4. persist TEXT
5. commit
6. return string

同 connection private calls 还应 process-local 串行化。

nonce 是 operational state，不进 backup。

## 7. Public metadata

```text
GET /0/public/Assets?assetVersion=1
GET /0/public/AssetPairs?assetVersion=1
```

使用 metadata：

- raw key → canonical display identity
- pair → base/quote
- provider precision metadata

不要 string split 猜 pair。

不要只硬编码 XXBT→BTC / ZUSD→USD。

## 8. Balance

```text
POST /0/private/Balance
```

作为 current external total balance observation。

amount 必须保持 decimal text。

`.B/.F/.M/.S/.T` 保持独立 raw identity，不自动 aggregate。

## 9. Ledgers

```text
POST /0/private/Ledgers
```

必须完整分页。

当前官方文档说明 50 results at a time。

每个 ledger ID：

```text
object_type = kraken_ledger
```

至少保存：

```text
refid
time
type
subtype
asset
amount
fee
balance
```

## 10. TradesHistory

```text
POST /0/private/TradesHistory
```

permission：

```text
query closed orders & trades
```

完整分页。

每个 trade fill external ID：

```text
object_type = kraken_trade
```

TradesHistory 是 trade candidate primary source。

pair 通过 AssetPairs metadata 解析。

## 11. Fee 不能猜

Trade `fee` 数量存在不等于 fee asset 已被安全确定。

只有明确 provider evidence 或用户 Review 明确选择时才生成 fee leg。

禁止默认“fee 一定 quote asset”直接导入。

## 12. Network / DB transaction

禁止：

```text
BEGIN
await Kraken
COMMIT
```

正确：

```text
short DB claim/state tx
commit
external HTTP
normalize
short persistence tx
```

## 13. No write endpoints

Kraken client contract/implementation不得包含：

```text
AddOrder
CancelOrder
Withdraw
Deposit write
Earn Allocate/Deallocate
Account Transfer
```


---

# FILE: 07_SYNC_IDEMPOTENCY_STATE_MACHINE_CN.md

# Sync / Idempotency State Machine

## Manual sync only

V3 P0 无 cron。

```text
用户点击 Sync Now
```

## Connection lock

同一 connection 同时只允许一个 sync。

- process-local lock
- operational state
- duplicate request safe skip/409
- 不持 SQLite transaction 等 HTTP

## Phases

```text
START
→ credentials?
→ GetApiKeyInfo
→ permission gate
→ Assets / AssetPairs
→ Balance
→ Ledgers pages
→ TradesHistory pages
→ normalize in memory
→ BEGIN IMMEDIATE
→ upsert metadata/source
→ append observations
→ upsert candidates
→ state/run
→ COMMIT
```

## Source upsert

唯一：

```text
connection + objectType + externalId
```

同 source 再同步：

- count 不增加
- update lastSeenAt
- compare payloadHash

如果 source changed：

- 未 import → re-normalize
- 已 import → mark warning/source_changed
- Ledger 不动

## Candidate key

```text
kraken:trade:<trade-id>
kraken:ledger:<ledger-id>
```

不要 random/time/amount 作为稳定键。

## Re-sync imported candidate

必须：

```text
candidate one
import link one
ledger event one
```

## Pagination overlap

incremental sync 可留时间 overlap，由 provider stable ID 去重。

cursor 是性能 hint，不是 correctness source。

## First sync

P0 默认合理 lookback（建议 90 天）而非无限抓全部历史。
后续可提供更早历史导入。

## Partial failure

不删除此前成功数据。

若分页未完整：

- run 标记 partial/error
- 不把 incomplete source set 当完整
- 下一 sync 重试

## Payload hash

SHA-256 canonical sanitized JSON。

不得把 auth/nonce/secret 放入 canonical payload。


---

# FILE: 08_CREDENTIALS_SECURITY_SPEC_CN.md

# Credential & Security Spec

## Secret boundary

仅 server env：

```text
KRAKEN_API_KEY
KRAKEN_API_SECRET
```

`.env.example` 只留空占位。

禁止进入：

- SQLite
- backup
- client bundle
- React props
- HTML
- logs
- source payload JSON
- error response

Provider factory 必须 server-only。

## Dedicated read-only key

UI 只显示：

```text
Credential configured: yes/no
Required read permissions
Dangerous write permissions detected: yes/no
```

不要显示 key 前后几位。

## Same-origin mutation routes

```text
POST /api/sync/kraken/run
POST /api/sync/candidates/:id/import
POST /api/sync/candidates/:id/ignore
POST /api/sync/observations/:id/reconcile
```

必须 same-origin。

## Safe errors

分类：

```text
CONFIG_ERROR
AUTH_ERROR
PERMISSION_ERROR
NONCE_ERROR
RATE_LIMITED
UPSTREAM_ERROR
UPSTREAM_PAYLOAD_INVALID
NETWORK_ERROR
```

不得 dump request headers/signed payload/env。

## GetApiKeyInfo payload

可以保存 permission check 结果，
不要把完整 API key info（尤其 apiKey 字段）当 source object 保存。

## Testing destination

不要提供用户可配置 `KRAKEN_API_BASE_URL` 来测试，
避免 credential exfiltration/SSRF 风险。

测试用 injected transport。

## Backup

可保存：

```text
credentialRef = env:kraken.primary
```

不保存 secrets。

restore 后 env 缺 key：

```text
credentials missing
sync unavailable
```

但 Ledger/backup 正常。


---

# FILE: 09_CANDIDATE_NORMALIZATION_IMPORT_SPEC_CN.md

# Candidate Normalization & Import

## Trade fill → Exchange suggestion

通过 AssetPairs metadata 得 BASE/QUOTE。

Buy：

```text
source      = -cost QUOTE
destination = +vol BASE
```

Sell：

```text
source      = -vol BASE
destination = +cost QUOTE
```

只是 candidate legs，不能自动写 Ledger。

## Fee

必须有明确 asset evidence：

- linked Kraken ledger row
- provider 明确字段且官方语义可靠
- 用户 Review 手动选择

不能因经验假设 fee currency。

无法安全确定：

```text
fee unresolved
candidate needs review
```

## Multiple fills

V3.2 P0：

```text
one Kraken trade fill = one candidate
```

可以按 `ordertxid` 分组显示，但不默认合并。

## Non-trade ledger

deposit/withdrawal/transfer/adjustment 等只产生 suggestion。

不自动把：

```text
deposit = income
withdrawal = expense
```

## Mapping before import

所有 required legs 必须：

- mapped asset
- selected account
- account.asset matches
- exact amount→atomic
- no excess precision
- V1 invariant valid

## Atomic import

必须避免 crash 导致 duplicate：

```text
BEGIN IMMEDIATE
→ lock candidate
→ verify no import link
→ resolve mappings
→ call SAME executor-scoped V1 invariant/writer
→ insert import link
→ mark imported
→ COMMIT
```

若当前 V1 command 总是自开 transaction，允许最小内部重构：

```text
public createX(input)
  -> transaction(executor => createXIn(executor, input))
```

V3 调同一个 `createXIn`。

不复制 invariant，不直接 bypass insert ledger_entries。

## Ignore

```text
status = ignored
```

保留 source。

re-sync 不自动恢复 pending。

## Provenance

Import link：

```text
candidate_id UNIQUE
ledger_event_id UNIQUE
imported_at
import_fingerprint
```

删除 Ledger event 后不得自动 re-import。
P0 可保留 provenance/tombstone 语义并要求明确 Re-import。

## Balance reconcile

Observation reconciliation 不走 candidate import。

用户明确确认后调用现有 reconciliation path，仍写 snapshot。


---

# FILE: 10_BACKUP_V3_MIGRATION_SPEC_CN.md

# Backup V3 / Migration Spec

## schemaVersion

V3 export：

```text
schemaVersion = 3
```

必须接受：

```text
V1 = 1
V2 = 2
V3 = 3
```

## Include

V3 user/fetched/provenance data：

```text
externalConnections
externalAssetMappings
externalAccountMappings
externalBalanceObservations
externalSourceObjects
externalTransactionCandidates
externalCandidateSourceObjects
externalTransactionLegs
externalImportLinks
```

## Exclude

Operational：

```text
externalConnectionState
externalSyncRuns
```

继续排除 V2 cache：

```text
latestPriceQuotes
priceProviderState
```

永不包含：

```text
KRAKEN_API_KEY
KRAKEN_API_SECRET
API-Sign
nonce request data
```

## V1→V3

复用既有 V1→V2 migration；
V3 arrays = []；
不创建 Kraken connection；
balances 不变。

## V2→V3

保留全部 V2 user settings/manual quotes；
V3 arrays = []；
不自动连接 Kraken。

## Validation

写前验证：

- connection book exists
- provider/credentialRef allowed
- mapping FK valid
- account.asset matches mapping
- source uniqueness
- candidate stable uniqueness
- candidate source links valid
- legs asset/decimal/atomic valid
- import link candidate/ledger event valid
- imported candidate max one link

## Atomic restore

```text
validate whole payload
→ BEGIN IMMEDIATE
→ write V1/V2/V3
→ foreign_key_check
→ COMMIT
```

后段 V3 insert 失败必须全部 rollback。

## Seed-only

V3 默认不 seed external connection。
用户一旦创建 external configuration，DB 不再是 pristine seed-only restore target。


---

# FILE: 11_UI_UX_SPEC_CN.md

# V3 UI / UX Spec

## Navigation

新增：

```text
同步
```

推荐 `/sync`，移动端也必须可达。

## Overview

```text
外部同步

Kraken
状态：已连接 / 凭据缺失 / 权限不安全 / 最近失败
最近成功：...
[立即同步]

只读同步不会自动修改账本。
```

## Credential card

```text
Credential: env:kraken.primary
API key: 已配置/未配置

✓ Query funds
✓ Query ledger entries
✓ Query closed trades
✓ No dangerous write permissions
```

危险 permission → 拒绝 sync。

## Asset mappings

```text
Kraken raw   Canonical   Talli asset   Talli account
XXBT         BTC         BTC           Kraken BTC
ZUSD         USD         USD           Kraken USD
USDT.F       USDT.F      未映射         -
```

suffix 可以给 suggestion，但要用户确认。

## Balance observation

```text
Kraken BTC

外部观测 0.50200000 BTC
Talli账本 0.50000000 BTC
差异      +0.00200000 BTC
观察时间 ...

[调整账本为外部余额]
```

点击调整后必须确认：

```text
这会创建余额快照，不会创建收入/支出。
```

## Candidate queue

Tabs：

```text
待审核
需映射
已导入
已忽略
异常
```

Row：

```text
Kraken · Trade
100 USDT → 0.00145 BTC
Fee unresolved / ...
建议：兑换
[审核]
```

## Candidate review

显示：

- provider/source IDs
- occurredAt
- raw amounts
- normalized legs
- mapping status
- chosen Talli accounts
- suggested vs chosen event type
- fee evidence
- warnings

按钮：

```text
[导入到 Talli]
[忽略]
```

Import 是真实财务写入，必须明确确认。

## Imported

显示：

```text
已导入
Talli event: ...
```

可跳转 `/transactions/:id`。

## Error states

区分：

- credentials missing
- auth failed
- permission missing
- dangerous write permission
- nonce error
- rate limited
- provider unavailable
- payload invalid
- unmapped asset
- excess precision

任何 sync error 不得影响 V1/V2 页面。

## Mobile

mobile WebKit E2E 验证：

- `/sync` 无 overflow
- mapping 可操作
- candidate review 可用
- imported state 可见


---

# FILE: 12_TEST_ACCEPTANCE_CN.md

# V3 Test & Acceptance Matrix

## A. Frozen regression

所有 V1/V2 unit/integration/E2E 继续 PASS。

## B. Kraken Auth

- K-001: fixed fixture signature deterministic
- K-002: 100 nonces strictly increasing
- K-003: restart/service rebuild still > persisted nonce
- K-004: missing query-ledger rejects
- K-005: withdraw-funds / modify-trades rejects
- K-006: secret absent from log/error/source/backup

## C. Provider

- KP-001 Balance decimal strings exact
- KP-002 USDT.F not auto-collapse
- KP-003 XXBT raw resolves via metadata to BTC
- KP-004 pair base/quote from AssetPairs
- KP-005 Ledgers pagination >50
- KP-006 Trades pagination
- KP-007 no write endpoint
- KP-008 provider HTTP asserts sqlite.inTransaction == false

## D. Idempotency

- S-001 same ledger twice → source count unchanged
- S-002 same trade twice → candidate count unchanged
- S-003 imported re-sync → ledger count unchanged
- S-004 source changes before import → re-normalize
- S-005 source changes after import → warning, Ledger unchanged
- S-006 concurrent sync → one provider chain

## E. Mapping

- M-001 Kraken BTC → Talli USD account reject
- M-002 ignored asset does not block others
- M-003 excess provider precision → no rounding/no import

## F. Balance

- B-001 sync Balance does not mutate Ledger/snapshots
- B-002 external .502 vs ledger .500 → +.002 exact
- B-003 explicit confirm → snapshot + correct balance
- B-004 no confirm → no reconcile

## G. Candidate

- C-001 Buy → source quote negative, dest base positive
- C-002 Sell → source base negative, dest quote positive
- C-003 fee amount but unknown asset → not auto-importable fee
- C-004 explicit ledger fee evidence → fee leg
- C-005 deposit not auto-income
- C-006 withdrawal not auto-expense

## H. Atomic import

- I-001 exchange candidate → exactly one V1 event + link
- I-002 late DB trigger failure → Ledger event also rollback
- I-003 second import reject/no duplicate
- I-004 V1 invariant still enforced

## I. Backup v3

- BV3-001 schemaVersion 3
- BV3-002 secrets excluded
- BV3-003 operational state excluded
- BV3-004 V1 restore
- BV3-005 V2 restore
- BV3-006 V3 exact roundtrip
- BV3-007 corrupt mapping pre-write reject
- BV3-008 late V3 restore failure full rollback

## J. E2E

No real Kraken.

至少验证：

1. `/sync`
2. connection permission status
3. asset mapping
4. observed vs Ledger balance
5. explicit reconciliation
6. pending trade candidate
7. review Exchange
8. import
9. original transaction page visible
10. candidate imported
11. no duplicate on revisit/resync fixture
12. mobile no overflow

## Final gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

GitHub Actions exact final SHA must be all green.


---

# FILE: 13_IMPLEMENTATION_PLAN_CN.md

# V3 Implementation Plan

## Phase 0 — release baseline

- confirm V2 baseline/CI
- main + v2.0.0 preferred
- branch `feat/v3-external-sync`
- old gates green

## Phase 1 — additive schema

- Drizzle tables
- migration
- queries
- V1/V2 fact schema unchanged

## Phase 2 — domain primitives

- provider decimal validation
- source identity/hash
- mapping status
- candidate status
- exact observation→atomic conversion

## Phase 3 — Kraken auth/security

- env credential factory
- HMAC signature
- persisted monotonic nonce
- permission gate
- safe errors
- injectable HTTP

## Phase 4 — metadata

- Assets assetVersion=1
- AssetPairs assetVersion=1
- raw/canonical adapter
- suffix preserved

## Phase 5 — read-only fetch

- Balance
- Ledgers pages
- TradesHistory pages
- no write API
- HTTP outside DB tx

## Phase 6 — sync persistence

- run/state
- source upsert
- observation append
- candidate upsert
- concurrent guard
- idempotency

## Phase 7 — mappings

- asset mapping
- account mapping
- validation
- precision status
- mapping UI

## Phase 8 — candidate normalization

- trade buy/sell
- non-trade ledger suggestions
- source links
- unresolved fee

## Phase 9 — atomic import

受控 refactor V1 writer only if required：

```text
public V1 command
→ executor-scoped same writer
```

candidate lock + V1 event + import link + status in one transaction。

## Phase 10 — reconciliation

- difference
- explicit confirm
- existing snapshot path

## Phase 11 — backup v3

- schemaVersion 3
- V1/V2 upgrades
- V3 include/exclude
- atomic restore

## Phase 12 — UI

- `/sync`
- connection/permissions
- mappings
- balances
- candidate queue/review/import
- provenance/errors/responsive

## Phase 13 — E2E / CI

- deterministic fixtures
- no real Kraken
- desktop Chromium
- mobile WebKit
- all 8 gates
- Actions green

## Phase 14 — final audit handoff

输出：

- final SHA
- migration list
- changed files
- test counts
- CI run ID
- known limitations

交给独立 Final Audit。


---

# FILE: 14_NON_GOALS_AND_FUTURE_BOUNDARY_CN.md

# Non-goals / Future Boundary

## V3 本轮不做

- wallet addresses / chain scanning
- EVM/Solana/Bitcoin token parsing
- Coinbase/Binance/OKX
- Kraken Futures
- automated import
- scheduled cron
- WebSocket
- secret vault
- historical market price V2.1
- cost basis
- P&L
- tax

## Wallet

放 V3.3 或后续独立包。
Wallet 的 transfer/gas/swap/bridge 语义不要与交易所 Spot 强行共用 parser。

## Other providers

Schema/interfaces 应可 additive 扩展：

```text
provider = coinbase
provider = wallet_evm
```

但不要为了未知未来造微服务/Redis/queue。

## Auto-import

未来即使做也必须：

- explicit opt-in
- deterministic rules
- candidate/provenance retained
- V1 invariants unchanged

## Cron

V3 P0 manual sync only。
后续再加 scheduled sync/notifications。

## Secret vault

V3.1 server env。
多 connection 后再设计 encrypted secret store + master key + rotation。


---

# FILE: 15_KRAKEN_FIXTURES.json

{
  "schemaVersion": 1,
  "provider": "kraken",
  "apiKeyInfo": {
    "permissions": [
      "query-funds",
      "query-ledger",
      "query-closed-trades"
    ]
  },
  "referenceData": {
    "rawToDisplay": {
      "XXBT": "BTC",
      "ZUSD": "USD",
      "USDT": "USDT",
      "USDT.F": "USDT.F"
    },
    "assetPairsDisplay": {
      "BTC/USD": {
        "base": "BTC",
        "quote": "USD",
        "fee_volume_currency": "USD"
      }
    }
  },
  "balances": {
    "XXBT": "0.50200000",
    "ZUSD": "1250.1000",
    "USDT": "100.00000000",
    "USDT.F": "5.00000000"
  },
  "ledgers": {
    "L-TRADE-1": {
      "refid": "T-TRADE-1",
      "time": "1786440000.1000",
      "type": "trade",
      "subtype": "",
      "asset": "ZUSD",
      "amount": "-100.0000",
      "fee": "0.2500",
      "balance": "1150.1000"
    },
    "L-DEPOSIT-1": {
      "refid": "D-DEPOSIT-1",
      "time": "1786430000.0000",
      "type": "deposit",
      "subtype": "",
      "asset": "USDT",
      "amount": "50.00000000",
      "fee": "0.00000000",
      "balance": "100.00000000"
    }
  },
  "trades": {
    "T-TRADE-1": {
      "ordertxid": "O-ORDER-1",
      "postxid": "P-POS-1",
      "pair": "BTC/USD",
      "time": "1786440000.1000",
      "type": "buy",
      "price": "68965.517241",
      "cost": "100.0000",
      "fee": "0.2500",
      "vol": "0.00145000"
    }
  }
}


---

# FILE: 16_EXTERNAL_API_REFERENCE_20260811_CN.md

# Kraken Official API Reference Snapshot — 2026-08-11

实现前允许 Codex 重新核对 **官方 Kraken Developers**。
第三方博客不得作为协议事实来源。

## Get API Key Info

```text
https://docs.kraken.com/api-reference/account-data/get-api-key-info
POST /0/private/GetApiKeyInfo
```

当前文档可返回 permissions。
本包 required：

```text
query-funds
query-ledger
query-closed-trades
```

deny write：

```text
add-funds
withdraw-funds
earn-funds
modify-trades
close-trades
add-withdraw-address
update-withdraw-address
```

## Balance

```text
https://docs.kraken.com/api-reference/account-data/get-account-balance
POST /0/private/Balance
```

Permission：Funds permissions - Query。

当前官方示例有：

```text
ZUSD
XXBT
USDT
USD.M
```

文档还说明 `.B/.F/.T` 等产品 suffix。
因此必须保留 raw identity。

## Ledgers

```text
https://docs.kraken.com/api-reference/account-data/get-ledgers-info
POST /0/private/Ledgers
```

Permission：Data - Query ledger entries。

当前官方文档说明：

```text
50 results at a time
most recent by default
```

常见字段：

```text
refid time type subtype asset amount fee balance
```

必须分页。

## Trades History

Kraken Developers：

```text
Spot REST → Account Data → Get Trades History
POST /0/private/TradesHistory
```

Permission：Orders and trades - Query closed orders & trades。

每个 trade fill external ID 是 P0 candidate idempotency unit。

## Assets

```text
https://docs.kraken.com/api-reference/market-data/get-asset-info
GET /0/public/Assets?assetVersion=1
```

当前文档：

- default = internal legacy names（XXBT/ZUSD）
- assetVersion=1 = canonical display names（BTC/USD）
- altname/wsname 不受影响

## AssetPairs

```text
https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs
GET /0/public/AssetPairs?assetVersion=1
```

display mode 使 pair/base/quote/fee_volume_currency 使用 display names。
不要 string split 猜 pair。

## Authentication

```text
https://docs.kraken.com/exchange/guides/rest/authentication
```

当前文档：

```text
API-Key
API-Sign
nonce (always increasing unsigned 64-bit)
optional otp
```

签名：

```text
HMAC-SHA512(
  URI path + SHA256(nonce + POST data),
  base64-decoded secret
)
```

URI path 从 `/0/private` 开始。

Kraken 明确提醒 nonce 不能下降，时钟回拨或多进程乱序会导致 invalid nonce。
因此 Talli 使用 persisted monotonic nonce + per-connection serialization。

## Tests

CI 不使用真实 Kraken credentials 或网络。
全部 provider tests 用 injectable transport + deterministic fixture。


---

# FILE: CODEX_HANDOFF_PROMPT.txt

你现在负责 Talli V3。

Repository:
wentAInx/Talli

Frozen V2 engineering baseline:
ad0de1d26d060fd391449f869a5c99a36f1901ed

目标：
严格按照本任务包实现
“Talli V3 — External Sync Foundation & Kraken Read-only Integration”。

先完整阅读 00_README_CN.md → 16_EXTERNAL_API_REFERENCE_20260811_CN.md，
再检查 repo/main/v2.0.0/HEAD 与 baseline 的关系。

若 V2 release 尚未冻结到上述 SHA（或用户明确批准的 release-only descendant），
不要 reset/rebase，先报告。

本轮 P0：
- V3.0 external sync foundation
- V3.1 Kraken Spot read-only sync
- V3.2 review + explicit import
- balance observation + explicit reconciliation
- idempotency/provenance
- backup schemaVersion 3 + V1/V2 compatibility
- UI/tests/CI

红线：
External API != Ledger。
Sync 不得自动修改 ledger_entries / balance_snapshots。
只有用户明确 Import / Reconcile 后才走现有 V1 invariant/writer path。

Kraken key server-only、专用只读、最小权限。
不得实现 AddOrder/Withdraw/Earn write endpoint。
不得把 key/secret 放 SQLite、backup、client、logs、fixture。

测试禁止真实外网，使用 injectable transport + deterministic fixtures。

按 13_IMPLEMENTATION_PLAN_CN.md 分 Phase。
最终实际运行 8 个 gate，不得伪造。
不要 push/merge/tag/deploy，除非用户另行明确要求。
