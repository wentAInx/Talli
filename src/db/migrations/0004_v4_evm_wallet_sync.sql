CREATE TABLE `evm_balance_observation_details` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`asset_kind` text NOT NULL,
	`contract_address_lower` text,
	`raw_amount_atomic_text` text NOT NULL,
	`token_decimals` integer NOT NULL,
	`sync_head_block_text` text,
	FOREIGN KEY (`observation_id`) REFERENCES `external_balance_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_balance_details_chain_check" CHECK("evm_balance_observation_details"."chain_id" = 1),
	CONSTRAINT "evm_balance_details_kind_check" CHECK("evm_balance_observation_details"."asset_kind" in ('native', 'erc20')),
	CONSTRAINT "evm_balance_details_decimals_check" CHECK("evm_balance_observation_details"."token_decimals" >= 0 and "evm_balance_observation_details"."token_decimals" <= 255),
	CONSTRAINT "evm_balance_details_contract_check" CHECK(("evm_balance_observation_details"."asset_kind" = 'native' and "evm_balance_observation_details"."contract_address_lower" is null) or ("evm_balance_observation_details"."asset_kind" = 'erc20' and "evm_balance_observation_details"."contract_address_lower" is not null))
);
--> statement-breakpoint
CREATE TABLE `evm_candidate_details` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`candidate_kind` text NOT NULL,
	`classification` text NOT NULL,
	`tx_status` text NOT NULL,
	`block_number_text` text,
	`block_timestamp` text,
	`from_address_lower` text NOT NULL,
	`to_address_lower` text,
	`gas_fee_atomic_text` text,
	`gas_fee_status` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_candidate_details_chain_check" CHECK("evm_candidate_details"."chain_id" = 1),
	CONSTRAINT "evm_candidate_details_kind_check" CHECK("evm_candidate_details"."candidate_kind" in ('movement', 'gas')),
	CONSTRAINT "evm_candidate_details_classification_check" CHECK("evm_candidate_details"."classification" in ('simple_in', 'simple_out', 'simple_exchange', 'gas_only', 'complex', 'unsupported')),
	CONSTRAINT "evm_candidate_details_tx_status_check" CHECK("evm_candidate_details"."tx_status" in ('success', 'failed', 'unknown')),
	CONSTRAINT "evm_candidate_details_gas_status_check" CHECK("evm_candidate_details"."gas_fee_status" in ('exact', 'not_applicable', 'unresolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evm_candidate_details_tx_kind_unique` ON `evm_candidate_details` (`chain_id`,`tx_hash`,`candidate_kind`);--> statement-breakpoint
CREATE TABLE `evm_wallet_connection_state` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`last_finalized_block_text` text,
	`last_balance_sync_at` text,
	`last_activity_sync_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `evm_wallet_connections`(`connection_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `evm_wallet_connections` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`network_id` text NOT NULL,
	`address_lower` text NOT NULL,
	`address_display` text NOT NULL,
	`data_provider` text NOT NULL,
	`history_start_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `external_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_wallet_connections_chain_check" CHECK("evm_wallet_connections"."chain_id" = 1),
	CONSTRAINT "evm_wallet_connections_network_check" CHECK("evm_wallet_connections"."network_id" = 'eth-mainnet'),
	CONSTRAINT "evm_wallet_connections_provider_check" CHECK("evm_wallet_connections"."data_provider" = 'alchemy')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evm_wallet_connections_chain_address_unique` ON `evm_wallet_connections` (`chain_id`,`address_lower`);--> statement-breakpoint
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
	CONSTRAINT "external_connections_provider_check" CHECK("__new_external_connections"."provider" in ('kraken', 'evm_wallet')),
	CONSTRAINT "external_connections_enabled_check" CHECK("__new_external_connections"."is_enabled" in (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_external_connections`("id", "book_id", "provider", "source_key", "name", "credential_ref", "is_enabled", "created_at", "updated_at") SELECT "id", "book_id", "provider", 'kraken:primary', "name", "credential_ref", "is_enabled", "created_at", "updated_at" FROM `external_connections`;--> statement-breakpoint
CREATE TABLE `__v4_connection_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v4_connection_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v4_connection_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_external_connections`) = (SELECT count(*) FROM `external_connections`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v4_connection_count_guard`;--> statement-breakpoint
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
	CONSTRAINT "external_source_objects_type_check" CHECK("__new_external_source_objects"."object_type" in ('kraken_ledger', 'kraken_trade', 'evm_transaction', 'evm_transfer'))
);
--> statement-breakpoint
INSERT INTO `__new_external_source_objects`("id", "connection_id", "object_type", "external_id", "occurred_at", "payload_json", "payload_hash", "first_seen_at", "last_seen_at") SELECT "id", "connection_id", "object_type", "external_id", "occurred_at", "payload_json", "payload_hash", "first_seen_at", "last_seen_at" FROM `external_source_objects`;--> statement-breakpoint
CREATE TABLE `__v4_source_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v4_source_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v4_source_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_external_source_objects`) = (SELECT count(*) FROM `external_source_objects`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v4_source_count_guard`;--> statement-breakpoint
DROP TABLE `external_source_objects`;--> statement-breakpoint
ALTER TABLE `__new_external_source_objects` RENAME TO `external_source_objects`;--> statement-breakpoint
CREATE UNIQUE INDEX `external_source_objects_identity_unique` ON `external_source_objects` (`connection_id`,`object_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_source_objects_time_idx` ON `external_source_objects` (`connection_id`,`occurred_at` DESC);
