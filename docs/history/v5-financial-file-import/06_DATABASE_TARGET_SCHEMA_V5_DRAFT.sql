-- HISTORICAL DESIGN DRAFT ONLY. DO NOT APPLY TO A CURRENT DATABASE.
-- Current schema truth: src/db/schema.ts and src/db/migrations/**.
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
