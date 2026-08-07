-- V1 canonical logical schema for SQLite.
-- Codex may translate this into Drizzle schema + migrations, but must preserve semantics.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  symbol TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('fiat', 'crypto', 'custom')),
  scale INTEGER NOT NULL CHECK (scale >= 0 AND scale <= 30),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'cash', 'bank', 'ewallet', 'exchange', 'crypto_wallet',
      'credit', 'loan', 'other'
    )
  ),
  institution_name TEXT,
  note TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_book ON accounts(book_id);
CREATE INDEX IF NOT EXISTS idx_accounts_asset ON accounts(asset_id);
CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(is_archived);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'both' CHECK (category_type IN ('expense', 'income', 'both')),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_book ON categories(book_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(book_id, name)
);

CREATE TABLE IF NOT EXISTS ledger_events (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('expense', 'income', 'transfer', 'exchange')),
  occurred_at TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  payee TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_book_occurred ON ledger_events(book_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON ledger_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_category ON ledger_events(category_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES ledger_events(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  entry_role TEXT NOT NULL CHECK (entry_role IN ('main', 'source', 'destination', 'fee')),
  -- Signed base-10 integer string. Application MUST validate /^-?[0-9]+$/.
  amount_atomic TEXT NOT NULL CHECK (length(amount_atomic) > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_event ON ledger_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_entries_account ON ledger_entries(account_id);

CREATE TABLE IF NOT EXISTS event_tags (
  event_id TEXT NOT NULL REFERENCES ledger_events(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag_id);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  as_of TEXT NOT NULL,
  balance_atomic TEXT NOT NULL CHECK (length(balance_atomic) > 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_asof
  ON balance_snapshots(account_id, as_of DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Optional audit metadata for lossless backups / migrations.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Important invariants that MUST be enforced in application/domain services:
-- 1. An entry account's asset is inferred from accounts.asset_id.
-- 2. expense: exactly one main entry, amount < 0.
-- 3. income: exactly one main entry, amount > 0.
-- 4. transfer: exactly one source and one destination; same asset; abs amounts equal;
--    optional one fee entry, amount < 0.
-- 5. exchange: exactly one source and one destination; different assets;
--    source < 0, destination > 0; optional one fee entry, amount < 0.
-- 6. asset/account referenced by history cannot be hard-deleted by the UI.
-- 7. balance_snapshot amounts must match account asset scale at parse time.
-- 8. all event + entries mutations occur in a single SQLite transaction.
