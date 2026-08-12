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
