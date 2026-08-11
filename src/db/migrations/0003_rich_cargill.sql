CREATE TABLE `external_account_mappings` (
	`connection_id` text NOT NULL,
	`provider_asset_key` text NOT NULL,
	`talli_account_id` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`connection_id`, `provider_asset_key`),
	FOREIGN KEY (`talli_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`connection_id`,`provider_asset_key`) REFERENCES `external_asset_mappings`(`connection_id`,`provider_asset_key`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "external_account_mappings_enabled_check" CHECK("external_account_mappings"."is_enabled" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_account_mappings_talli_account_unique` ON `external_account_mappings` (`talli_account_id`);--> statement-breakpoint
CREATE TABLE `external_asset_mappings` (
	`connection_id` text NOT NULL,
	`provider_asset_key` text NOT NULL,
	`provider_display_code` text,
	`talli_asset_id` text,
	`mapping_status` text DEFAULT 'unmapped' NOT NULL,
	`provider_metadata_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`connection_id`, `provider_asset_key`),
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`talli_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_asset_mappings_status_check" CHECK("external_asset_mappings"."mapping_status" in ('mapped', 'unmapped', 'ignored'))
);
--> statement-breakpoint
CREATE INDEX `external_asset_mappings_talli_asset_idx` ON `external_asset_mappings` (`talli_asset_id`);--> statement-breakpoint
CREATE TABLE `external_balance_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`provider_asset_key` text NOT NULL,
	`talli_asset_id` text,
	`provider_amount_text` text NOT NULL,
	`mapped_amount_atomic` text,
	`precision_status` text NOT NULL,
	`observed_at` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`talli_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`connection_id`,`provider_asset_key`) REFERENCES `external_asset_mappings`(`connection_id`,`provider_asset_key`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_balance_observations_precision_check" CHECK("external_balance_observations"."precision_status" in ('exact', 'excess_precision', 'unmapped'))
);
--> statement-breakpoint
CREATE INDEX `external_balance_latest_idx` ON `external_balance_observations` (`connection_id`,`provider_asset_key`,"observed_at" desc);--> statement-breakpoint
CREATE TABLE `external_candidate_source_objects` (
	`candidate_id` text NOT NULL,
	`source_object_id` text NOT NULL,
	`relation` text NOT NULL,
	PRIMARY KEY(`candidate_id`, `source_object_id`),
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_object_id`) REFERENCES `external_source_objects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_candidate_source_relation_check" CHECK("external_candidate_source_objects"."relation" in ('primary', 'cross_check'))
);
--> statement-breakpoint
CREATE TABLE `external_connection_state` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error_code` text,
	`last_error_message` text,
	`permission_checked_at` text,
	`permission_summary_json` text,
	`cooldown_until` text,
	`last_nonce_text` text DEFAULT '0' NOT NULL,
	`last_ledger_sync_at` text,
	`last_trade_sync_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "external_connection_state_nonce_check" CHECK(length("external_connection_state"."last_nonce_text") > 0 and "external_connection_state"."last_nonce_text" not glob '*[^0-9]*')
);
--> statement-breakpoint
CREATE TABLE `external_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`credential_ref` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_connections_provider_check" CHECK("external_connections"."provider" in ('kraken')),
	CONSTRAINT "external_connections_enabled_check" CHECK("external_connections"."is_enabled" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_connections_book_provider_credential_unique` ON `external_connections` (`book_id`,`provider`,`credential_ref`);--> statement-breakpoint
CREATE TABLE `external_import_links` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`ledger_event_id` text NOT NULL,
	`imported_at` text NOT NULL,
	`import_fingerprint` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_event_id`) REFERENCES `ledger_events`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_import_links_ledger_event_unique` ON `external_import_links` (`ledger_event_id`);--> statement-breakpoint
CREATE TABLE `external_source_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`object_type` text NOT NULL,
	`external_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "external_source_objects_type_check" CHECK("external_source_objects"."object_type" in ('kraken_ledger', 'kraken_trade'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_source_objects_identity_unique` ON `external_source_objects` (`connection_id`,`object_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_source_objects_time_idx` ON `external_source_objects` (`connection_id`,"occurred_at" desc);--> statement-breakpoint
CREATE TABLE `external_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`balances_seen` integer DEFAULT 0 NOT NULL,
	`source_objects_seen` integer DEFAULT 0 NOT NULL,
	`candidates_created` integer DEFAULT 0 NOT NULL,
	`candidates_updated` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "external_sync_runs_status_check" CHECK("external_sync_runs"."status" in ('running', 'success', 'partial', 'error'))
);
--> statement-breakpoint
CREATE INDEX `external_sync_runs_connection_started_idx` ON `external_sync_runs` (`connection_id`,"started_at" desc);--> statement-breakpoint
CREATE TABLE `external_transaction_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`stable_key` text NOT NULL,
	`suggested_event_type` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` text NOT NULL,
	`title` text NOT NULL,
	`normalization_version` integer NOT NULL,
	`source_fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "external_candidates_event_type_check" CHECK("external_transaction_candidates"."suggested_event_type" in ('exchange', 'transfer', 'income', 'expense', 'unknown')),
	CONSTRAINT "external_candidates_status_check" CHECK("external_transaction_candidates"."status" in ('pending', 'needs_mapping', 'ignored', 'imported', 'unsupported', 'source_changed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_candidates_stable_key_unique` ON `external_transaction_candidates` (`connection_id`,`stable_key`);--> statement-breakpoint
CREATE INDEX `external_candidates_status_time_idx` ON `external_transaction_candidates` (`connection_id`,`status`,"occurred_at" desc);--> statement-breakpoint
CREATE TABLE `external_transaction_legs` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`leg_index` integer NOT NULL,
	`role` text NOT NULL,
	`provider_asset_key` text NOT NULL,
	`talli_asset_id` text,
	`amount_text` text NOT NULL,
	`amount_atomic` text,
	`precision_status` text NOT NULL,
	`note` text,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`talli_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_transaction_legs_index_check" CHECK("external_transaction_legs"."leg_index" >= 0),
	CONSTRAINT "external_transaction_legs_role_check" CHECK("external_transaction_legs"."role" in ('source', 'destination', 'fee', 'external_in', 'external_out', 'unknown')),
	CONSTRAINT "external_transaction_legs_precision_check" CHECK("external_transaction_legs"."precision_status" in ('exact', 'excess_precision', 'unmapped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_transaction_legs_candidate_index_unique` ON `external_transaction_legs` (`candidate_id`,`leg_index`);
