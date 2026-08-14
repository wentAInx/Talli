CREATE TABLE `external_candidate_match_links` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`ledger_event_id` text NOT NULL,
	`matched_at` text NOT NULL,
	`match_fingerprint` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_event_id`) REFERENCES `ledger_events`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `external_candidate_match_ledger_event_idx` ON `external_candidate_match_links` (`ledger_event_id`);--> statement-breakpoint
CREATE TABLE `file_import_balance_observation_details` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`balance_kind` text NOT NULL,
	`source_date_text` text NOT NULL,
	`date_precision` text NOT NULL,
	`statement_currency_code` text NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `external_balance_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `file_import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_import_balance_kind_check" CHECK("file_import_balance_observation_details"."balance_kind" in ('closing_ledger', 'closing_booked')),
	CONSTRAINT "file_import_balance_date_precision_check" CHECK("file_import_balance_observation_details"."date_precision" in ('timestamp', 'day'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_import_balance_batch_unique` ON `file_import_balance_observation_details` (`batch_id`);--> statement-breakpoint
CREATE TABLE `file_import_batch_source_objects` (
	`batch_id` text NOT NULL,
	`source_object_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`raw_row_sha256` text NOT NULL,
	PRIMARY KEY(`batch_id`, `source_object_id`),
	FOREIGN KEY (`batch_id`) REFERENCES `file_import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_object_id`) REFERENCES `external_source_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_import_batch_source_row_check" CHECK("file_import_batch_source_objects"."row_index" >= 0),
	CONSTRAINT "file_import_batch_source_hash_check" CHECK(length("file_import_batch_source_objects"."raw_row_sha256") = 64 and "file_import_batch_source_objects"."raw_row_sha256" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_import_batch_source_row_unique` ON `file_import_batch_source_objects` (`batch_id`,`row_index`);--> statement-breakpoint
CREATE TABLE `file_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`file_sha256` text NOT NULL,
	`original_filename` text NOT NULL,
	`format` text NOT NULL,
	`parser_version` integer NOT NULL,
	`ingested_at` text NOT NULL,
	`source_row_count` integer NOT NULL,
	`new_candidate_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`unsupported_count` integer NOT NULL,
	`statement_from_date` text,
	`statement_to_date` text,
	FOREIGN KEY (`connection_id`) REFERENCES `file_import_profiles`(`connection_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_import_batches_hash_check" CHECK(length("file_import_batches"."file_sha256") = 64 and "file_import_batches"."file_sha256" not glob '*[^0-9a-f]*'),
	CONSTRAINT "file_import_batches_filename_check" CHECK(length("file_import_batches"."original_filename") between 1 and 255),
	CONSTRAINT "file_import_batches_format_check" CHECK("file_import_batches"."format" in ('csv', 'ofx', 'qfx', 'camt053')),
	CONSTRAINT "file_import_batches_parser_version_check" CHECK("file_import_batches"."parser_version" > 0),
	CONSTRAINT "file_import_batches_counts_check" CHECK("file_import_batches"."source_row_count" >= 0 and "file_import_batches"."new_candidate_count" >= 0 and "file_import_batches"."duplicate_count" >= 0 and "file_import_batches"."unsupported_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_import_batches_connection_hash_unique` ON `file_import_batches` (`connection_id`,`file_sha256`);--> statement-breakpoint
CREATE INDEX `file_import_batches_connection_ingested_idx` ON `file_import_batches` (`connection_id`,"ingested_at" desc);--> statement-breakpoint
CREATE TABLE `file_import_candidate_details` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`target_account_id` text NOT NULL,
	`direction` text NOT NULL,
	`normalized_payee` text,
	`memo` text,
	`source_date_text` text NOT NULL,
	`date_precision` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "file_import_candidate_direction_check" CHECK("file_import_candidate_details"."direction" in ('in', 'out')),
	CONSTRAINT "file_import_candidate_date_precision_check" CHECK("file_import_candidate_details"."date_precision" in ('timestamp', 'day'))
);
--> statement-breakpoint
CREATE INDEX `file_import_candidate_target_account_idx` ON `file_import_candidate_details` (`target_account_id`);--> statement-breakpoint
CREATE TABLE `file_import_profiles` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`target_account_id` text NOT NULL,
	`format` text NOT NULL,
	`parser_config_json` text NOT NULL,
	`statement_account_fingerprint` text,
	`statement_account_last4` text,
	`statement_currency_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "file_import_profiles_format_check" CHECK("file_import_profiles"."format" in ('csv', 'ofx', 'qfx', 'camt053')),
	CONSTRAINT "file_import_profiles_config_check" CHECK(length("file_import_profiles"."parser_config_json") > 0),
	CONSTRAINT "file_import_profiles_fingerprint_check" CHECK("file_import_profiles"."statement_account_fingerprint" is null or (length("file_import_profiles"."statement_account_fingerprint") = 64 and "file_import_profiles"."statement_account_fingerprint" not glob '*[^0-9a-f]*')),
	CONSTRAINT "file_import_profiles_last4_check" CHECK("file_import_profiles"."statement_account_last4" is null or (length("file_import_profiles"."statement_account_last4") between 1 and 4))
);
--> statement-breakpoint
CREATE INDEX `file_import_profiles_target_account_idx` ON `file_import_profiles` (`target_account_id`);--> statement-breakpoint
CREATE TABLE `file_import_source_details` (
	`source_object_id` text PRIMARY KEY NOT NULL,
	`identity_strength` text NOT NULL,
	`source_id_kind` text NOT NULL,
	`original_date_text` text NOT NULL,
	`date_precision` text NOT NULL,
	`normalized_payee` text,
	`memo` text,
	`statement_currency_code` text,
	FOREIGN KEY (`source_object_id`) REFERENCES `external_source_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_import_source_details_strength_check" CHECK("file_import_source_details"."identity_strength" in ('strong', 'weak')),
	CONSTRAINT "file_import_source_details_id_kind_check" CHECK("file_import_source_details"."source_id_kind" in ('fitid', 'acct_svcr_ref', 'tx_id', 'ntry_ref', 'csv_id', 'weak_signature')),
	CONSTRAINT "file_import_source_details_date_precision_check" CHECK("file_import_source_details"."date_precision" in ('timestamp', 'day'))
);
--> statement-breakpoint
CREATE TABLE `__new_external_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`credential_ref` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_connections_provider_check" CHECK("__new_external_connections"."provider" in ('kraken', 'evm_wallet', 'file_import')),
	CONSTRAINT "external_connections_enabled_check" CHECK("__new_external_connections"."is_enabled" in (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_external_connections`("id", "book_id", "provider", "source_key", "name", "credential_ref", "is_enabled", "created_at", "updated_at") SELECT "id", "book_id", "provider", "source_key", "name", "credential_ref", "is_enabled", "created_at", "updated_at" FROM `external_connections`;--> statement-breakpoint
CREATE TABLE `__v5_connection_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v5_connection_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v5_connection_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_external_connections`) = (SELECT count(*) FROM `external_connections`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v5_connection_count_guard`;--> statement-breakpoint
DROP TABLE `external_connections`;--> statement-breakpoint
ALTER TABLE `__new_external_connections` RENAME TO `external_connections`;--> statement-breakpoint
CREATE UNIQUE INDEX `external_connections_book_provider_source_unique` ON `external_connections` (`book_id`,`provider`,`source_key`);--> statement-breakpoint
CREATE INDEX `external_connections_book_provider_idx` ON `external_connections` (`book_id`,`provider`,`is_enabled`);--> statement-breakpoint
CREATE TABLE `__new_external_source_objects` (
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
	CONSTRAINT "external_source_objects_type_check" CHECK("__new_external_source_objects"."object_type" in ('kraken_ledger', 'kraken_trade', 'evm_transaction', 'evm_transfer', 'file_transaction'))
);
--> statement-breakpoint
INSERT INTO `__new_external_source_objects`("id", "connection_id", "object_type", "external_id", "occurred_at", "payload_json", "payload_hash", "first_seen_at", "last_seen_at") SELECT "id", "connection_id", "object_type", "external_id", "occurred_at", "payload_json", "payload_hash", "first_seen_at", "last_seen_at" FROM `external_source_objects`;--> statement-breakpoint
CREATE TABLE `__v5_source_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v5_source_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v5_source_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_external_source_objects`) = (SELECT count(*) FROM `external_source_objects`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v5_source_count_guard`;--> statement-breakpoint
DROP TABLE `external_source_objects`;--> statement-breakpoint
ALTER TABLE `__new_external_source_objects` RENAME TO `external_source_objects`;--> statement-breakpoint
CREATE UNIQUE INDEX `external_source_objects_identity_unique` ON `external_source_objects` (`connection_id`,`object_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_source_objects_time_idx` ON `external_source_objects` (`connection_id`,`occurred_at` DESC);--> statement-breakpoint
CREATE TABLE `__new_external_transaction_candidates` (
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
	CONSTRAINT "external_candidates_event_type_check" CHECK("__new_external_transaction_candidates"."suggested_event_type" in ('exchange', 'transfer', 'income', 'expense', 'unknown')),
	CONSTRAINT "external_candidates_status_check" CHECK("__new_external_transaction_candidates"."status" in ('pending', 'needs_mapping', 'ignored', 'imported', 'matched', 'unsupported', 'source_changed'))
);
--> statement-breakpoint
INSERT INTO `__new_external_transaction_candidates`("id", "connection_id", "stable_key", "suggested_event_type", "status", "occurred_at", "title", "normalization_version", "source_fingerprint", "created_at", "updated_at", "last_seen_at") SELECT "id", "connection_id", "stable_key", "suggested_event_type", "status", "occurred_at", "title", "normalization_version", "source_fingerprint", "created_at", "updated_at", "last_seen_at" FROM `external_transaction_candidates`;--> statement-breakpoint
CREATE TABLE `__v5_candidate_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v5_candidate_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v5_candidate_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_external_transaction_candidates`) = (SELECT count(*) FROM `external_transaction_candidates`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v5_candidate_count_guard`;--> statement-breakpoint
DROP TABLE `external_transaction_candidates`;--> statement-breakpoint
ALTER TABLE `__new_external_transaction_candidates` RENAME TO `external_transaction_candidates`;--> statement-breakpoint
CREATE UNIQUE INDEX `external_candidates_stable_key_unique` ON `external_transaction_candidates` (`connection_id`,`stable_key`);--> statement-breakpoint
CREATE INDEX `external_candidates_status_time_idx` ON `external_transaction_candidates` (`connection_id`,`status`,`occurred_at` DESC);--> statement-breakpoint
DROP INDEX `external_account_mappings_talli_account_unique`;--> statement-breakpoint
CREATE INDEX `external_account_mappings_talli_account_idx` ON `external_account_mappings` (`talli_account_id`);
