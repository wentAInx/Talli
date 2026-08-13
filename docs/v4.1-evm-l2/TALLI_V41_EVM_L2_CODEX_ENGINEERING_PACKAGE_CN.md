# TALLI V4.1 EVM L2 EXPANSION — COMBINED CODEX ENGINEERING PACKAGE

Repository: `wentAInx/Talli`

Frozen V4.0 baseline: `f981e3e0e454f4d7a8ce0111323c9aceebc2483b`

Release tag: `v4.0.0`

Generated: 2026-08-13


---

# FILE: 00_README_CN.md

# Talli V4.1 EVM L2 Expansion — Codex 工程任务包

Repository:

```text
wentAInx/Talli
```

Frozen V4.0 baseline:

```text
f981e3e0e454f4d7a8ce0111323c9aceebc2483b
```

Release tag:

```text
v4.0.0
```

V4.0 main release CI:

```text
Run: 31681253835
Quality & Build: PASS
Playwright E2E: PASS
```

推荐开发分支：

```text
feat/v4.1-evm-l2-sync
```

---

# 1. V4.1 正式名称

> **Talli V4.1 — EVM L2 Expansion**
>
> **Base Mainnet + Arbitrum One Read-only Wallet Sync**

V4.1 不是重新开发钱包同步，而是在 V4.0 已审计的 Ethereum Mainnet
Observation / Source / Candidate / Review / Import / Reconcile 架构上，
增加两条 L2 chain adapter：

```text
Ethereum Mainnet    chainId 1        frozen V4.0
Base Mainnet        chainId 8453     V4.1
Arbitrum One        chainId 42161    V4.1
```

---

# 2. 最高优先级原则

```text
L2 chain data != Ledger
```

继续禁止：

- sync 自动写 ledger_events；
- sync 自动写 ledger_entries；
- sync 自动创建 balance snapshot；
- symbol 自动映射；
- approximate gas 作为 exact；
- bridge 自动跨链匹配；
- private key / mnemonic / signing；
- 自定义 RPC URL；
- live provider CI。

只有：

```text
用户明确 Import
用户明确 Reconcile
```

才允许进入现有 V1 writer / snapshot writer。

---

# 3. V4.1 的关键事实边界

Alchemy `alchemy_getAssetTransfers` 当前支持 Base / Arbitrum，
但 **internal transfer data 只在 Ethereum Mainnet / Polygon Mainnet 提供**。

因此：

```text
Base / Arbitrum historical discovery
= discovery_limited
```

即使 Debug API 可用，也只能对“已经发现的 tx hash”做完整 call trace。
Talli 不得声称整段 L2 历史是 complete。

如果 Alchemy Debug API 不可用：

```text
Current balance sync      可用
ERC20 balance             可用
Reconcile                 可用（exact mapping 后）
L2 movement review/import 禁用
Activity cursor           不推进
```

Alchemy 当前 Free plan 不包含 Debug API；PAYG / Enterprise 包含。
不要在代码中硬编码商业价格，只识别 capability。

---

# 4. 推荐阅读顺序

1. `00_README_CN.md`
2. `01_CODEX_MASTER_INSTRUCTION_CN.md`
3. `02_PRODUCT_ENGINEERING_BRIEF_CN.md`
4. `03_SCOPE_CAPABILITY_DECISION_CN.md`
5. `04_CHAIN_REGISTRY_DOMAIN_SPEC_CN.md`
6. `05_DATABASE_TARGET_SCHEMA_V41_DRAFT.sql`
7. `06_V40_TO_V41_MIGRATION_PLAN_CN.md`
8. `07_TYPES_SERVICE_CONTRACTS.ts`
9. `08_ALCHEMY_MULTI_CHAIN_PROVIDER_SPEC_CN.md`
10. `09_L2_DISCOVERY_AND_TRACE_SPEC_CN.md`
11. `10_BASE_EXACT_FEE_SPEC_CN.md`
12. `11_ARBITRUM_EXACT_FEE_SPEC_CN.md`
13. `12_FINALITY_CURSOR_IDEMPOTENCY_CN.md`
14. `13_BRIDGE_BOUNDARY_CN.md`
15. `14_SECURITY_CAPABILITY_SPEC_CN.md`
16. `15_BACKUP_V5_SPEC_CN.md`
17. `16_UI_UX_SPEC_CN.md`
18. `17_TEST_ACCEPTANCE_CN.md`
19. `18_IMPLEMENTATION_PLAN_CN.md`
20. `19_NON_GOALS_V42_BOUNDARY_CN.md`
21. `20_L2_FIXTURES.json`
22. `21_EXTERNAL_API_REFERENCE_20260813_CN.md`
23. `22_RISK_REGISTER_CN.md`
24. `23_RELEASE_AUDIT_CHECKLIST_CN.md`
25. `CODEX_HANDOFF_PROMPT.txt`

`MANIFEST.tsv` 提供 SHA-256 完整性信息。


---

# FILE: 01_CODEX_MASTER_INSTRUCTION_CN.md

# Codex Master Instruction — Talli V4.1

## A. Frozen baseline

Repository:

```text
wentAInx/Talli
```

V4.0 frozen baseline:

```text
v4.0.0
f981e3e0e454f4d7a8ce0111323c9aceebc2483b
```

开工前：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -10
git tag --points-at HEAD
```

必须从上述 baseline 或用户明确批准的 release-only descendant 开始。

推荐：

```bash
git checkout main
git pull --ff-only
git switch -c feat/v4.1-evm-l2-sync
```

禁止：

- reset V4.0；
- rebase / force push；
- 修改 0000–0005 已发布 migration；
- 重写 V4.0 source identity；
- squash release history。

---

# B. Frozen V1/V2/V3/V4.0 semantics

不得改变：

- persisted money = atomic integer TEXT + domain bigint；
- Account 单一 asset；
- V1 Expense/Income/Transfer/Exchange invariants；
- third-asset fee；
- snapshot/reconciliation semantics；
- balanceAt(snapshot + half-open entries)；
- V2 valuation 为 derived data；
- stablecoin 不假定 1:1；
- V3 Kraken read-only / candidate / provenance / atomic import；
- V4.0 Ethereum public-address-only；
- V4.0 exact raw hex → bigint；
- V4.0 movement/gas two-candidate design；
- explicit Import / Reconcile only；
- backup V1–V4 compatibility。

---

# C. V4.1 hard red lines

1. Production chains only:
   - Ethereum 1
   - Base 8453
   - Arbitrum One 42161

2. All three share:
   ```text
   credentialRef = env:alchemy.primary
   ```

3. Fixed Alchemy origins only:
   ```text
   eth-mainnet.g.alchemy.com
   base-mainnet.g.alchemy.com
   arb-mainnet.g.alchemy.com
   ```

4. No arbitrary RPC URL.

5. No:
   ```text
   eth_sendTransaction
   eth_sendRawTransaction
   eth_sign*
   personal_*
   wallet_*
   ```

6. For Base / Arbitrum, do not request `internal` from Transfers API as if it were supported.

7. L2 native movement must be trace-derived for every discovered tx before movement import is allowed.

8. Transfers API discovery on Base/Arbitrum is always surfaced as:
   ```text
   discovery_limited
   ```

9. Debug unavailable:
   - no L2 movement import;
   - no false “complete history”;
   - no activity cursor advancement.

10. Base total gas must include exact:
    - L2 execution;
    - L1 data/security fee;
    - operator fee when applicable.

11. Arbitrum total gas must use receipt `gasUsedForL1` correctly and must not double count parent fee.

12. No automatic bridge correlation across chains.

13. No chain-specific amount arithmetic through JS number.

---

# D. Allowed read RPC additions

V4.1 may extend the read allowlist with:

```text
debug_traceTransaction
eth_getRawTransactionByHash
eth_call
```

But `eth_call` is server-internal only for fixed, audited Base GasPriceOracle calls.
No UI-supplied target/data.

---

# E. Automated tests

Never call live Alchemy in CI.

Use:

```text
injectable transport
deterministic Base fixture
deterministic Arbitrum fixture
temporary file-backed SQLite
```

Final gate:

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

Do not push / merge / tag unless the user explicitly asks.


---

# FILE: 02_PRODUCT_ENGINEERING_BRIEF_CN.md

# V4.1 Product & Engineering Brief

# 1. 用户能力

V4.1 完成后，用户可以为同一个公开地址分别创建：

```text
Ethereum Mainnet wallet
Base wallet
Arbitrum One wallet
```

地址 identity 按 chain 隔离。

每个 connection 可以：

- current ETH balance；
- current ERC-20 balances；
- exact asset/account mapping；
- observed vs Ledger difference；
- explicit Reconcile；
- finalized historical activity discovery；
- 对已发现 transaction 做 L2 call trace；
- simple movement review/import；
- exact network fee review/import；
- provenance + idempotent resync。

# 2. 历史完整性不是二元假象

Base / Arbitrum：

```text
Transfers API:
  external + erc20 discovery
       ↓
known tx hash
       ↓
debug_traceTransaction
       ↓
完整分析该已发现 tx 内部 native movement
```

但一个地址如果只在某个 tx 的 internal native call 中出现，
且没有其他可被 Transfers API 发现的 external/ERC20 evidence，
该 tx 可能根本不会进入 discovery set。

因此 UI 和数据模型必须明确：

```text
historyCoverage = discovery_limited
```

这不是 error，也不能悄悄标成 complete。

# 3. Capability

Alchemy Debug API：

```text
trace_available
trace_unavailable
unknown
```

`trace_unavailable` 时：

- balances 继续；
- balance reconcile 继续；
- movement activity 不落可导入 candidate；
- activity cursor 不推进；
- UI 明确要求具备 Debug API capability 才开启 reviewed L2 activity。

# 4. Candidate policy

对已 trace-complete 的 discovered tx：

```text
1 positive asset
→ simple_in / unknown

1 negative asset
→ simple_out / unknown

1 negative A + 1 positive B
→ simple_exchange

3+ nonzero assets
→ complex / unsupported
```

和 V4.0 一样，不自动 Income/Expense。

Gas candidate 独立。

# 5. Bridge

Bridge tx 可以作为链上 source/candidate 出现，
但：

```text
Ethereum tx
Base tx
Arbitrum tx
```

永远是三个独立事实。

V4.1 不基于：

- tx hash；
- retryable ticket；
- message nonce；
- gateway event；
- 相近时间/金额

自动合并为跨链 Transfer。

用户可以在 Review 中明确选择 Talli Transfer。


---

# FILE: 03_SCOPE_CAPABILITY_DECISION_CN.md

# V4.1 Scope & Capability Decision

# Production scope

```text
Ethereum Mainnet  1
Base Mainnet      8453
Arbitrum One      42161
```

Ethereum 行为是 frozen regression。

# L2 activity discovery

## Provider fact

Alchemy Transfers API 当前：

```text
Base supported
Arbitrum supported
internal transfer data:
Ethereum Mainnet + Polygon Mainnet only
```

所以 Base / Arbitrum 不得设置：

```text
category = ["external","internal","erc20"]
```

正确：

```text
category = ["external","erc20"]
```

## Native internal movement

对 discovered tx：

```text
debug_traceTransaction(
  txHash,
  {
    tracer: "callTracer",
    tracerConfig: { onlyTopCall: false }
  }
)
```

Trace 是该 transaction 的 native movement authority。

Transfers `external` native row 在 L2 仅做 discovery/cross-check，
不能和 trace root 再加一次，避免 double count。

ERC-20 仍以 Transfer logs / Transfers API 为 authority。

# Capability matrix

| Chain | Balance | ERC20 | Native internal movement | Historical coverage |
|---|---|---|---|---|
| Ethereum | V4.0 | V4.0 | Transfers internal | complete（按 V4.0 contract） |
| Base | yes | yes | Debug on discovered tx | discovery_limited |
| Arbitrum | yes | yes | Debug on discovered tx | discovery_limited |

# Free/PAYG boundary

Alchemy 当前 Debug API：

```text
Free: unavailable
PAYG: available
Enterprise: available
```

产品不能把 plan 名称写成业务 invariant，
只检测 capability。

没有 Debug：

```text
balances = available
activity movement = disabled
activity cursor = unchanged
overall sync = partial / balance_only
```

# Arbitrum historical boundary

Alchemy 当前 `arbtrace_*` 只支持 pre-Nitro，
post-Nitro 官方建议使用 Geth `debug_*`。

V4.1 不实现 legacy `arbtrace_*` adapter。

若用户 historyStartAt 对应到 pre-Nitro block：

- balance 仍可正常同步；
- activity effective start 必须明确 clamp 到 Nitro-era supported boundary，
  或直接标记 earlier activity unsupported；
- UI 必须显示范围；
- 不得声称 pre-Nitro history complete。

# No webhook

Alchemy Address Activity webhook 当前可覆盖 Base/Arbitrum internal transfers，
但 V4.1 不引入 webhook/server exposure/background collector。

未来 V4.2 可单独研究 future-event completeness。


---

# FILE: 04_CHAIN_REGISTRY_DOMAIN_SPEC_CN.md

# EVM Chain Registry & Domain Spec

# 1. Chain IDs

```ts
type EvmChainId = 1 | 8453 | 42161;
```

Registry：

```text
1
networkId      eth-mainnet
displayName    Ethereum Mainnet
origin         https://eth-mainnet.g.alchemy.com
native         ETH / 18
feeModel       ethereum
coverage       complete

8453
networkId      base-mainnet
displayName    Base
origin         https://base-mainnet.g.alchemy.com
native         ETH / 18
feeModel       base_op_stack
coverage       discovery_limited

42161
networkId      arb-mainnet
displayName    Arbitrum One
origin         https://arb-mainnet.g.alchemy.com
native         ETH / 18
feeModel       arbitrum_nitro
coverage       discovery_limited
```

# 2. Identity

Source key：

```text
eip155:<chainId>:<lowercase-wallet>
```

Native asset：

```text
eip155:<chainId>/native
```

ERC20：

```text
eip155:<chainId>/erc20:<lowercase-contract>
```

Candidate：

```text
evm:<chainId>:movement:<txhash>
evm:<chainId>:gas:<txhash>
```

不得保留任何硬编码 `evm:1:` helper 给新链复用。

# 3. Same address on multiple chains

合法：

```text
8453 + 0xabc...
42161 + 0xabc...
1 + 0xabc...
```

唯一性：

```text
(chain_id, address_lower)
```

同链重复地址拒绝。

# 4. Mapping

外部 asset identity 始终包含 chain。

例如 Base USDC 和 Arbitrum USDC 可以都由用户明确映射到：

```text
Talli asset = USDC
```

但不能因为 symbol 都是 USDC 自动完成。

每个 chain connection 的 asset/account mapping 独立。

# 5. Native ETH

经济资产可以映射到同一个 Talli `ETH` asset，
但 Talli accounts 必须独立，例如：

```text
Ethereum Main Wallet · ETH
Base Main Wallet · ETH
Arbitrum Main Wallet · ETH
```

# 6. Chain assertion

每次 provider sync 首先：

```text
eth_chainId
```

必须等于 chain registry expected hex。

Mismatch：

```text
CHAIN_MISMATCH
```

拒绝所有事实落库。


---

# FILE: 05_DATABASE_TARGET_SCHEMA_V41_DRAFT.sql

-- Talli V4.1 target EVM schema excerpt.
-- Documentation/reference only; Codex must implement a forward migration
-- against the real V4.0 schema. Do NOT apply this file blindly.

CREATE TABLE evm_wallet_connections (
  connection_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_connections(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  network_id TEXT NOT NULL,
  address_lower TEXT NOT NULL,
  address_display TEXT NOT NULL,
  data_provider TEXT NOT NULL CHECK (data_provider = 'alchemy'),
  history_start_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(chain_id, address_lower),
  CHECK (
    (chain_id = 1 AND network_id = 'eth-mainnet')
    OR (chain_id = 8453 AND network_id = 'base-mainnet')
    OR (chain_id = 42161 AND network_id = 'arb-mainnet')
  )
);

CREATE TABLE evm_wallet_connection_state (
  connection_id TEXT PRIMARY KEY NOT NULL
    REFERENCES evm_wallet_connections(connection_id) ON DELETE CASCADE,
  last_finalized_block_text TEXT,
  last_balance_sync_at TEXT,
  last_activity_sync_at TEXT,
  trace_capability_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (trace_capability_status IN ('unknown','trace_available','trace_unavailable')),
  trace_checked_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE evm_balance_observation_details (
  observation_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_balance_observations(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL CHECK (chain_id IN (1,8453,42161)),
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('native','erc20')),
  contract_address_lower TEXT,
  raw_amount_atomic_text TEXT NOT NULL,
  token_decimals INTEGER
    CHECK (token_decimals IS NULL OR (token_decimals >= 0 AND token_decimals <= 255)),
  sync_head_block_text TEXT,
  CHECK (
    (asset_kind='native' AND contract_address_lower IS NULL AND token_decimals=18)
    OR
    (asset_kind='erc20' AND contract_address_lower IS NOT NULL)
  )
);

CREATE TABLE evm_candidate_details (
  candidate_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL CHECK (chain_id IN (1,8453,42161)),
  tx_hash TEXT NOT NULL,
  candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('movement','gas')),
  classification TEXT NOT NULL
    CHECK (classification IN (
      'simple_in','simple_out','simple_exchange',
      'gas_only','complex','unsupported'
    )),
  tx_status TEXT NOT NULL CHECK (tx_status IN ('success','failed','unknown')),
  block_number_text TEXT,
  block_timestamp TEXT,
  from_address_lower TEXT NOT NULL,
  to_address_lower TEXT,
  gas_fee_atomic_text TEXT,
  gas_fee_status TEXT NOT NULL
    CHECK (gas_fee_status IN ('exact','not_applicable','unresolved')),
  native_trace_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (native_trace_status IN (
      'not_required','exact','trace_unavailable','trace_invalid'
    )),
  UNIQUE(chain_id, tx_hash, candidate_kind)
);

-- User-visible, lossless L2 fee provenance. Included in backup schemaVersion 5.
-- Ethereum V4.0 gas candidates do not require rows here.
CREATE TABLE evm_l2_gas_fee_details (
  candidate_id TEXT PRIMARY KEY NOT NULL
    REFERENCES external_transaction_candidates(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL CHECK (chain_id IN (8453,42161)),
  fee_model TEXT NOT NULL
    CHECK (fee_model IN ('base_op_stack','arbitrum_nitro')),
  execution_fee_atomic_text TEXT,
  parent_data_fee_atomic_text TEXT,
  operator_fee_atomic_text TEXT,
  total_fee_atomic_text TEXT,
  fee_status TEXT NOT NULL CHECK (fee_status IN ('exact','unresolved')),
  evidence_json TEXT NOT NULL,
  CHECK (
    (chain_id=8453 AND fee_model='base_op_stack')
    OR
    (chain_id=42161 AND fee_model='arbitrum_nitro')
  ),
  CHECK (
    (fee_status='exact'
      AND execution_fee_atomic_text IS NOT NULL
      AND parent_data_fee_atomic_text IS NOT NULL
      AND total_fee_atomic_text IS NOT NULL)
    OR
    (fee_status='unresolved' AND total_fee_atomic_text IS NULL)
  ),
  CHECK (
    (chain_id=8453 AND (
      (fee_status='exact' AND operator_fee_atomic_text IS NOT NULL)
      OR fee_status='unresolved'
    ))
    OR
    (chain_id=42161 AND operator_fee_atomic_text IS NULL)
  )
);


---

# FILE: 06_V40_TO_V41_MIGRATION_PLAN_CN.md

# V4.0 → V4.1 Forward Migration Plan

# 1. 已发布 migrations frozen

禁止修改：

```text
0000
0001
0002
0003
0004_v4_evm_wallet_sync
0005_quiet_betty_brant
```

V4.1 从新 migration 开始，例如：

```text
0006_v41_evm_l2_expansion
```

名字以实际 drizzle-kit 结果为准。

# 2. 需要 generalize 的 CHECK

V4.0 三处 chain=1：

```text
evm_wallet_connections
evm_balance_observation_details
evm_candidate_details
```

V4.1 允许：

```text
1
8453
42161
```

`evm_wallet_connections` 还必须校验 chain/network pair。

# 3. Operational state

`evm_wallet_connection_state` 增加：

```text
trace_capability_status
trace_checked_at
```

这些字段：

```text
operational
excluded from backup
```

# 4. L2 fee detail table

新增：

```text
evm_l2_gas_fee_details
```

只服务 Base / Arbitrum。

不要强迫迁移旧 V4.0 Ethereum gas candidate。
旧 Ethereum provenance 继续按 V4.0 解释。

# 5. Rebuild discipline

如需 SQLite table rebuild：

1. `PRAGMA foreign_keys=OFF` 在 transaction 外；
2. `BEGIN IMMEDIATE`；
3. create target temp；
4. copy exact old rows；
5. row-count guard；
6. drop/rename；
7. recreate indexes/checks；
8. create L2 table / state columns；
9. COMMIT；
10. `PRAGMA foreign_keys=ON`；
11. `PRAGMA foreign_key_check` 必须 `[]`。

Migration failure 必须 rollback。

# 6. Identity preservation

V4.0 Ethereum rows必须 byte-for-byte 保留业务字段：

```text
chainId=1
networkId=eth-mainnet
sourceKey=eip155:1:<address>
asset keys
candidate stable keys
source IDs
candidate IDs
import links
Ledger IDs
```

# 7. Acceptance

V4.0-shaped DB 升级后：

```text
Ethereum V4 E2E PASS
Kraken V3 PASS
foreign_key_check=[]
```

并验证同一 address 可以新增：

```text
Base 8453
Arbitrum 42161
```

但同链 duplicate 拒绝。


---

# FILE: 07_TYPES_SERVICE_CONTRACTS.ts

export type EvmChainId = 1 | 8453 | 42161;

export type EvmNetworkId =
  | "eth-mainnet"
  | "base-mainnet"
  | "arb-mainnet";

export type EvmFeeModel =
  | "ethereum"
  | "base_op_stack"
  | "arbitrum_nitro";

export type EvmHistoryCoverage =
  | "complete"
  | "discovery_limited";

export type EvmTraceCapability =
  | "unknown"
  | "trace_available"
  | "trace_unavailable";

export interface EvmChainConfig {
  chainId: EvmChainId;
  chainIdHex: "0x1" | "0x2105" | "0xa4b1";
  networkId: EvmNetworkId;
  displayName: string;
  alchemyOrigin:
    | "https://eth-mainnet.g.alchemy.com"
    | "https://base-mainnet.g.alchemy.com"
    | "https://arb-mainnet.g.alchemy.com";
  nativeSymbol: "ETH";
  nativeDecimals: 18;
  feeModel: EvmFeeModel;
  historyCoverage: EvmHistoryCoverage;
  requiresDebugForMovement: boolean;
}

export interface EvmWalletIdentity {
  chainId: EvmChainId;
  addressLower: string;
  sourceKey: string; // eip155:<chain>:<address>
}

export interface EvmCallTraceFrame {
  path: string; // e.g. "0", "0.1", deterministic local trace path
  type: "CALL" | "CREATE" | "CREATE2" | "SELFDESTRUCT";
  fromAddressLower: string;
  toAddressLower: string | null;
  valueAtomicText: string;
  reverted: boolean;
}

export interface EvmTraceProjection {
  status: "exact";
  frames: EvmCallTraceFrame[];
}

export interface EvmBalanceIssue {
  code: "TOKEN_BALANCE_UNAVAILABLE";
  providerAssetKey: string | null;
  message: string;
}

export interface EvmActivityCapability {
  traceCapability: EvmTraceCapability;
  historyCoverage: EvmHistoryCoverage;
  activityStatus:
    | "complete"
    | "trace_unavailable"
    | "unsupported_history";
}

export interface L2GasFeeBreakdown {
  chainId: 8453 | 42161;
  feeModel: "base_op_stack" | "arbitrum_nitro";
  status: "exact" | "unresolved";
  executionFeeAtomicText: string | null;
  parentDataFeeAtomicText: string | null;
  operatorFeeAtomicText: string | null;
  totalFeeAtomicText: string | null;
  evidenceJson: string;
}

export interface EvmReceiptRecord {
  txHash: string;
  statusHex: string | null;
  gasUsedHex: string | null;
  effectiveGasPriceHex: string | null;
  blobGasUsedHex: string | null;
  blobGasPriceHex: string | null;
  gasUsedForL1Hex: string | null; // Arbitrum extension
  blockNumberText: string | null;
}

export interface EvmEnrichedTransaction {
  transaction: {
    txHash: string;
    fromAddressLower: string;
    toAddressLower: string | null;
    typeHex: string | null;
    valueHex: string;
    blockNumberText: string | null;
  };
  receipt: EvmReceiptRecord;
  nativeTrace: EvmTraceProjection | null;
  l2GasFee: L2GasFeeBreakdown | null;
}

export interface EvmSyncSnapshotV41 {
  chainId: EvmChainId;
  balanceObservedAt: string;
  syncCompletedAt: string;
  addressLower: string;
  syncHeadBlockText: string;
  finalizedBlockText: string | null;
  balanceComplete: boolean;
  balanceIssues: EvmBalanceIssue[];
  activityCapability: EvmActivityCapability;
  balances: unknown[];     // reuse existing V4 EvmBalanceRecord
  transfers: unknown[];    // reuse existing V4 EvmTransferRecord
  transactions: EvmEnrichedTransaction[];
}

/*
Required helper semantics:

evmWalletSourceKey(chainId,address)
  -> eip155:<chainId>:<address>

evmNativeAssetKey(chainId)
  -> eip155:<chainId>/native

evmErc20AssetKey(chainId,contract)
  -> eip155:<chainId>/erc20:<contract>

evmMovementStableKey(chainId,txHash)
evmGasStableKey(chainId,txHash)

No chain-1 implicit defaults in business paths.
*/

export interface EvmChainFeeAdapter {
  calculate(input: {
    chain: EvmChainConfig;
    transaction: EvmEnrichedTransaction["transaction"];
    receipt: EvmReceiptRecord;
  }): Promise<L2GasFeeBreakdown | null>;
}

/*
For Base, the fee adapter may perform fixed server-side eth_call to
GasPriceOracle and eth_getRawTransactionByHash.

For Arbitrum, fee decomposition is pure from receipt fields.

No adapter may broadcast or sign.
*/


---

# FILE: 08_ALCHEMY_MULTI_CHAIN_PROVIDER_SPEC_CN.md

# Alchemy Multi-chain Provider Spec

# 1. One credential, fixed origins

继续：

```text
ALCHEMY_API_KEY
credentialRef = env:alchemy.primary
```

Chain registry 决定 origin：

```text
1     https://eth-mainnet.g.alchemy.com
8453  https://base-mainnet.g.alchemy.com
42161 https://arb-mainnet.g.alchemy.com
```

DB/UI 不能覆盖 origin。

# 2. Read allowlist

保留 V4.0：

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

V4.1 增加：

```text
debug_traceTransaction
eth_getRawTransactionByHash   # Base exact L1 fee only
eth_call                      # Base GasPriceOracle only
```

业务层不得传任意 method string。

# 3. Chain assertion

每个 connection 每轮：

```text
eth_chainId == registry.chainIdHex
```

Base：

```text
0x2105
```

Arbitrum：

```text
0xa4b1
```

Mismatch fail closed。

# 4. Balance

三条链继续同一 exact pipeline：

```text
eth_getBalance(latest)
alchemy_getTokenBalances
alchemy_getTokenMetadata
hex -> bigint
```

row-level token errors保持 V4.0 partial behavior。

# 5. Finalized history

获取：

```text
eth_getBlockByNumber("finalized", false)
```

取 numeric finalized block。

Transfers API 仍传：

```text
toBlock = exact finalized block hex
```

Current balance 使用 `latest`。

# 6. Transfer categories

Ethereum regression：

```text
external
internal
erc20
```

Base / Arbitrum：

```text
external
erc20
```

绝不能因为共享 provider helper 将 `internal` 加回 L2。

# 7. Trace capability

对 discovered Base/Arbitrum tx：

```text
debug_traceTransaction
callTracer
onlyTopCall=false
```

如果 provider 明确表明 Debug capability 不可用：

```text
traceCapability = trace_unavailable
activityStatus = trace_unavailable
```

本轮：

- 不保存 activity candidate/source partial snapshot；
- 不推进 activity finalized cursor；
- balance facts 可以保存；
- UI 显示 balance-only。

Rate limit / network / malformed trace 不得伪装成 plan unavailable；
按 transient/error 处理。

# 8. Alchemy Debug response compatibility

当前文档可能返回：

```text
direct call frame
```

或包装为：

```json
[
  {
    "name": "transaction trace",
    "value": { "...call frame..." }
  }
]
```

parser 可以明确支持当前官方形态，
但 unknown shape 必须 fail closed。

# 9. No provider I/O in DB tx

所有：

```text
Transfers
Debug
Raw tx
GasPriceOracle eth_call
```

都必须在 SQLite write transaction 外。

Tests 必须用 injected transport assert。


---

# FILE: 09_L2_DISCOVERY_AND_TRACE_SPEC_CN.md

# L2 Discovery & Native Trace Spec

# 1. Discovery limitation

Base / Arbitrum 的 activity discovery：

```text
alchemy_getAssetTransfers(external,erc20)
```

只负责找 known tx hashes / ERC20 logs / top-level evidence。

它不是完整的 internal-native historical index。

永久 product label：

```text
historyCoverage = discovery_limited
```

# 2. Trace authority

对于每个 discovered tx：

```text
debug_traceTransaction(callTracer)
```

sanitized projection 是 native ETH movement authority。

不要同时：

```text
Alchemy external ETH
+
trace root ETH
```

相加。

否则 top-level value 会 double count。

# 3. ERC20 authority

ERC20 movement：

```text
Alchemy Transfers ERC20 rawContract.value
```

继续为 authority。

Trace 不从 calldata 猜 ERC20。

# 4. Safe call-frame projection

只保留审计所需字段：

```text
path
type
from
to
value
reverted
```

不要持久化：

```text
input
output
memory
storage
full opcode trace
```

避免 backup 爆炸。

# 5. Counted native frame types

允许真正的 value movement：

```text
CALL
CREATE
CREATE2
SELFDESTRUCT / SUICIDE（normalize 为 SELFDESTRUCT）
```

明确不计：

```text
DELEGATECALL
STATICCALL
CALLCODE
```

因为它们不代表不同账户间的真实 ETH value transfer。

# 6. Revert propagation

如果 receipt failed：

```text
all native movement = non-importable / zero committed movement
gas can remain
```

如果某 ancestor call frame reverted：

```text
descendants 不得计入 balance movement
```

即使 child frame 本身没带 error。

Trace normalization 必须传播 ancestor failure。

# 7. Net movement

对 wallet relative net：

```text
from wallet -> negative
to wallet   -> positive
```

native trace + ERC20 logs 按 provider asset key bigint aggregate。

0 legs 删除。

然后复用 V4 movement classification。

# 8. Trace unavailable

发现 tx 但 trace capability 不可用：

```text
movement candidate 不生成可导入版本
```

本轮推荐整个 L2 activity snapshot不持久化/不推进 cursor，
而不是留下一个看似完整的 transfer-only candidate。

# 9. Historical completeness warning

即使所有 discovered tx 都 trace exact：

```text
historyCoverage remains discovery_limited
```

原因：可能存在 wallet 只在 internal native call 中出现，
该 tx 没有 external/ERC20 discovery evidence。

Balance reconciliation 可以帮助暴露这种遗漏，
但不能自动创建 transaction。

# 10. Arbitrum pre-Nitro

V4.1 不实现 legacy `arbtrace_*`。

官方 Alchemy 当前说明：

```text
arbtrace_* pre-Nitro only
post-Nitro use Geth debug_*
```

如果 history window 穿过不支持区间，
UI 必须显示实际 activity coverage start。


---

# FILE: 10_BASE_EXACT_FEE_SPEC_CN.md

# Base Exact Network Fee Spec

# 1. Fee components

Base sequenced user transaction：

```text
total =
L2 execution fee
+
L1 data/security fee
+
operator fee (when active; may be zero)
```

所有值 wei bigint。

# 2. Execution

```text
execution =
BigInt(receipt.gasUsed)
*
BigInt(receipt.effectiveGasPrice)
```

# 3. L1 data/security — historical GasPriceOracle

GasPriceOracle：

```text
0x420000000000000000000000000000000000000F
```

不要自己重写 Fjord/Ecotone fee formula。

流程：

1. `eth_getRawTransactionByHash(txHash)`
   得完整 raw RLP；
2. 对 **transaction block number** 做 historical `eth_call`：
   ```text
   GasPriceOracle.getL1Fee(rawSerializedTx)
   ```
3. ABI decode uint256 → bigint。

Base 官方当前说明：

```text
getL1Fee(bytes)
= exact L1 fee for fully serialized RLP transaction
```

Historical block call 很重要：
不同 fork 的 GPO implementation/state 自动匹配当时规则。

# 4. Operator fee

Isthmus mainnet activation：

```text
2025-05-09 16:00:01 UTC
```

Jovian mainnet activation：

```text
2025-12-02 16:00:01 UTC
```

不要在 Talli 本地实现两个 fork 公式作为 source of truth。

推荐：

```text
pre-Isthmus:
operator = 0

post-Isthmus:
historical eth_call at tx block:
GasPriceOracle.getOperatorFee(receipt.gasUsed)
```

由于 historical GPO code/state 对应当时 fork，
Isthmus/Jovian 公式差异由链自身处理。

# 5. Exact total

只有三部分都 exact：

```text
total = execution + l1Data + operator
feeStatus = exact
```

任一：

- raw tx missing；
- historical eth_call unavailable；
- ABI response invalid；
- gas fields invalid；

则：

```text
feeStatus = unresolved
total = null
gas candidate not importable
```

不能降级成 `execution only` 后仍叫 total。

# 6. Deposit transaction

Base type：

```text
0x7e
```

是 L1→L2 deposited transaction。

官方协议说明 deposits 在 L1 买 L2 gas，
且不按普通 sequenced transaction 收 operator fee。

V4.1 对 type 0x7e：

```text
不生成普通 user network-fee candidate
```

Bridge movement source仍可显示，但桥接语义不自动匹配。

# 7. ABI

只需要固定、audited ABI：

```solidity
getL1Fee(bytes) returns (uint256)
getOperatorFee(uint256) returns (uint256)
```

不要引入任意 contract-call UI。

如果实现 minimal ABI encoder：

- selector 必须来自 Ethereum Keccak-256，不是 NIST SHA3-256；
- dynamic bytes padding/offset 必须有 fixture test；
- uint256 decode 必须 bigint；
- fixture 与官方 GasPriceOracle ABI 交叉验证。

# 8. Provenance

`evm_l2_gas_fee_details`：

```text
feeModel = base_op_stack
execution
parentData
operator
total
evidenceJson
```

evidenceJson 建议保存：

```text
txHash
blockNumber
txType
gasUsedHex
effectiveGasPriceHex
rawTxHash/length
getL1FeeResultHex
getOperatorFeeResultHex / preIsthmusZero
GasPriceOracle address
```

不要把完整 raw tx 重复塞 backup，除非实现确有需要。


---

# FILE: 11_ARBITRUM_EXACT_FEE_SPEC_CN.md

# Arbitrum One Exact Network Fee Spec

# 1. Chain

```text
Arbitrum One
chainId 42161
0xa4b1
Nitro Rollup
```

# 2. Official fee model

用户 transaction fee 有：

```text
parent-chain posting component
+
child-chain execution/resource component
```

Arbitrum receipt 增加：

```text
gasUsedForL1
```

它表示 parent-chain component，
但单位是 child-chain gas units。

# 3. Exact decomposition

要求：

```text
gasUsed        = BigInt(receipt.gasUsed)
gasUsedForL1   = BigInt(receipt.gasUsedForL1)
price          = BigInt(receipt.effectiveGasPrice)
```

验证：

```text
0 <= gasUsedForL1 <= gasUsed
```

然后：

```text
total =
gasUsed * price

parentData =
gasUsedForL1 * price

execution =
(gasUsed - gasUsedForL1) * price
```

必须验证：

```text
execution + parentData == total
```

注意：

```text
不要 total + parentData
```

否则 double count。

Arbitrum Nitro 源码测试也以：

```text
gasUsedForL2 = gasUsed - gasUsedForL1
```

拆分。

# 4. Missing extension

如果：

```text
gasUsedForL1 missing
invalid
> gasUsed
```

则：

```text
feeStatus = unresolved
gas candidate not importable
```

不要假定 0。

# 5. Delayed inbox / custom L1→L2 types

Arbitrum 自定义 transaction type 包含：

```text
100 deposit
101 unsigned
102 contract
104 retry
105 submit retryable
106 internal
```

这些 L1-origin / ArbOS-specific 类型具有不同 fee/bridge 语义。

V4.1：

- 可以保存实际 movement source；
- 不自动 bridge-match；
- **不生成普通 direct-user gas candidate**，除非以后有专门审计过的 adapter。

Normal user direct Arbitrum transactions（Ethereum-style types）才走上述 gas candidate。

# 6. Provenance

```text
feeModel = arbitrum_nitro
execution
parentData
operator = null
total
```

evidence：

```text
gasUsedHex
gasUsedForL1Hex
effectiveGasPriceHex
txType
blockNumber
```

# 7. No parent-L1 future-cost recomputation

不要用：

```text
current Ethereum gas price
compressed tx size
```

重新推导历史用户实际 fee。

Talli 记录的是 transaction 当时被 ArbOS 收取的 receipt fee。


---

# FILE: 12_FINALITY_CURSOR_IDEMPOTENCY_CN.md

# Finality, Cursor & Idempotency

# 1. Current balance

三链：

```text
latest
```

余额 observation 明确标记 current fetch time。

# 2. Activity

只处理 numeric finalized head：

```text
eth_getBlockByNumber("finalized", false)
```

Base 官方把 finalized L2 head与 finalized L1 data绑定；
普通交易不等于 7-day withdrawal challenge。

Arbitrum sequencer soft confirmation也不等于 parent-chain finality。

# 3. Cursor per connection

现有：

```text
last_finalized_block_text
```

继续 per chain connection 使用。

下一轮：

```text
fromBlock=max(historyStartBlock,lastFinalized-32)
```

32-block overlap 是 buffer，
idempotency 才是 correctness。

# 4. L2 activity cursor rules

只有：

```text
Transfers pages complete
+
all required tx/receipt complete
+
Debug capability available
+
required traces complete
+
fee evidence complete or explicitly unresolved per candidate
```

activity snapshot 才可进入 persistence。

如果 Debug capability 不可用：

```text
cursor 不推进
activity sources/candidates 不提交
balances 可提交
run partial/balance_only
```

如果 transfer pagination expired：

```text
activity 全部不提交
cursor 不推进
```

# 5. Source identity

继续：

```text
(connection, evm_transaction, txHash)
(connection, evm_transfer, Alchemy uniqueId)
```

不新增 full trace source type；
sanitized native trace projection进入 `evm_transaction.payload_json`，
因此 source fingerprint 覆盖 trace evidence。

# 6. Candidate key

```text
evm:<chainId>:movement:<txHash>
evm:<chainId>:gas:<txHash>
```

同 hash 在不同链不会冲突。

# 7. Resync

10 次相同 sync：

```text
source count stable
candidate count stable
import link stable
ledger events stable
observations append-only
```

# 8. Source change

before import：

```text
re-normalize
```

after import：

```text
candidate -> source_changed
Ledger unchanged
```

保持 V4.0。


---

# FILE: 13_BRIDGE_BOUNDARY_CN.md

# Cross-chain Bridge Boundary

# 1. 不自动关联

V4.1 不做：

```text
Ethereum outbound
↔ Base inbound

Ethereum outbound
↔ Arbitrum retryable/inbound

Base withdrawal
↔ Ethereum claim

Arbitrum withdrawal
↔ Ethereum outbox
```

即使：

- 金额一样；
- 地址一样；
- 时间接近；
- provider metadata 看起来像 bridge；
- tx/message 有协议关联 ID；

也不自动创建跨链 Transfer。

# 2. 为什么

Bridge 可能涉及：

- canonical bridge；
- third-party bridge；
- wrapping；
- gateway；
- mint/burn representation；
- retryable；
- delayed settlement；
- different token contracts；
- fees on multiple chains。

一轮 V4.1 不应把这些协议语义塞进 generic movement normalizer。

# 3. 用户行为

每链候选独立展示。

用户可以：

```text
明确选择 Transfer
```

并选择同资产的另一个 Talli account。

现有 V1 Transfer invariant 负责正确性。

# 4. No auto reconciliation

Bridge 造成 wallet/Talli 差异：

```text
显示 difference
```

不自动 snapshot。

# 5. Future

自动 bridge linking 留到独立版本，
必须 chain-specific protocol adapter + explicit review。


---

# FILE: 14_SECURITY_CAPABILITY_SPEC_CN.md

# Security & Capability Spec

# 1. Wallet secrets

仍然只有：

```text
public address
```

绝不：

- private key；
- mnemonic；
- seed phrase；
- keystore；
- WalletConnect；
- sign；
- send。

# 2. Provider secret

```text
ALCHEMY_API_KEY
```

server-only。

同一个 key 可服务 3 个 chain origins。

# 3. Fixed origins

只有 registry 常量可以构造 URL。

不能把：

```text
origin
rpcUrl
host
scheme
```

作为 DB/user input。

# 4. Secret in URL

Alchemy key 位于 `/v2/<key>`。

禁止 log：

- URL；
- response.url；
- fetch exception with raw URL；
- request object。

# 5. Read method allowlist

增加：

```text
debug_traceTransaction
eth_getRawTransactionByHash
eth_call
```

security:check 仍禁止：

```text
eth_sendTransaction
eth_sendRawTransaction
eth_sign
eth_signTransaction
eth_signTypedData
personal_
wallet_
```

# 6. eth_call scope

`eth_call` 只允许 Base fee adapter：

```text
to = 0x420...000F
method = getL1Fee/getOperatorFee
block = transaction block
```

业务 route/UI 不得传任意 contract/data。

# 7. Debug capability

Provider paywall不是 financial error。

安全状态：

```text
trace_unavailable
```

不能记录 Alchemy 原始付费/credential error payload。

UI 用安全文案：

```text
Alchemy Debug API unavailable for reviewed L2 activity.
Balance sync remains available.
```

# 8. CI

CI：

```text
ALCHEMY_API_KEY=""
```

fixture-only。

新增静态检查：

- Base/Arbitrum origins只在 server chain registry；
- no write/sign；
- no raw API key in static bundle；
- no arbitrary RPC env var。


---

# FILE: 15_BACKUP_V5_SPEC_CN.md

# Backup SchemaVersion 5

# 1. Version

V4.1 export：

```text
schemaVersion = 5
```

接受：

```text
1 / 2 / 3 / 4 / 5
```

# 2. Include

继续所有 V1–V4 user facts。

V5 新增：

```text
evmL2GasFeeDetails
```

以及 V4 arrays 现在允许：

```text
chainId 1 / 8453 / 42161
networkId eth-mainnet / base-mainnet / arb-mainnet
```

# 3. Exclude

继续排除：

```text
externalConnectionState
externalSyncRuns
evmWalletConnectionState
price cache/state
```

所以：

```text
trace capability
activity cursor
```

都不进 backup。

Secrets 永远不进：

```text
ALCHEMY_API_KEY
```

# 4. V4 → V5 upgrade

V4 payload：

- 所有 Ethereum rows原样；
- `evmL2GasFeeDetails=[]`；
- 不生成 Base/Arbitrum；
- 不改变 source/candidate/import IDs。

# 5. V1–V3

沿用现有链式 upgrade：

```text
V1 -> V2 -> V3 -> V4 -> V5
```

不要重新实现旧 schema parser。

# 6. Validation

## Wallet chain pair

只接受：

```text
1      eth-mainnet
8453   base-mainnet
42161  arb-mainnet
```

sourceKey 必须：

```text
eip155:<chainId>:<addressLower>
```

## Asset

provider asset key 的 chain 必须与 wallet chain一致。

## Candidate

stableKey 中 chain 必须与 evmCandidateDetail.chainId一致。

## L2 fee detail

只允许 candidate：

```text
candidateKind=gas
chain=8453 or 42161
```

Base：

```text
feeModel=base_op_stack
operator field required when exact
```

Arbitrum：

```text
feeModel=arbitrum_nitro
operator=NULL
```

exact：

```text
execution + parent + operator? = total
```

全部 bigint decimal TEXT。

# 7. Atomic restore

完整 validation 后：

```text
BEGIN IMMEDIATE
all version rows
foreign_key_check
COMMIT
```

late V5 failure：

```text
V1/V2/V3/V4/V5 全 rollback
```


---

# FILE: 16_UI_UX_SPEC_CN.md

# V4.1 UI / UX

# 1. Add wallet

`/sync` 的 Add Wallet 增加 Network：

```text
Ethereum Mainnet
Base
Arbitrum One
```

同一地址可分别添加不同 network。

仍显示：

```text
只输入 public address
不要输入 private key / seed phrase
```

# 2. Connection card

例如：

```text
Base · Main Wallet
chainId 8453
0x1234…abcd

Current balance: synced
Finalized activity through block ...
Historical discovery: Limited
Debug trace: Available / Unavailable / Not checked
```

Arbitrum 同理。

# 3. Mandatory L2 warning

Base / Arbitrum 永远显示：

```text
Historical discovery is limited:
transactions that touch this address only through an internal native ETH call
may not be discovered by the current historical index.
Talli never treats missing activity as zero or complete.
```

中文主 UI 可翻译，但语义必须完整。

# 4. Debug unavailable

显示：

```text
余额同步可用
L2 movement 审核/导入暂不可用
需要 Alchemy Debug API capability
```

不得让用户以为整个 Wallet 功能坏了。

# 5. Asset identity

展示 chain：

```text
Base USDC
eip155:8453/erc20:0x...

Arbitrum USDC
eip155:42161/erc20:0x...
```

contract visible/truncated/copy。

# 6. Gas breakdown

Base：

```text
Network fee
L2 execution       ...
L1 data/security   ...
Operator fee       ...
Total              ...
```

Arbitrum：

```text
Network fee
Child execution        ...
Parent-chain posting   ...
Total                  ...
```

unresolved：

```text
Fee incomplete
Import disabled
```

# 7. Movement trace provenance

Candidate detail 可显示：

```text
Native movement evidence: call trace
Trace frames used: N
Historical coverage: discovery_limited
```

不要默认展示 calldata/output。

# 8. Bridge

可显示地址/tx来源，
但不显示“已匹配到 Ethereum bridge transaction”。

如果用户选择 Transfer：

```text
这是用户明确分类
```

# 9. Mobile

Base/Arbitrum chain identity、fee breakdown、coverage warning
都必须在 mobile WebKit 无横向 overflow。


---

# FILE: 17_TEST_ACCEPTANCE_CN.md

# V4.1 Test & Acceptance Matrix

# A. Frozen regression

全部 PASS：

```text
V1 Ledger
V2 valuation
V3 Kraken
V4.0 Ethereum wallet
```

# B. Chain identity

## C-001

chain registry exact：
1 / 8453 / 42161。

## C-002

same address on three chains allowed。

## C-003

same chain + same lowercase address duplicate reject。

## C-004

asset keys/stable keys include chain。

## C-005

wrong chainId response → CHAIN_MISMATCH。

# C. Migration

## M-001

V4 DB → V4.1：
all Ethereum IDs/facts unchanged。

## M-002

FK check empty。

## M-003

old 0004/0005 untouched。

## M-004

repeat startup no rebuild loop。

# D. L2 Transfers / capability

## L2-001

Base request categories exactly external+erc20；
no internal。

## L2-002

Arbitrum same。

## L2-003

Debug unavailable：
balances persist；
movement candidate none；
activity cursor unchanged；
status partial/balance_only；
warning visible。

## L2-004

Debug exact：
discovered tx trace accepted；
coverage still discovery_limited。

## L2-005

temporary debug rate limit != capability unavailable；
no unsafe partial activity/cursor.

# E. Trace normalization

## TR-001

CALL nonzero counts.

## TR-002

CREATE/CREATE2 value counts.

## TR-003

SELFDESTRUCT/SUICIDE normalized and counts.

## TR-004

DELEGATECALL/STATICCALL/CALLCODE do not count.

## TR-005

ancestor revert suppresses descendants.

## TR-006

failed receipt → no movement; gas independent.

## TR-007

top-level external ETH not double-counted with trace root.

## TR-008

trace human/display data never used for money.

# F. Base fees

## BF-001

execution = gasUsed * effectiveGasPrice bigint.

## BF-002

fetch raw tx by hash.

## BF-003

historical eth_call GPO getL1Fee at tx block.

## BF-004

pre-Isthmus operator = 0.

## BF-005

post-Isthmus/Jovian uses historical getOperatorFee(gasUsed),
not local hardcoded fork formula.

## BF-006

total=execution+l1+operator.

## BF-007

GPO/raw failure → unresolved; import disabled.

## BF-008

type 0x7e deposit → no normal user gas candidate.

## BF-009

ABI selector uses Keccak-256, not SHA3-256.

# G. Arbitrum fees

## AF-001

gasUsedForL1 exact parse.

## AF-002

parent = gasUsedForL1 * price.

## AF-003

execution=(gasUsed-gasUsedForL1)*price.

## AF-004

total=gasUsed*price.

## AF-005

components sum total; no double count.

## AF-006

missing/invalid gasUsedForL1 → unresolved.

## AF-007

custom Arbitrum L1-origin types no ordinary user gas candidate.

# H. Finality/cursor

## F-001

history to numeric finalized head.

## F-002

balance latest remains independent.

## F-003

pagination incomplete → activity no commit, cursor no advance.

## F-004

trace unavailable → cursor no advance.

## F-005

32-block overlap + IDs still dedupe.

# I. Ledger isolation/import

## I-001

all Base/Arb sync → Ledger unchanged.

## I-002

simple exchange explicit import → one V1 exchange.

## I-003

gas explicit import → one V1 expense.

## I-004

imported resync no duplicate.

## I-005

late provenance failure rolls Ledger back.

## I-006

complex stays unsupported.

# J. Bridge

## BR-001

matching amount/time across Ethereum/Base does not auto-link.

## BR-002

Arbitrum retryable/deposit does not auto-link.

# K. Backup v5

## BV5-001 schemaVersion5.

## BV5-002 V1–V4 restore.

## BV5-003 V5 roundtrip.

## BV5-004 L2 fee details roundtrip.

## BV5-005 chain mismatch pre-write reject.

## BV5-006 component sum mismatch reject.

## BV5-007 capability/cursors/secrets excluded.

## BV5-008 late failure full rollback.

# L. E2E

Desktop fixture：

1. add Base wallet；
2. sync balances；
3. show discovery_limited；
4. Debug available fixture；
5. map ETH/USDC；
6. Base movement；
7. Base fee breakdown；
8. explicit import；
9. re-sync no duplicate；
10. add Arbitrum same public address；
11. map；
12. Arbitrum movement；
13. parent/child fee breakdown；
14. explicit import；
15. backup schemaVersion5。

另一个 fixture：

```text
Debug unavailable
```

验证 balances 可用、movement disabled、cursor不推进。

Mobile WebKit：

- Base/Arbitrum cards；
- coverage warning；
- mapping；
- fee breakdown；
- no overflow。

# M. Final gate

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

Exact final SHA GitHub Actions：

```text
Quality & Build = success
Playwright E2E = success
```


---

# FILE: 18_IMPLEMENTATION_PLAN_CN.md

# V4.1 Implementation Plan

# Phase 0 — Baseline

- verify v4.0.0 exact SHA；
- old gates green；
- branch feat/v4.1-evm-l2-sync。

# Phase 1 — Chain domain

- EvmChainId；
- registry；
- generalized keys；
- no implicit chain 1。

Gate：domain unit.

# Phase 2 — Forward migration

- three chain CHECK rebuild；
- operational trace status；
- evm_l2_gas_fee_details；
- V4.0 ID preservation。

Gate：migration + Ethereum regression.

# Phase 3 — Provider routing

- fixed Base/Arb origins；
- chain assertion；
- shared Alchemy key；
- read-method allowlist。

Gate：provider security.

# Phase 4 — L2 balance

- reuse exact balances；
- chain-specific keys；
- row partial；
- mapping/reconcile。

Gate：balance integration.

# Phase 5 — L2 discovery

- Transfers external+erc20 only；
- finalized numeric head；
- pagination；
- discovery_limited metadata。

Gate：discovery tests.

# Phase 6 — Debug trace

- callTracer；
- response parser；
- sanitized trace projection；
- revert propagation；
- native netting；
- Debug capability.

Gate：trace unit/provider tests.

# Phase 7 — Base fee adapter

- raw tx；
- historical GPO getL1Fee；
- getOperatorFee；
- deposit exclusion；
- exact breakdown。

Gate：Base fee matrix.

# Phase 8 — Arbitrum fee adapter

- gasUsedForL1；
- decomposition；
- custom tx exclusions。

Gate：Arbitrum fee matrix.

# Phase 9 — Candidate integration

- chain-aware source fingerprint；
- movement/gas stable keys；
- strict import；
- idempotency。

Gate：integration.

# Phase 10 — Backup v5

- schemaVersion5；
- V1–V5；
- L2 gas detail；
- cross-chain validation。

Gate：backup.

# Phase 11 — UI

- network selector；
- Base/Arb cards；
- coverage/capability；
- fee breakdown；
- bridge boundary；
- mobile。

# Phase 12 — E2E / security

- Base fixture；
- Arbitrum fixture；
- Debug unavailable fixture；
- all frozen regression；
- no live Alchemy。

# Phase 13 — Final audit prep

Codex 返回：

```text
final SHA
changed files
migration
unit/integration/e2e counts
CI run
known limitations
```

不要 merge/tag，交给 ChatGPT 独立审计。


---

# FILE: 19_NON_GOALS_V42_BOUNDARY_CN.md

# V4.1 Non-goals / V4.2 Boundary

V4.1 不做：

- complete historical internal-only discovery；
- webhook；
- cron；
- WebSocket；
- bridge auto-link；
- Optimism；
- Polygon；
- BNB；
- Arbitrum Nova；
- Base Flashblocks；
- pre-Nitro Arbitrum trace adapter；
- NFT；
- DeFi position；
- AA/paymaster gas semantics；
- private key / signing；
- auto import；
- L2 price engine。

# Suggested V4.2

> L2 Activity Completeness & Live Monitoring

候选：

- Alchemy Address Activity webhook；
- future internal transfer notification；
- webhook authenticity / replay protection；
- self-hosted public endpoint security；
- historical gap marking；
- explicit backfill strategy。

只有 V4.1 freeze 后再设计。

# Other chains

Bitcoin / Solana 仍不应塞进 EVM abstraction。
建议未来独立 major version。


---

# FILE: 20_L2_FIXTURES.json

{
  "schemaVersion": 1,
  "wallet": "0x1111111111111111111111111111111111111111",
  "other": "0x2222222222222222222222222222222222222222",
  "base": {
    "chainId": 8453,
    "chainIdHex": "0x2105",
    "networkId": "base-mainnet",
    "txHash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "transfers": [
      {
        "uniqueId": "base-usdc-out",
        "category": "erc20",
        "from": "0x1111111111111111111111111111111111111111",
        "to": "0x2222222222222222222222222222222222222222",
        "rawContract": {
          "value": "0x5f5e100",
          "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          "decimal": "0x6"
        },
        "value": 999999999.0,
        "asset": "USDC"
      }
    ],
    "callTrace": {
      "type": "CALL",
      "from": "0x1111111111111111111111111111111111111111",
      "to": "0x2222222222222222222222222222222222222222",
      "value": "0x0",
      "calls": [
        {
          "type": "CALL",
          "from": "0x2222222222222222222222222222222222222222",
          "to": "0x1111111111111111111111111111111111111111",
          "value": "0x8e1bc9bf040000"
        }
      ]
    },
    "receipt": {
      "status": "0x1",
      "gasUsed": "0x186a0",
      "effectiveGasPrice": "0x3b9aca00",
      "type": "0x2"
    },
    "rawTransaction": "0x02f8_fixture_base_rlp",
    "gasPriceOracle": {
      "address": "0x420000000000000000000000000000000000000F",
      "getL1FeeResult": "0x1b48eb57e000",
      "getOperatorFeeResult": "0x48c27395000"
    },
    "expected": {
      "movement": "-100 USDC +0.04 ETH",
      "executionFeeWei": "100000000000000",
      "parentDataFeeWei": "30000000000000",
      "operatorFeeWei": "5000000000000",
      "totalFeeWei": "135000000000000"
    }
  },
  "arbitrum": {
    "chainId": 42161,
    "chainIdHex": "0xa4b1",
    "networkId": "arb-mainnet",
    "txHash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "receipt": {
      "status": "0x1",
      "gasUsed": "0x7a120",
      "gasUsedForL1": "0x30d40",
      "effectiveGasPrice": "0x1312d00",
      "type": "0x2"
    },
    "expected": {
      "executionFeeWei": "6000000000000",
      "parentDataFeeWei": "4000000000000",
      "totalFeeWei": "10000000000000",
      "componentIdentity": "execution + parentData == total"
    }
  },
  "debugUnavailable": {
    "balanceStatus": "success",
    "traceCapability": "trace_unavailable",
    "historyCoverage": "discovery_limited",
    "movementCandidateCount": 0,
    "activityCursorAdvances": false
  }
}


---

# FILE: 21_EXTERNAL_API_REFERENCE_20260813_CN.md

# Official API Reference Snapshot — 2026-08-13

实现时允许重新核对最新官方文档。
只使用第一方协议/provider文档做 source of truth。

# Alchemy

Transfers API:
https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers

关键当前事实：
- Base / Arbitrum supported；
- internal transfer data 只在 Ethereum Mainnet / Polygon Mainnet；
- pageKey pagination。

Pricing / capability:
https://www.alchemy.com/docs/reference/pricing-plans

当前：
- Debug API Free ✗
- PAYG ✓
- Enterprise ✓

Debug:
https://www.alchemy.com/docs/chains/debug-api/debug-api-endpoints/debug-trace-transaction

当前：
- `debug_traceTransaction`
- `callTracer`
- `onlyTopCall=false`

Network endpoints:
https://www.alchemy.com/docs/choosing-a-web3-network

当前：
- Base 8453 / base-mainnet.g.alchemy.com
- Arbitrum 42161 / arb-mainnet.g.alchemy.com

Base raw tx:
https://www.alchemy.com/docs/chains/base/base-api-endpoints/eth-get-raw-transaction-by-hash

Arbitrum receipt extension:
https://www.alchemy.com/docs/reference/arbitrumethereum-differences

当前：
`gasUsedForL1` = parent calldata gas in L2 gas units.

# Base

Network fees:
https://docs.base.org/base-chain/network-information/network-fees

当前：
- L2 execution + L1 security；
- GasPriceOracle 0x420000000000000000000000000000000000000F；
- getL1Fee(bytes) exact for fully serialized RLP.

Isthmus:
https://docs.base.org/base-chain/specs/upgrades/isthmus/overview
https://docs.base.org/base-chain/specs/upgrades/isthmus/predeploys

当前：
- mainnet activation 2025-05-09 16:00:01 UTC；
- getOperatorFee(uint256).

Jovian:
https://docs.base.org/base-chain/specs/upgrades/jovian/overview
https://docs.base.org/base-chain/specs/upgrades/jovian/exec-engine

当前：
- mainnet activation 2025-12-02 16:00:01 UTC；
- operator formula changed.
因此 Talli 应 historical eth_call GPO，不本地复制 fork 公式。

Base eth_call:
https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_call

支持 specific block / safe / finalized。

Base finality:
https://docs.base.org/base-chain/network-information/transaction-finality

普通 L2 tx finality 与 7-day withdrawal finalization 不同。

Deposits:
https://docs.base.org/base-chain/specs/protocol/bridging/deposits

type `0x7E`，L2 gas purchased on L1；不是普通 sequenced user-fee path。

OP Stack canonical GasPriceOracle interface:
https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/interfaces/L2/IGasPriceOracle.sol

# Arbitrum

Chain info:
https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info

当前：
- Arbitrum One chain ID 42161；
- Nitro Rollup；
- Alchemy supported；
- Stylus tracing on paid plans；
- sequencer soft confirmation != parent-chain finality。

Gas and fees:
https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees

当前：
- parent poster + child chain fee；
- total fee = child basefee × total child-gas-unit charge；
- receipt includes gasUsedForL1.

Alchemy pre/post Nitro:
https://www.alchemy.com/docs/chains/arbitrum/arbitrum-api-endpoints/arbtrace-transaction

当前：
- arbtrace_* pre-Nitro only (<22,207,815)
- post-Nitro use Geth debug_*.

Nitro source corroboration:
https://github.com/OffchainLabs/nitro/blob/master/system_tests/fees_test.go

当前源码测试使用：
`gasUsedForL2 = receipt.GasUsed - receipt.GasUsedForL1`.

# Important implementation rule

如果官方文档在 Codex 开工时已变化：

1. 记录变化；
2. 以最新第一方文档为准；
3. 不扩大 product scope；
4. 如果变化影响 fee exactness / discovery completeness，
   停止该 chain 的 import capability 并报告，不做猜测。


---

# FILE: 22_RISK_REGISTER_CN.md

# V4.1 Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| L2 Transfers API 不含 internal history | Critical | discovery_limited 永久可见；known tx 才 trace |
| Debug paywall 被误当完整 history | Critical | capability gate；unavailable 禁 movement import |
| trace root + external row double count | Critical | L2 native movement trace authoritative |
| reverted child trace被计入 | Critical | ancestor revert propagation |
| Base 少记 L1 fee | Critical | historical GPO getL1Fee |
| Base 少记 operator fee | Critical | historical getOperatorFee / pre-Isthmus 0 |
| Base 本地 fork公式过时 | High | 不本地重算 fork formula |
| Arbitrum parent fee double count | Critical | total=gasUsed*price；component decomposition only |
| Arbitrum gasUsedForL1 missing | High | unresolved / no import |
| Bridge 被自动匹配错 | Critical | no auto bridge correlation |
| symbol spoof | High | chain+contract identity |
| same address cross-chain collision | High | chain-aware uniqueness/source key |
| arbitrary RPC exfiltrates key | Critical | fixed registry origins |
| debug/raw/eth_call accidentally扩成 write surface | High | strict method + contract allowlist |
| pre-Nitro Arbitrum误称支持 | High | explicit unsupported boundary |
| cursor在 incomplete activity推进 | High | all-or-none activity commit |
| capability state进入 backup | Medium | operational exclude |
| backup跨链 identity混乱 | High | schemaVersion5 chain validation |


---

# FILE: 23_RELEASE_AUDIT_CHECKLIST_CN.md

# V4.1 Independent Final Audit Checklist

交给 ChatGPT：

```text
Repository: wentAInx/Talli
Branch: feat/v4.1-evm-l2-sync
Final SHA: <exact>
Actions run: <id/url>
```

审计重点：

## Baseline
- descendant of `f981e3e0e454f4d7a8ce0111323c9aceebc2483b`；
- v4.0.0 unchanged；
- forward-only migration。

## Chain identity
- 1 / 8453 / 42161；
- source/asset/candidate keys chain-aware；
- same address cross-chain allowed。

## Provider
- fixed origins；
- exact chainId assertions；
- Base/Arb Transfers no internal category；
- no live Alchemy CI。

## Trace
- paid capability gate；
- discovery_limited visible；
- native call trace exact；
- no double count；
- revert propagation；
- no unsafe fallback.

## Base fee
- raw tx；
- historical GPO；
- operator fee；
- type 0x7e exclusion；
- exact component sum。

## Arbitrum fee
- gasUsedForL1；
- correct decomposition；
- custom tx boundary；
- no double count。

## Ledger
- sync no mutation；
- explicit import/reconcile only；
- same V1 writer；
- atomic provenance；
- resync idempotent。

## Backup
- schemaVersion5；
- V1–V5；
- L2 fee detail；
- secrets/operational excluded；
- rollback.

## UI
- coverage warning；
- capability；
- fee breakdown；
- bridge non-correlation；
- mobile.

Final verdict：

```text
Critical
High
Medium
Low

V4.1 Architecture
V4.0 Regression
Provider Compatibility
Trace Correctness
Fee Exactness
Ledger Isolation
Backup
CI

GO / NO-GO
```


---

# FILE: CODEX_HANDOFF_PROMPT.txt

你现在负责 Talli V4.1。

Repository:
wentAInx/Talli

Frozen V4.0 baseline/tag:
f981e3e0e454f4d7a8ce0111323c9aceebc2483b
v4.0.0

V4.0 main release CI:
31681253835
Quality & Build = PASS
Playwright E2E = PASS

目标：
Talli V4.1 — EVM L2 Expansion
Base Mainnet + Arbitrum One Read-only Wallet Sync

推荐分支：
feat/v4.1-evm-l2-sync

开始前完整阅读任务包 00 → 23。

核心红线：

- L2 data != Ledger；
- Base/Arbitrum historical activity 必须标记 discovery_limited；
- Alchemy Transfers API 对 Base/Arb 不请求 internal；
- L2 movement 只能在 discovered tx 的 debug trace exact 后进入可审核 candidate；
- Debug unavailable 时 balances 可用，但 movement import 禁用且 activity cursor 不推进；
- Base total fee 必须 exact 包含 execution + L1 data + operator；
- Base 使用 historical GasPriceOracle getL1Fee/getOperatorFee，不本地复制 fork公式；
- Arbitrum 使用 gasUsedForL1 正确拆分，禁止 double count；
- bridge 不自动跨链关联；
- chain+contract 是 token identity；
- no private key/sign/send/custom RPC；
- all money bigint；
- V1/V2/V3/V4.0 regression 全绿。

先做 chain domain + migration tests，再 provider/trace/fee，再 UI。

默认 CI 绝不访问真实 Alchemy。

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

不得伪造结果。

完成后 push feature branch（只有用户明确要求时），
但不要 merge main / tag v4.1.0。

最终报告：
exact SHA、changed files、migration、test counts、Actions run、known limitations。
