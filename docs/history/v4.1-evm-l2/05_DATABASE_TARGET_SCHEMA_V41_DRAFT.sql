-- HISTORICAL DESIGN DRAFT ONLY. DO NOT APPLY TO A CURRENT DATABASE.
-- Current schema truth: src/db/schema.ts and src/db/migrations/**.
-- Talli V4.1 target EVM schema excerpt.
-- Documentation/reference only; changes require a forward migration
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
