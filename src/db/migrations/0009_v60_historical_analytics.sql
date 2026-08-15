CREATE TABLE `historical_fx_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`base_asset_id` text NOT NULL,
	`quote_asset_id` text NOT NULL,
	`provider` text NOT NULL,
	`quote_kind` text NOT NULL,
	`rate_text` text NOT NULL,
	`provider_observation_date` text NOT NULL,
	`first_fetched_at` text NOT NULL,
	`last_fetched_at` text NOT NULL,
	`source_metadata_json` text,
	FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "historical_fx_quote_distinct_assets_check" CHECK("historical_fx_quotes"."base_asset_id" <> "historical_fx_quotes"."quote_asset_id"),
	CONSTRAINT "historical_fx_quote_provider_check" CHECK("historical_fx_quotes"."provider" = 'ecb'),
	CONSTRAINT "historical_fx_quote_kind_check" CHECK("historical_fx_quotes"."quote_kind" = 'reference'),
	CONSTRAINT "historical_fx_quote_rate_nonempty_check" CHECK(length("historical_fx_quotes"."rate_text") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_fx_quotes_provider_pair_date_unique` ON `historical_fx_quotes` (`provider`,`base_asset_id`,`quote_asset_id`,`provider_observation_date`);--> statement-breakpoint
CREATE INDEX `historical_fx_quotes_lookup_idx` ON `historical_fx_quotes` (`base_asset_id`,`quote_asset_id`,`provider_observation_date`);--> statement-breakpoint
CREATE TABLE `historical_manual_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`base_asset_id` text NOT NULL,
	`quote_asset_id` text NOT NULL,
	`valuation_date` text NOT NULL,
	`rate_text` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "historical_manual_quote_distinct_assets_check" CHECK("historical_manual_quotes"."base_asset_id" <> "historical_manual_quotes"."quote_asset_id"),
	CONSTRAINT "historical_manual_quote_rate_nonempty_check" CHECK(length("historical_manual_quotes"."rate_text") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_manual_quotes_pair_date_unique` ON `historical_manual_quotes` (`base_asset_id`,`quote_asset_id`,`valuation_date`);--> statement-breakpoint
CREATE INDEX `historical_manual_quotes_lookup_idx` ON `historical_manual_quotes` (`base_asset_id`,`quote_asset_id`,`valuation_date`);--> statement-breakpoint
CREATE TABLE `historical_price_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`base_asset_id` text NOT NULL,
	`quote_asset_id` text NOT NULL,
	`provider` text NOT NULL,
	`quote_kind` text NOT NULL,
	`granularity` text NOT NULL,
	`rate_text` text NOT NULL,
	`provider_observed_at` text NOT NULL,
	`first_fetched_at` text NOT NULL,
	`last_fetched_at` text NOT NULL,
	`source_metadata_json` text,
	FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "historical_price_quote_distinct_assets_check" CHECK("historical_price_quotes"."base_asset_id" <> "historical_price_quotes"."quote_asset_id"),
	CONSTRAINT "historical_price_quote_provider_check" CHECK("historical_price_quotes"."provider" = 'coingecko'),
	CONSTRAINT "historical_price_quote_kind_check" CHECK("historical_price_quotes"."quote_kind" = 'market'),
	CONSTRAINT "historical_price_quote_granularity_check" CHECK("historical_price_quotes"."granularity" in ('hourly', 'daily')),
	CONSTRAINT "historical_price_quote_rate_nonempty_check" CHECK(length("historical_price_quotes"."rate_text") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_price_quotes_provider_pair_observed_unique` ON `historical_price_quotes` (`provider`,`base_asset_id`,`quote_asset_id`,`provider_observed_at`);--> statement-breakpoint
CREATE INDEX `historical_price_quotes_lookup_idx` ON `historical_price_quotes` (`base_asset_id`,`quote_asset_id`,`provider_observed_at`);--> statement-breakpoint
CREATE TABLE `historical_refresh_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_from_date` text NOT NULL,
	`requested_to_date` text NOT NULL,
	`status` text NOT NULL,
	`mapping_fingerprint` text NOT NULL,
	`total_units` integer NOT NULL,
	`completed_units` integer DEFAULT 0 NOT NULL,
	`failed_units` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	CONSTRAINT "historical_refresh_run_status_check" CHECK("historical_refresh_runs"."status" in ('pending', 'running', 'partial', 'success', 'failed', 'invalidated', 'cancelled')),
	CONSTRAINT "historical_refresh_run_total_units_check" CHECK("historical_refresh_runs"."total_units" >= 0),
	CONSTRAINT "historical_refresh_run_completed_units_check" CHECK("historical_refresh_runs"."completed_units" >= 0),
	CONSTRAINT "historical_refresh_run_failed_units_check" CHECK("historical_refresh_runs"."failed_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE `historical_refresh_units` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`provider` text NOT NULL,
	`asset_id` text,
	`provider_scope_json` text NOT NULL,
	`interval_kind` text NOT NULL,
	`from_boundary` text NOT NULL,
	`to_boundary` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`claimed_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `historical_refresh_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "historical_refresh_unit_provider_check" CHECK("historical_refresh_units"."provider" in ('coingecko', 'ecb')),
	CONSTRAINT "historical_refresh_unit_interval_check" CHECK("historical_refresh_units"."interval_kind" in ('hourly', 'daily', 'ecb_daily')),
	CONSTRAINT "historical_refresh_unit_status_check" CHECK("historical_refresh_units"."status" in ('pending', 'running', 'success', 'failed')),
	CONSTRAINT "historical_refresh_unit_ordinal_check" CHECK("historical_refresh_units"."ordinal" >= 0),
	CONSTRAINT "historical_refresh_unit_attempts_check" CHECK("historical_refresh_units"."attempts" >= 0),
	CONSTRAINT "historical_refresh_unit_scope_nonempty_check" CHECK(length("historical_refresh_units"."provider_scope_json") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_refresh_units_run_ordinal_unique` ON `historical_refresh_units` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `historical_refresh_units_pending_idx` ON `historical_refresh_units` (`run_id`,`status`,`ordinal`);