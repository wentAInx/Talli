-- HISTORICAL DESIGN DRAFT ONLY. DO NOT APPLY TO A CURRENT DATABASE.
-- Current schema truth: src/db/schema.ts and src/db/migrations/**.
-- Talli V5.1 target additive schema draft.
-- Documentation only. Changes require a real forward migration from v5.0.0.

CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_scope TEXT NOT NULL
    CHECK(target_scope IN ('file_import_candidate')),
  stage TEXT NOT NULL
    CHECK(stage IN ('pre','default','post')),
  match_mode TEXT NOT NULL
    CHECK(match_mode IN ('all','any')),
  is_enabled INTEGER NOT NULL DEFAULT 1
    CHECK(is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX automation_rules_book_scope_order_idx
  ON automation_rules(book_id, target_scope, stage, sort_order, id);

CREATE TABLE automation_rule_conditions (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL
    REFERENCES automation_rules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0),
  field TEXT NOT NULL CHECK(field IN (
    'source_payee',
    'projected_payee',
    'memo',
    'file_profile',
    'target_account',
    'source_format',
    'direction',
    'amount_abs',
    'identity_strength'
  )),
  operator TEXT NOT NULL CHECK(operator IN (
    'equals','not_equals',
    'contains','not_contains',
    'starts_with','ends_with',
    'is_empty','is_not_empty',
    'gt','gte','lt','lte','between'
  )),
  value_json TEXT NOT NULL,
  is_negated INTEGER NOT NULL DEFAULT 0
    CHECK(is_negated IN (0,1)),
  UNIQUE(rule_id, position)
);

CREATE TABLE automation_rule_actions (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL
    REFERENCES automation_rules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0),
  action_type TEXT NOT NULL CHECK(action_type IN (
    'set_payee',
    'set_category',
    'add_tag',
    'set_note',
    'append_note',
    'suggest_event_type'
  )),
  value_json TEXT NOT NULL,
  UNIQUE(rule_id, position)
);

CREATE TABLE recurring_items (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('expense','income')),
  payee_text TEXT,
  payee_match_mode TEXT NOT NULL DEFAULT 'any'
    CHECK(payee_match_mode IN ('any','exact','contains')),
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  note TEXT,
  amount_mode TEXT NOT NULL
    CHECK(amount_mode IN ('exact','approx','range')),
  amount_atomic_text TEXT,
  tolerance_bps INTEGER,
  min_amount_atomic_text TEXT,
  max_amount_atomic_text TEXT,
  frequency TEXT NOT NULL
    CHECK(frequency IN ('daily','weekly','monthly','yearly')),
  interval_count INTEGER NOT NULL CHECK(interval_count >= 1),
  anchor_date TEXT NOT NULL,
  monthly_day_mode TEXT
    CHECK(monthly_day_mode IS NULL OR monthly_day_mode IN ('fixed','last')),
  date_window_before_days INTEGER NOT NULL DEFAULT 2
    CHECK(date_window_before_days BETWEEN 0 AND 31),
  date_window_after_days INTEGER NOT NULL DEFAULT 2
    CHECK(date_window_after_days BETWEEN 0 AND 31),
  starts_on TEXT,
  ends_on TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX recurring_items_book_active_idx
  ON recurring_items(book_id, is_active);
CREATE INDEX recurring_items_account_idx
  ON recurring_items(account_id);

CREATE TABLE recurring_item_tags (
  recurring_item_id TEXT NOT NULL
    REFERENCES recurring_items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  PRIMARY KEY(recurring_item_id, tag_id)
);

CREATE TABLE recurring_occurrence_links (
  recurring_item_id TEXT NOT NULL
    REFERENCES recurring_items(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  ledger_event_id TEXT NOT NULL
    REFERENCES ledger_events(id) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL,
  PRIMARY KEY(recurring_item_id, occurrence_date),
  UNIQUE(ledger_event_id)
);

CREATE TABLE recurring_occurrence_skips (
  recurring_item_id TEXT NOT NULL
    REFERENCES recurring_items(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  skipped_at TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY(recurring_item_id, occurrence_date)
);
