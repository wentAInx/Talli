CREATE TABLE `book_valuation_settings` (
	`book_id` text PRIMARY KEY NOT NULL,
	`home_asset_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_book_valuation_home_asset` ON `book_valuation_settings` (`home_asset_id`);--> statement-breakpoint
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
	PRIMARY KEY(`base_asset_id`, `quote_asset_id`, `provider`),
	FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "latest_quote_distinct_assets_check" CHECK("latest_price_quotes"."base_asset_id" <> "latest_price_quotes"."quote_asset_id"),
	CONSTRAINT "latest_quote_provider_check" CHECK("latest_price_quotes"."provider" in ('coingecko', 'ecb')),
	CONSTRAINT "latest_quote_kind_check" CHECK("latest_price_quotes"."quote_kind" in ('spot', 'reference')),
	CONSTRAINT "latest_quote_rate_nonempty_check" CHECK(length("latest_price_quotes"."rate_text") > 0),
	CONSTRAINT "latest_quote_observation_check" CHECK("latest_price_quotes"."provider_observed_at" is not null or "latest_price_quotes"."provider_observation_date" is not null)
);
--> statement-breakpoint
CREATE INDEX `idx_latest_price_quotes_provider_fetched` ON `latest_price_quotes` (`provider`,"fetched_at" desc);--> statement-breakpoint
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
	FOREIGN KEY (`base_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`quote_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "manual_quote_distinct_assets_check" CHECK("manual_price_quotes"."base_asset_id" <> "manual_price_quotes"."quote_asset_id"),
	CONSTRAINT "manual_quote_rate_nonempty_check" CHECK(length("manual_price_quotes"."rate_text") > 0),
	CONSTRAINT "manual_quote_active_check" CHECK("manual_price_quotes"."is_active" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_price_quotes_one_active_pair` ON `manual_price_quotes` (`base_asset_id`,`quote_asset_id`) WHERE "manual_price_quotes"."is_active" = 1;--> statement-breakpoint
CREATE INDEX `idx_manual_price_quotes_pair_observed` ON `manual_price_quotes` (`base_asset_id`,`quote_asset_id`,"observed_at" desc);--> statement-breakpoint
CREATE TABLE `price_provider_mappings` (
	`asset_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_asset_key` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`asset_id`, `provider`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "price_provider_mapping_provider_check" CHECK("price_provider_mappings"."provider" in ('coingecko', 'ecb')),
	CONSTRAINT "price_provider_mapping_enabled_check" CHECK("price_provider_mappings"."is_enabled" in (0, 1)),
	CONSTRAINT "price_provider_mapping_key_nonempty_check" CHECK(length("price_provider_mappings"."provider_asset_key") > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_price_provider_mappings_provider_enabled` ON `price_provider_mappings` (`provider`,`is_enabled`,`priority`);--> statement-breakpoint
CREATE TABLE `price_provider_state` (
	`provider` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error_code` text,
	`last_error_message` text,
	`cooldown_until` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "price_provider_state_provider_check" CHECK("price_provider_state"."provider" in ('coingecko', 'ecb'))
);
