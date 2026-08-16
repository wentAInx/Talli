-- HISTORICAL DESIGN DRAFT ONLY. DO NOT APPLY TO A CURRENT DATABASE.
-- Current schema truth: src/db/schema.ts and src/db/migrations/**.
-- Talli V2.0 additive schema design contract.
-- Implement with an equivalent Drizzle schema and a generated/reviewed migration.
-- Do NOT edit historical V1 migration files.

CREATE TABLE `book_valuation_settings` (
  `book_id` text PRIMARY KEY NOT NULL,
  `home_asset_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON DELETE cascade,
  FOREIGN KEY (`home_asset_id`) REFERENCES `assets`(`id`) ON DELETE restrict
);

CREATE INDEX `idx_book_valuation_home_asset`
  ON `book_valuation_settings` (`home_asset_id`);

CREATE TABLE `price_provider_mappings` (
  `asset_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_asset_key` text NOT NULL,
  `is_enabled` integer DEFAULT true NOT NULL,
  `priority` integer DEFAULT 100 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`asset_id`, `provider`),
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade,
  CONSTRAINT `price_provider_mapping_provider_check`
    CHECK (`provider` in ('coingecko', 'ecb')),
  CONSTRAINT `price_provider_mapping_enabled_check`
    CHECK (`is_enabled` in (0, 1)),
  CONSTRAINT `price_provider_mapping_key_nonempty_check`
    CHECK (length(`provider_asset_key`) > 0)
);

CREATE INDEX `idx_price_provider_mappings_provider_enabled`
  ON `price_provider_mappings` (`provider`, `is_enabled`, `priority`);

CREATE TABLE `manual_price_quotes` (
  `id` text PRIMARY KEY NOT NULL,
  `base_asset_id` text NOT NULL,
  `quote_asset_id` text NOT NULL,
  `rate_text` text NOT NULL,
  `observed_at` text NOT NULL,
  `note` text,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON DELETE restrict,
  FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON DELETE restrict,
  CONSTRAINT `manual_quote_distinct_assets_check`
    CHECK (`base_asset_id` <> `quote_asset_id`),
  CONSTRAINT `manual_quote_rate_nonempty_check`
    CHECK (length(`rate_text`) > 0),
  CONSTRAINT `manual_quote_active_check`
    CHECK (`is_active` in (0, 1))
);

CREATE UNIQUE INDEX `manual_price_quotes_one_active_pair`
  ON `manual_price_quotes` (`base_asset_id`, `quote_asset_id`)
  WHERE `is_active` = 1;

CREATE INDEX `idx_manual_price_quotes_pair_observed`
  ON `manual_price_quotes` (`base_asset_id`, `quote_asset_id`, `observed_at` DESC);

-- Derived/rebuildable provider cache. EXCLUDED from JSON backup.
CREATE TABLE `latest_price_quotes` (
  `base_asset_id` text NOT NULL,
  `quote_asset_id` text NOT NULL,
  `provider` text NOT NULL,
  `quote_kind` text NOT NULL,
  `rate_text` text NOT NULL,
  `provider_observed_at` text,
  `provider_observation_date` text,
  `fetched_at` text NOT NULL,
  `source_metadata_json` text,
  PRIMARY KEY (`base_asset_id`, `quote_asset_id`, `provider`),
  FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade,
  FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade,
  CONSTRAINT `latest_quote_distinct_assets_check`
    CHECK (`base_asset_id` <> `quote_asset_id`),
  CONSTRAINT `latest_quote_provider_check`
    CHECK (`provider` in ('coingecko', 'ecb')),
  CONSTRAINT `latest_quote_kind_check`
    CHECK (`quote_kind` in ('spot', 'reference')),
  CONSTRAINT `latest_quote_rate_nonempty_check`
    CHECK (length(`rate_text`) > 0),
  CONSTRAINT `latest_quote_observation_check`
    CHECK (`provider_observed_at` IS NOT NULL OR `provider_observation_date` IS NOT NULL)
);

CREATE INDEX `idx_latest_price_quotes_provider_fetched`
  ON `latest_price_quotes` (`provider`, `fetched_at` DESC);

-- Derived operational state. EXCLUDED from JSON backup.
CREATE TABLE `price_provider_state` (
  `provider` text PRIMARY KEY NOT NULL,
  `last_attempt_at` text,
  `last_success_at` text,
  `last_error_code` text,
  `last_error_message` text,
  `cooldown_until` text,
  `updated_at` text NOT NULL,
  CONSTRAINT `price_provider_state_provider_check`
    CHECK (`provider` in ('coingecko', 'ecb'))
);

-- Application/query boundaries MUST additionally validate:
-- 1. rate_text is positive plain decimal text; no exponent, sign, NaN, Infinity.
-- 2. all timestamps are canonical UTC ISO strings.
-- 3. provider_observation_date is YYYY-MM-DD when present.
-- 4. home_asset_id references a non-archived fiat asset at service boundary.
