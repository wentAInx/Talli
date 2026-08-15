-- Talli V6.0 target schema draft.
-- Canonical semantics live in numbered markdown specs.
-- Adapt naming only to match existing Drizzle conventions; do not change meaning.

CREATE TABLE historical_price_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  base_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quote_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'coingecko'),
  quote_kind TEXT NOT NULL CHECK (quote_kind = 'market'),
  granularity TEXT NOT NULL CHECK (granularity IN ('hourly', 'daily')),
  rate_text TEXT NOT NULL,
  provider_observed_at TEXT NOT NULL,
  first_fetched_at TEXT NOT NULL,
  last_fetched_at TEXT NOT NULL,
  source_metadata_json TEXT,
  CHECK (base_asset_id <> quote_asset_id),
  UNIQUE (provider, base_asset_id, quote_asset_id, provider_observed_at)
);

CREATE INDEX historical_price_quotes_lookup_idx
ON historical_price_quotes(base_asset_id, quote_asset_id, provider_observed_at);

CREATE TABLE historical_fx_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  base_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quote_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'ecb'),
  quote_kind TEXT NOT NULL CHECK (quote_kind = 'reference'),
  rate_text TEXT NOT NULL,
  provider_observation_date TEXT NOT NULL,
  first_fetched_at TEXT NOT NULL,
  last_fetched_at TEXT NOT NULL,
  source_metadata_json TEXT,
  CHECK (base_asset_id <> quote_asset_id),
  UNIQUE (provider, base_asset_id, quote_asset_id, provider_observation_date)
);

CREATE INDEX historical_fx_quotes_lookup_idx
ON historical_fx_quotes(base_asset_id, quote_asset_id, provider_observation_date);

CREATE TABLE historical_manual_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  base_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quote_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  valuation_date TEXT NOT NULL,
  rate_text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (base_asset_id <> quote_asset_id),
  UNIQUE (base_asset_id, quote_asset_id, valuation_date)
);

CREATE INDEX historical_manual_quotes_lookup_idx
ON historical_manual_quotes(base_asset_id, quote_asset_id, valuation_date);

CREATE TABLE historical_refresh_runs (
  id TEXT PRIMARY KEY NOT NULL,
  requested_from_date TEXT NOT NULL,
  requested_to_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending','running','partial','success','failed','invalidated','cancelled')
  ),
  mapping_fingerprint TEXT NOT NULL,
  total_units INTEGER NOT NULL CHECK (total_units >= 0),
  completed_units INTEGER NOT NULL DEFAULT 0 CHECK (completed_units >= 0),
  failed_units INTEGER NOT NULL DEFAULT 0 CHECK (failed_units >= 0),
  last_error_code TEXT,
  last_error_message TEXT,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE historical_refresh_units (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES historical_refresh_runs(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  provider TEXT NOT NULL CHECK (provider IN ('coingecko','ecb')),
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  provider_scope_json TEXT NOT NULL,
  interval_kind TEXT NOT NULL CHECK (interval_kind IN ('hourly','daily','ecb_daily')),
  from_boundary TEXT NOT NULL,
  to_boundary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','success','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  last_error_message TEXT,
  claimed_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, ordinal)
);

CREATE INDEX historical_refresh_units_pending_idx
ON historical_refresh_units(run_id, status, ordinal);

-- No daily_portfolio_valuations table in V6.0 P0.
-- Computed analytics are derived on read to avoid invalidation bugs from:
-- backdated Ledger edits, new snapshots, quote revisions, mapping edits,
-- Home Asset changes, or App timezone changes.
