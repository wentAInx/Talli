# TALLI V4 COMBINED CODEX ENGINEERING PACKAGE

Repository: `wentAInx/Talli`

Baseline: `51a7f0c346c10c8bcd4e29261730eee5eb360df5` / `v3.0.0`

Generated: 2026-08-12


---

# FILE: 00_README_CN.md

# Talli V4 — EVM Wallet & On-chain Sync

Repository: `wentAInx/Talli`  
Frozen V3 baseline: `51a7f0c346c10c8bcd4e29261730eee5eb360df5`  
Release tag: `v3.0.0`  
V3 main CI: `31598308119` — Quality & Build / Playwright E2E 均通过。

## 正式范围

> **V4.0 = Ethereum Mainnet Read-only Wallet Sync**

V4.0 先把 Ethereum Mainnet 做到可审计、可重复同步、可安全导入。Base / Arbitrum 放到 V4.1，不在本轮 production allowlist。

原因不是 Alchemy 不支持 L2，而是 correctness-first：Alchemy Transfers API 当前对 internal native transfer 的支持边界与 L2 不完全一致；Base 网络费还包含 L2 execution fee + L1 security fee。V4.0 不复制 Ethereum 逻辑后假装多链已正确。

## 数据责任

```text
V1 Ledger        = 用户确认后的财务事实
V2 Valuation     = 派生市场估值
V3 Kraken Sync   = 交易所观测/候选
V4 On-chain Sync = 公链地址观测/来源对象/候选
```

最高红线：`On-chain data != Ledger`。

Sync 不得自动写 `ledger_events` / `ledger_entries` / `balance_snapshots`；只有用户明确 Import / Reconcile 才能进入已有 V1 writer。

## V4.0 用户能力

- 配置 server-only `ALCHEMY_API_KEY`；
- 添加一个或多个 Ethereum Mainnet **公开地址**；
- 手动 Sync；
- 读取 ETH + ERC-20 当前余额；
- 显示 token contract / symbol / decimals；
- 映射到 Talli asset + account；
- observed balance vs Ledger balance + explicit reconciliation；
- 读取 external/internal/ERC20 transfer activity；
- 按 tx hash 生成 movement candidate；
- 单独生成 Ethereum gas expense candidate；
- simple in/out/exchange 可 review/import；
- complex DeFi / bridge / multi-asset tx 只保存来源与净变动，不自动解释；
- re-sync 不重复 source/candidate/import。

## 明确不做

Base/Arbitrum production import、Bitcoin、Solana、Tron、NFT、DeFi positions、WalletConnect、private key、seed phrase、签名/广播、cron/webhook、auto-import、contract ABI 自动解码、Alchemy Prices、tax/P&L/cost basis。

## 阅读顺序

1. `01_CODEX_MASTER_INSTRUCTION_CN.md`
2. `02_PRODUCT_ENGINEERING_BRIEF_CN.md`
3. `03_DOMAIN_AND_IDENTITY_SPEC_CN.md`
4. `04_DATABASE_TARGET_SCHEMA_V4_DRAFT.sql`
5. `05_MIGRATION_PLAN_CN.md`
6. `06_ALCHEMY_PROVIDER_SPEC_CN.md`
7. `07_ACTIVITY_AND_GAS_SPEC_CN.md`
8. `08_SECURITY_SPEC_CN.md`
9. `09_BACKUP_V4_SPEC_CN.md`
10. `10_UI_UX_SPEC_CN.md`
11. `11_TEST_ACCEPTANCE_CN.md`
12. `12_IMPLEMENTATION_PLAN_CN.md`
13. `13_V41_BOUNDARY_CN.md`
14. `14_EXTERNAL_API_REFERENCE_20260812_CN.md`
15. `15_FIXTURES.json`
16. `CODEX_HANDOFF_PROMPT.txt`


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

# Codex Master Instruction — V4

## Baseline

```text
Repository: wentAInx/Talli
main/tag baseline: 51a7f0c346c10c8bcd4e29261730eee5eb360df5
tag: v3.0.0
```

开工前运行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -10
git tag --points-at HEAD
```

若不是 `51a7f0c346c10c8bcd4e29261730eee5eb360df5` 或用户明确批准的 release-only descendant：停止并报告；不得 reset/rebase/force。

推荐分支：`feat/v4-evm-wallet-sync`。

## Frozen V1/V2/V3 semantics

不得改变 atomic TEXT + bigint、Account 单一 asset、Transfer/Exchange/Fee/Snapshot/Balance/Reports 语义、V2 valuation derived-only、V3 Kraken read-only/candidate/import/reconciliation/provenance/backup semantics。

允许为了 V4 做**最小 external-sync schema generalization**，但 V3 Kraken migration 后必须行为等价且 regression 全绿。

## V4 硬红线

1. On-chain sync 不自动写 Ledger。
2. Provider HTTP 永远在 SQLite write transaction 外。
3. 绝不请求/保存 private key、mnemonic、seed、WalletConnect session。
4. `ALCHEMY_API_KEY` 仅 server env。
5. Provider 不得存在任何 write/sign RPC：`eth_sendTransaction`、`eth_sendRawTransaction`、`eth_sign*`、`personal_*`、`wallet_*`。
6. 用户不得配置任意 RPC URL。
7. ERC-20 identity = chain + contract address，不是 symbol。
8. 钱的算术只用 JSON-RPC hex / `rawContract.value` → bigint；Alchemy human `value` number 绝不能用于 money arithmetic。
9. complex transaction 不猜 income/expense/exchange。
10. gas 与 movement 拆成两个 candidate，继续保持 one candidate -> at most one V1 event。
11. V4.0 production 仅 `chainId=1`。
12. V3 Kraken 必须完整 regression。

## Provider

Alchemy raw fetch + injectable transport。不要把 Alchemy SDK 变成必要依赖。

P0 read-only methods：

```text
eth_chainId
eth_blockNumber
eth_getBlockByNumber
eth_getBalance
eth_getTransactionByHash
eth_getTransactionReceipt
alchemy_getTokenBalances
alchemy_getTokenMetadata
alchemy_getAssetTransfers
```

不使用 Alchemy Prices；估值仍由 V2 负责。

## CI

禁止真实 Alchemy 网络：fixture/injectable transport only。

最终实际执行：

```text
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

不要伪造结果；不要 merge/tag/deploy，除非用户明确要求。


---

# FILE: 02_PRODUCT_ENGINEERING_BRIEF_CN.md

# Product & Engineering Brief

V4 的目标不是“把区块链当账本”，而是把公开链上状态转成 Talli 可审核的 observation / source object / candidate。

## P0

- 多个 Ethereum Mainnet raw address；
- address label + history start date；
- manual sync；
- ETH + ERC20 current balances；
- token metadata；
- external asset/account mapping；
- exact balance difference + explicit snapshot reconciliation；
- external/internal/ERC20 activity；
- finalized history；
- tx/receipt enrichment；
- movement candidate + gas candidate；
- idempotency/provenance；
- simple import；
- complex tx safe unsupported state；
- backup schemaVersion 4；
- V1/V2/V3 compatibility；
- desktop/mobile E2E。

## Gas 独立 candidate

一笔 tx：

```text
-100 USDC
+0.04 ETH
gas 0.001 ETH
```

生成：

```text
movement candidate -> Exchange suggestion
gas candidate      -> Expense suggestion
```

这样保留 V3 `external_import_links` 的 one candidate ↔ one Ledger event，不需要一条 on-chain candidate 隐式创建多条 V1 events，也能正确覆盖 gas-only / failed tx。

## 自动分类边界

```text
1 positive asset only                 -> simple_in / unknown
1 negative asset only                 -> simple_out / unknown
1 negative A + 1 positive B, A != B   -> simple_exchange / exchange suggestion
3+ nonzero assets / complex movement  -> unsupported complex
no movement + wallet pays gas         -> gas candidate only
```

Inbound 不自动 income；outbound 不自动 expense。用户必须明确选择。


---

# FILE: 03_DOMAIN_AND_IDENTITY_SPEC_CN.md

# EVM Domain & Identity Spec

## Wallet connection identity

一个 V4 connection = 一个 book + chain + public address。

V4.0：

```text
chainId = 1
networkId = eth-mainnet
sourceKey = eip155:1:<lowercase-address>
credentialRef = env:alchemy.primary
```

地址只接受 `^0x[0-9a-fA-F]{40}$`；identity 一律 lowercase；不做 ENS；不把大小写差异当不同钱包。

## External asset identity

Native ETH：

```text
eip155:1/native
```

ERC20：

```text
eip155:1/erc20:<lowercase-contract>
```

`symbol/name` 只用于 display，不能当 identity，不能因为 symbol=USDC 自动映射到 Talli USDC。

## Exact amount

- `eth_getBalance` hex wei -> bigint；
- `alchemy_getTokenBalances.tokenBalance` hex atomic -> bigint；
- `alchemy_getAssetTransfers.rawContract.value` -> bigint；
- 禁止 `Number(hex)`、`parseInt` 后做金额运算；
- provider human `value` 仅用于 audit/display；
- raw atomic + token decimals -> exact decimal text -> 现有 `externalDecimalToAtomic`；
- 无法无损映射到 Talli scale -> `excess_precision`，不得 round。

## Current balance observations

复用 `external_balance_observations`，新增 EVM detail 保存：chain、kind、contract、raw atomic、decimals、sync head block context。

Observation 不是 snapshot。只有明确 Reconcile 才写 V1 snapshot。

## Source objects

新增：

```text
evm_transaction  // primary by tx hash
evm_transfer     // Alchemy indexed movement by uniqueId
```

`evm_transaction` 保存用于重建语义的 sanitized tx+receipt subset；`evm_transfer` 保存 exact rawContract value、from/to/category/block/time/contract。

## Candidate stable key

```text
evm:1:movement:<txhash>
evm:1:gas:<txhash>
```

两者可共享同一 `evm_transaction` primary source；transfer rows 为 cross_check sources。


---

# FILE: 04_DATABASE_TARGET_SCHEMA_V4_DRAFT.sql

-- TARGET model only; not a blind migration script.
CREATE TABLE external_connections (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('kraken','evm_wallet')),
  source_key TEXT NOT NULL,
  name TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(book_id, provider, source_key)
);
CREATE INDEX external_connections_book_provider_idx ON external_connections(book_id,provider,is_enabled);

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
  permission_checked_at TEXT,
  permission_summary_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE evm_wallet_connections (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL CHECK (chain_id=1),
  network_id TEXT NOT NULL CHECK (network_id='eth-mainnet'),
  address_lower TEXT NOT NULL,
  address_display TEXT NOT NULL,
  data_provider TEXT NOT NULL CHECK (data_provider='alchemy'),
  history_start_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(chain_id,address_lower)
);

CREATE TABLE evm_wallet_connection_state (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES evm_wallet_connections(connection_id) ON DELETE CASCADE,
  last_finalized_block_text TEXT,
  last_balance_sync_at TEXT,
  last_activity_sync_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE external_asset_mappings (
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  provider_asset_key TEXT NOT NULL,
  provider_display_code TEXT,
  talli_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  mapping_status TEXT NOT NULL DEFAULT 'unmapped' CHECK (mapping_status IN ('mapped','unmapped','ignored')),
  provider_metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(connection_id,provider_asset_key)
);
CREATE INDEX external_asset_mappings_talli_asset_idx ON external_asset_mappings(talli_asset_id);

CREATE TABLE external_account_mappings (
  connection_id TEXT NOT NULL,
  provider_asset_key TEXT NOT NULL,
  talli_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(connection_id,provider_asset_key),
  FOREIGN KEY(connection_id,provider_asset_key) REFERENCES external_asset_mappings(connection_id,provider_asset_key) ON DELETE CASCADE,
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

CREATE TABLE external_source_objects (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('kraken_ledger','kraken_trade','evm_transaction','evm_transfer')),
  external_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(connection_id,object_type,external_id)
);

CREATE TABLE external_balance_observations (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  provider_asset_key TEXT NOT NULL,
  talli_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  provider_amount_text TEXT NOT NULL,
  mapped_amount_atomic TEXT,
  precision_status TEXT NOT NULL CHECK (precision_status IN ('exact','excess_precision','unmapped')),
  observed_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(connection_id,provider_asset_key) REFERENCES external_asset_mappings(connection_id,provider_asset_key) ON DELETE RESTRICT
);

CREATE TABLE evm_balance_observation_details (
  observation_id TEXT PRIMARY KEY NOT NULL REFERENCES external_balance_observations(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL CHECK (chain_id=1),
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('native','erc20')),
  contract_address_lower TEXT,
  raw_amount_atomic_text TEXT NOT NULL,
  token_decimals INTEGER NOT NULL CHECK (token_decimals>=0 AND token_decimals<=255),
  sync_head_block_text TEXT,
  CHECK ((asset_kind='native' AND contract_address_lower IS NULL) OR (asset_kind='erc20' AND contract_address_lower IS NOT NULL))
);

CREATE TABLE external_transaction_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  suggested_event_type TEXT NOT NULL CHECK (suggested_event_type IN ('exchange','transfer','income','expense','unknown')),
  status TEXT NOT NULL CHECK (status IN ('pending','needs_mapping','ignored','imported','unsupported','source_changed')),
  occurred_at TEXT NOT NULL,
  title TEXT NOT NULL,
  normalization_version INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(connection_id,stable_key)
);

CREATE TABLE external_candidate_source_objects (
  candidate_id TEXT NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  source_object_id TEXT NOT NULL REFERENCES external_source_objects(id) ON DELETE RESTRICT,
  relation TEXT NOT NULL CHECK (relation IN ('primary','cross_check')),
  PRIMARY KEY(candidate_id,source_object_id)
);

CREATE TABLE external_transaction_legs (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  leg_index INTEGER NOT NULL CHECK (leg_index>=0),
  role TEXT NOT NULL CHECK (role IN ('source','destination','fee','external_in','external_out','unknown')),
  provider_asset_key TEXT NOT NULL,
  talli_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  amount_text TEXT NOT NULL,
  amount_atomic TEXT,
  precision_status TEXT NOT NULL CHECK (precision_status IN ('exact','excess_precision','unmapped')),
  note TEXT,
  UNIQUE(candidate_id,leg_index)
);

CREATE TABLE evm_candidate_details (
  candidate_id TEXT PRIMARY KEY NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL CHECK (chain_id=1),
  tx_hash TEXT NOT NULL,
  candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('movement','gas')),
  classification TEXT NOT NULL CHECK (classification IN ('simple_in','simple_out','simple_exchange','gas_only','complex','unsupported')),
  tx_status TEXT NOT NULL CHECK (tx_status IN ('success','failed','unknown')),
  block_number_text TEXT,
  block_timestamp TEXT,
  from_address_lower TEXT NOT NULL,
  to_address_lower TEXT,
  gas_fee_atomic_text TEXT,
  gas_fee_status TEXT NOT NULL CHECK (gas_fee_status IN ('exact','not_applicable','unresolved')),
  UNIQUE(chain_id,tx_hash,candidate_kind)
);

CREATE TABLE external_import_links (
  candidate_id TEXT PRIMARY KEY NOT NULL REFERENCES external_transaction_candidates(id) ON DELETE RESTRICT,
  ledger_event_id TEXT NOT NULL UNIQUE REFERENCES ledger_events(id) ON DELETE RESTRICT,
  imported_at TEXT NOT NULL,
  import_fingerprint TEXT NOT NULL
);


---

# FILE: 05_MIGRATION_PLAN_CN.md

# V3 → V4 Migration Plan

V3 `external_connections` 只有 Kraken，且 identity 是 `UNIQUE(book,provider,credential_ref)`；V4 多个 wallet 必须共用 `env:alchemy.primary`，所以 identity 改为 `UNIQUE(book,provider,source_key)`。

V3 Kraken rows 迁移后必须：

```text
provider      = kraken
credentialRef = env:kraken.primary
sourceKey     = kraken:primary
```

所有 connection/source/candidate/import/ledger IDs 必须原样保留。

因为 CHECK/UNIQUE 变化，SQLite 需要 forward-only table rebuild。不得修改已发布 V1/V2/V3 migration。

安全原则：

1. `PRAGMA foreign_keys=OFF` 必须在 transaction 外；
2. `BEGIN IMMEDIATE`；
3. create `external_connections_v4`；
4. exact copy + inject `source_key`；
5. row-count check；
6. replace table + recreate indexes；
7. `external_source_objects` 同理扩展 object type；
8. create EVM tables；
9. commit；
10. `PRAGMA foreign_keys=ON`；
11. `foreign_key_check` 必须 empty。

若现有 migration runner 无法安全控制 PRAGMA，停止并报告，不做半安全 workaround。

Acceptance：真实 V3-shaped fixture migration 后 Kraken sync/import/backup 全绿，所有 V3 IDs 与 Ledger facts 不变。


---

# FILE: 06_ALCHEMY_PROVIDER_SPEC_CN.md

# Alchemy Provider Spec

## Credential / endpoint

```text
ALCHEMY_API_KEY
credentialRef = env:alchemy.primary
fixed origin = https://eth-mainnet.g.alchemy.com
```

API key 在 `/v2/<key>` URL path 中，因此绝不能 log full URL / response.url。

不允许用户配置 RPC URL；测试使用 injectable transport，不使用 `ALCHEMY_BASE_URL`。

## Read allowlist

```text
eth_chainId
eth_blockNumber
eth_getBlockByNumber
eth_getBalance
eth_getTransactionByHash
eth_getTransactionReceipt
alchemy_getTokenBalances
alchemy_getTokenMetadata
alchemy_getAssetTransfers
```

首次 sync `eth_chainId` 必须 `0x1`，否则拒绝。

## Current balances

Native：`eth_getBalance(address,"latest")`，hex wei -> bigint。

ERC20：`alchemy_getTokenBalances(address,"erc20",options)`，完整 pageKey；nonzero token 拉 `alchemy_getTokenMetadata`；zero 默认不创建新 observation；token error 不能当 0。

## Activity

分别查询：

```text
fromAddress = wallet
toAddress   = wallet
category = external, internal, erc20
withMetadata = true
excludeZeroValue = false
order = asc
```

完整消费 pageKey；同一 uniqueId 双向出现时 dedupe。

金额算术必须使用 `rawContract.value`；故意构造 human `value` 与 raw 不一致的测试，normalized amount 必须跟 raw。

## Finalized history

用 `eth_getBlockByNumber("finalized", false)` 得 finalized head，Transfers `toBlock` 固定到该 block。Current balance 仍是 latest；UI 明确区分。

首次 history start date -> block：用 `eth_getBlockByNumber` 对 `[0, finalizedHead]` timestamp binary search，最多约 32 次；不引入另一个 vendor API。

后续 cursor：`fromBlock=max(initialStart,lastFinalized-32)`；正确性来自 uniqueId/txHash/stable key，不来自 cursor。

## Tx enrichment

对活动 tx hash 获取 `eth_getTransactionByHash` + `eth_getTransactionReceipt`，生成 `evm_transaction` primary source；Transfers 是 cross_check sources。

## Error

分类：CONFIG/AUTH/CHAIN_MISMATCH/RATE_LIMITED/UPSTREAM/INVALID_PAYLOAD/NETWORK/PAGINATION_EXPIRED。分页任一方向不完整时不持久化 partial activity candidate set、不推进 cursor；旧成功数据保留。

## DB boundary

任何 Alchemy HTTP 时 `sqlite.inTransaction` 必须 false。


---

# FILE: 07_ACTIVITY_AND_GAS_SPEC_CN.md

# Activity Normalization & Gas

## Net movement

按 tx hash 分组，transfer 相对 wallet：

```text
from wallet -> negative
to wallet   -> positive
self        -> net zero
```

按 provider asset key 聚合 exact atomic，最终 0 leg 删除。

分类：

- 1 positive only -> `simple_in`, role `external_in`, suggestion `unknown`；
- 1 negative only -> `simple_out`, role `external_out`, suggestion `unknown`；
- 1 negative A + 1 positive B, A!=B -> `simple_exchange`, roles source/destination, suggestion exchange；
- 3+ nonzero assets / multiple directions -> `complex`, status unsupported；
- no net movement -> no movement candidate。

Failed receipt：movement 不可导入；若 indexed source 与 failed status 冲突，标记 unsupported/source inconsistency。

## Gas candidate

只有 `tx.from == wallet` 才是 fee payer。

Execution fee：

```text
BigInt(gasUsed) * BigInt(effectiveGasPrice)
```

Blob tx 若同时有 `blobGasUsed` + `blobGasPrice`：再加 blob fee。若 blob tx 必要字段缺失，gas status unresolved，不得少记后称 complete。

Gas candidate：

```text
stableKey = evm:1:gas:<txhash>
classification = gas_only
suggested event = expense
one external_out native ETH leg
```

Import 后 V1 Expense：mapped ETH wallet account，payee `Ethereum Network`。

Failed tx 仍可有 exact gas expense。

Gas **不**塞进 movement candidate fee leg，避免 one candidate 创建多 events；movement/gas 在 UI 同 tx hash 分组。

## Import

- simple_in：用户选 Transfer / Income / Ignore；
- simple_out：Transfer / Expense / Ignore；
- simple_exchange：Exchange；
- complex：无 Import button；
- gas：Expense。

所有 import 继续走 existing `createLedgerEventIn(...)` / V1 invariants；provenance 与 candidate status 在同一 `BEGIN IMMEDIATE` 原子提交。


---

# FILE: 08_SECURITY_SPEC_CN.md

# V4 Security Spec

V4 UI/API **只接收 public address**。不存在 private key / mnemonic / seed / keystore / WalletConnect / signing。

`.env.example`：`ALCHEMY_API_KEY=` 空占位；SQLite/backup/client/source payload/logs 都不能保存 key。

扩展 `pnpm security:check`：

- client/persistence/built static 不得出现 `ALCHEMY_API_KEY` 或 sentinel；
- `src/providers/evm` 禁止 JSON-RPC method strings：`eth_sendTransaction`、`eth_sendRawTransaction`、`eth_sign`、`eth_signTransaction`、`eth_signTypedData`、`personal_`、`wallet_`；
- production 不允许 custom RPC URL；
- CI `ALCHEMY_API_KEY=""`，fixture mode 外的 live transport 在 `CI=true` 直接拒绝。

Alchemy key 位于 URL path，所以 provider error/log 只能输出 method/chain/error code，不能输出 request URL。

所有 sync/import/ignore/reconcile/add-wallet mutation route 必须 same-origin。


---

# FILE: 09_BACKUP_V4_SPEC_CN.md

# Backup V4

Export `schemaVersion=4`，继续接受 1/2/3/4。

V4 include：现有 V1/V2/V3 user facts + `externalConnections.sourceKey` + `evmWalletConnections` + `evmBalanceObservationDetails` + `evmCandidateDetails`。

Exclude：`externalConnectionState`、`externalSyncRuns`、`evmWalletConnectionState`、V2 derived cache、Kraken/Alchemy secrets。

V3→V4 in-memory upgrade：所有 Kraken connection `sourceKey=kraken:primary`；V4 arrays `[]`；其他 V3 facts 不变。V1/V2 沿用现有 upgrade 链，不复制第二套旧逻辑。

Validate：

- Kraken：provider/sourceKey/credentialRef 一致；
- EVM：provider=`evm_wallet`、credential=`env:alchemy.primary`、sourceKey 与 chain/address subtype 一致；
- chainId=1/network=eth-mainnet；
- valid lowercase address；
- EVM asset key 格式；
- Kraken connection 只能引用 kraken source types，EVM 只能 evm types；
- candidate stable key namespace；
- raw atomic integer text；
- import link book/connection relationship；
- no secret-like protected fields。

Restore 继续：full validate -> BEGIN IMMEDIATE -> all rows -> FK check -> row-count verify -> COMMIT；后段 V4 failure 必须 V1/V2/V3/V4 全 rollback。


---

# FILE: 10_UI_UX_SPEC_CN.md

# V4 UI / UX

复用 `/sync`，分区显示 Kraken 与 Ethereum Wallets，不另做割裂 app。

Add Wallet：名称、Public Ethereum address、History start date；固定 Ethereum Mainnet；文案明确“不要输入 private key / seed phrase”。

Credential card：Alchemy server env Configured/Missing，不显示 key 前后缀。

Wallet card：label、0x1234…abcd、Current balances、History synced through finalized block、Sync Now。

Asset mapping：native/contract address、symbol、decimals、Talli asset、Talli account；contract address 必须可见，symbol 不作为 identity。

Balance card：on-chain observed / Talli Ledger / difference / observedAt / explicit Reconcile；说明创建 snapshot，不是 income/expense。

Activity 按 tx hash 视觉分组：

```text
Tx 0xabc...
  Movement: 100 USDC -> 0.04 ETH   [Review]
  Network fee: 0.001 ETH           [Review]
```

Complex tx：显示 net movements + source/provenance + `Automatic import unavailable`，只允许 Ignore / 普通 Talli 手工记账。

Imported event detail：Imported from Ethereum、wallet、tx hash、candidate；不依赖 Alchemy 才能打开。

Mobile WebKit 必测无横向 overflow、mapping、tx group、review/provenance。


---

# FILE: 11_TEST_ACCEPTANCE_CN.md

# V4 Test Acceptance

## Regression
V1/V2/V3 Kraken 全部 PASS；任一 Critical regression = NO-GO。

## Migration
- V3 Kraken connection/import/provenance fixture → V4 IDs/facts 原样；`sourceKey=kraken:primary`；FK check empty。
- 多个 EVM wallet 同 `env:alchemy.primary` 可以创建。

## Identity/exactness
- mixed-case address -> lowercase identity；invalid reject；duplicate reject。
- native key `eip155:1/native`。
- 同 symbol 不同 contract identity 不同。
- fake USDC 不 auto-map。
- `eth_getBalance` hex / tokenBalance hex / rawContract.value 全 bigint exact。
- human `value` 故意错误时 normalized 必须按 raw。
- missing decimals / excess precision 不可 import/reconcile。

## Provider
- `eth_chainId != 0x1` reject。
- token pageKey 完整。
- transfers from/to pageKey 完整。
- self-transfer uniqueId dedupe。
- HTTP assert SQLite transaction false。
- static scan 无 write/sign RPC。
- incomplete pagination：activity cursor 不推进、partial candidates 不写。

## Balance
- sync 不改 Ledger/snapshot。
- nonzero ERC20 observation；zero 不覆盖成 0/不删除历史。
- exact difference。
- explicit reconcile only -> snapshot。

## Candidate
- inbound -> simple_in unknown。
- outbound -> simple_out unknown。
- -100 USDC +0.04 ETH -> simple_exchange。
- 3+ assets -> unsupported complex。
- self net zero -> no movement candidate。
- failed tx -> no importable movement。

## Gas
- execution fee exact bigint。
- blob fee included。
- incomplete blob fields -> unresolved。
- inbound no gas candidate。
- failed tx still gas candidate。
- movement + gas are two candidates。

## Idempotency/import
- 10 syncs stable source/candidate count。
- imported re-sync ledger count stable。
- source change after import -> source_changed, Ledger unchanged。
- exchange/gas/simple out import through same V1 writer。
- late provenance failure rolls Ledger event back。

## Backup
schemaVersion4、V1/V2/V3 restore、V4 roundtrip、secrets/cursors excluded、broken EVM relation pre-write reject、late failure full rollback。

## E2E fixture
Desktop：add wallet -> sync -> map ETH+USDC -> resync -> balance/difference -> reconcile -> simple swap movement -> gas candidate -> import both -> provenance -> resync no duplicate -> backup v4。

Mobile：wallet/mapping/tx group/imported state/no overflow。

Final gate：

```text
format:check
lint
typecheck
db:check
unit
integration
build
security:check
e2e
```

Exact final SHA GitHub Actions：Quality & Build success + Playwright E2E success。


---

# FILE: 12_IMPLEMENTATION_PLAN_CN.md

# V4 Implementation Plan

1. **Baseline**：从 v3.0.0 创建 `feat/v4-evm-wallet-sync`，旧 gates green。
2. **Schema generalization**：provider/sourceKey/object types + forward migration + EVM tables；先做 V3 migration/Regression tests。
3. **Domain primitives**：address、asset keys、hex bigint、atomic↔decimal、tx hash/uniqueId。
4. **Alchemy shell/security**：env、fixed origin、method allowlist、chainId、injectable transport、safe error。
5. **Balances**：ETH、ERC20 pagination、metadata、observations。
6. **Activity**：finalized head、history timestamp→block binary search、from/to pagination、tx/receipt enrichment。
7. **Persistence**：source objects、EVM cursor、no Ledger mutation。
8. **Normalizer**：net movement、simple/complex、failed tx。
9. **Gas**：execution/blob fee、separate candidate。
10. **Import**：reuse ExternalImportService/V1 writer，atomic provenance；Kraken regression。
11. **Reconcile**：exact only，explicit snapshot。
12. **Backup v4**：1/2/3/4、validation/roundtrip/rollback。
13. **UI**：wallet/mapping/balance/activity/gas/complex/provenance/mobile。
14. **Security/E2E/CI**：no real Alchemy，all old + V4 tests。
15. **Final audit prep**：输出 final SHA、migration、test counts、CI run、known limitations，交 ChatGPT 独立审计。


---

# FILE: 13_V41_BOUNDARY_CN.md

# V4.1 Boundary

V4.0 production chain registry 只有 Ethereum Mainnet。不要显示假支持的 Base/Arbitrum selector。

V4.1 再做 Base(8453) + Arbitrum One(42161)，开工前必须分别解决：

1. internal native transfer coverage；
2. L2 exact total gas fee；
3. finality/safe semantics；
4. chain-specific provider endpoint；
5. chain-native ETH mapping；
6. bridge UX；
7. chain-specific E2E fixtures。

Base 官方网络费有 L2 execution + L1 security 两部分，所以禁止 V4.0 预先写 `gasUsed*effectiveGasPrice` 的 Base “完整 fee”逻辑。

Bitcoin/Solana 建议留到 V5；不要为了未来 UTXO/Solana 把 V4 EVM provider 抽象成过度通用平台。


---

# FILE: 14_EXTERNAL_API_REFERENCE_20260812_CN.md

# Official API Reference Snapshot — 2026-08-12

实现前可重新核对**官方**文档；不要用第三方博客替代协议事实。

## Alchemy Transfers API
`https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers`

当前：`alchemy_getAssetTransfers` 可查 address history、支持 Ethereum 与多个 L2；internal transfer data 当前明确仅 Ethereum Mainnet + Polygon Mainnet；返回 pageKey；`withMetadata=true` 可提供 timestamp；payload 含 rawContract。

## Token balances
`https://www.alchemy.com/docs/data/token-api/token-api-endpoints/alchemy-get-token-balances`

`alchemy_getTokenBalances` 返回 ERC20 balances；`tokenBalance` 为 hex atomic quantity；支持 pagination options/pageKey。

## Token metadata
`https://www.alchemy.com/docs/reference/token-api-overview`

`alchemy_getTokenMetadata` 提供 decimals/name/symbol；symbol/name 仅 display。

## Native balance
Alchemy standard Ethereum JSON-RPC `eth_getBalance` 返回 wei hex quantity。

## Deprecated/Beta history endpoint
`https://www.alchemy.com/docs/data/beta-apis/beta-api-endpoints/beta-api-endpoints/get-transaction-history-by-address`

当前官方将 `transactions/history/by-address` 标为 Beta / scheduled for deprecation，并建议使用 `alchemy_getAssetTransfers`，所以 V4.0 不把它作为核心依赖。

## Transfers pagination
`https://www.alchemy.com/docs/reference/transfers-api-quickstart`

当前官方说明 pageKey 需继续消费至结束，并有 TTL；V4 activity snapshot 必须完整分页，否则不推进 cursor。

## Base fee boundary (V4.1)
`https://docs.base.org/base-chain/network-information/network-fees`

Base 官方说明 transaction cost 有 L2 execution fee + L1 security fee；V4.1 需专门 fee adapter。

## CI
自动测试不得调用真实 Alchemy；真实 key 不需要放 GitHub Actions Secrets。


---

# FILE: 15_FIXTURES.json

{
  "schemaVersion": 1,
  "chain": {
    "chainId": 1,
    "networkId": "eth-mainnet",
    "chainIdHex": "0x1"
  },
  "wallet": "0x1111111111111111111111111111111111111111",
  "balances": {
    "eth": "0x112210f4768db400",
    "erc20": [
      {
        "contractAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "tokenBalance": "0x3b9aca00",
        "error": null
      }
    ],
    "metadata": {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
        "decimals": 6,
        "name": "USD Coin",
        "symbol": "USDC"
      }
    }
  },
  "tx": {
    "hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "from": "0x1111111111111111111111111111111111111111",
    "to": "0x3333333333333333333333333333333333333333",
    "type": "0x2",
    "value": "0x0",
    "blockNumber": "0x144ff00"
  },
  "receipt": {
    "status": "0x1",
    "gasUsed": "0x5208",
    "effectiveGasPrice": "0x3b9aca00",
    "blobGasUsed": null,
    "blobGasPrice": null
  },
  "transfers": [
    {
      "uniqueId": "tx:erc20:0",
      "hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "category": "erc20",
      "from": "0x1111111111111111111111111111111111111111",
      "to": "0x3333333333333333333333333333333333333333",
      "value": 999999999.0,
      "asset": "USDC",
      "rawContract": {
        "value": "0x5f5e100",
        "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "decimal": "0x6"
      }
    },
    {
      "uniqueId": "tx:internal:0",
      "hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "category": "internal",
      "from": "0x3333333333333333333333333333333333333333",
      "to": "0x1111111111111111111111111111111111111111",
      "value": 0.04,
      "asset": "ETH",
      "rawContract": {
        "value": "0x8e1bc9bf040000",
        "address": null,
        "decimal": "0x12"
      }
    }
  ],
  "expected": {
    "movement": "-100 USDC +0.04 ETH simple_exchange",
    "gas": "separate expense candidate",
    "moneySource": "rawContract.value, not value"
  }
}


---

# FILE: CODEX_HANDOFF_PROMPT.txt

你现在负责 Talli V4。

Repository: wentAInx/Talli
Frozen V3 baseline/tag: 51a7f0c346c10c8bcd4e29261730eee5eb360df5 / v3.0.0
V3 main CI run: 31598308119 (green)

目标：**Talli V4 — EVM Wallet & On-chain Sync**；V4.0 P0 仅 Ethereum Mainnet read-only wallet sync。

先完整阅读任务包 00→15，再检查 baseline。推荐分支 `feat/v4-evm-wallet-sync`。

最高红线：On-chain data != Ledger；Sync 不自动写 Ledger/snapshot；只接受 public address；绝不 private key/mnemonic/sign/write RPC；Alchemy key server-only；money 只用 hex/rawContract.value→bigint；ERC20 identity=chain+contract；complex DeFi 不自动解释；gas 独立 candidate；V4.0 仅 chainId 1；V3 Kraken 必须 regression。

按 `12_IMPLEMENTATION_PLAN_CN.md` 分 Phase，先 migration correctness，再 provider/domain，再 UI。

自动测试禁止真实 Alchemy，使用 injectable transport + deterministic fixture。

最终实际运行：

pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm security:check
pnpm test:e2e

完成后返回 final SHA、migration、test counts、GitHub Actions run、known limitations。不要 merge main/tag/deploy，除非用户另行明确要求。
