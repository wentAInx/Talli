CREATE TABLE `evm_l2_gas_fee_details` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`fee_model` text NOT NULL,
	`execution_fee_atomic_text` text,
	`parent_data_fee_atomic_text` text,
	`operator_fee_atomic_text` text,
	`total_fee_atomic_text` text,
	`fee_status` text NOT NULL,
	`evidence_json` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_l2_gas_fee_chain_model_check" CHECK(("evm_l2_gas_fee_details"."chain_id" = 8453 and "evm_l2_gas_fee_details"."fee_model" = 'base_op_stack') or ("evm_l2_gas_fee_details"."chain_id" = 42161 and "evm_l2_gas_fee_details"."fee_model" = 'arbitrum_nitro')),
	CONSTRAINT "evm_l2_gas_fee_exact_fields_check" CHECK(("evm_l2_gas_fee_details"."fee_status" = 'exact' and "evm_l2_gas_fee_details"."execution_fee_atomic_text" is not null and "evm_l2_gas_fee_details"."parent_data_fee_atomic_text" is not null and "evm_l2_gas_fee_details"."total_fee_atomic_text" is not null) or ("evm_l2_gas_fee_details"."fee_status" = 'unresolved' and "evm_l2_gas_fee_details"."total_fee_atomic_text" is null)),
	CONSTRAINT "evm_l2_gas_fee_operator_check" CHECK(("evm_l2_gas_fee_details"."chain_id" = 8453 and (("evm_l2_gas_fee_details"."fee_status" = 'exact' and "evm_l2_gas_fee_details"."operator_fee_atomic_text" is not null) or "evm_l2_gas_fee_details"."fee_status" = 'unresolved')) or ("evm_l2_gas_fee_details"."chain_id" = 42161 and "evm_l2_gas_fee_details"."operator_fee_atomic_text" is null))
);
--> statement-breakpoint
CREATE TABLE `__new_evm_balance_observation_details` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`asset_kind` text NOT NULL,
	`contract_address_lower` text,
	`raw_amount_atomic_text` text NOT NULL,
	`token_decimals` integer,
	`sync_head_block_text` text,
	FOREIGN KEY (`observation_id`) REFERENCES `external_balance_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_balance_details_chain_check" CHECK("__new_evm_balance_observation_details"."chain_id" in (1, 8453, 42161)),
	CONSTRAINT "evm_balance_details_kind_check" CHECK("__new_evm_balance_observation_details"."asset_kind" in ('native', 'erc20')),
	CONSTRAINT "evm_balance_details_decimals_check" CHECK("__new_evm_balance_observation_details"."token_decimals" is null or ("__new_evm_balance_observation_details"."token_decimals" >= 0 and "__new_evm_balance_observation_details"."token_decimals" <= 255)),
	CONSTRAINT "evm_balance_details_contract_check" CHECK(("__new_evm_balance_observation_details"."asset_kind" = 'native' and "__new_evm_balance_observation_details"."contract_address_lower" is null and "__new_evm_balance_observation_details"."token_decimals" = 18) or ("__new_evm_balance_observation_details"."asset_kind" = 'erc20' and "__new_evm_balance_observation_details"."contract_address_lower" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_evm_balance_observation_details`("observation_id", "chain_id", "asset_kind", "contract_address_lower", "raw_amount_atomic_text", "token_decimals", "sync_head_block_text") SELECT "observation_id", "chain_id", "asset_kind", "contract_address_lower", "raw_amount_atomic_text", "token_decimals", "sync_head_block_text" FROM `evm_balance_observation_details`;--> statement-breakpoint
CREATE TABLE `__v41_evm_balance_detail_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v41_evm_balance_detail_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v41_evm_balance_detail_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_evm_balance_observation_details`) = (SELECT count(*) FROM `evm_balance_observation_details`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v41_evm_balance_detail_count_guard`;--> statement-breakpoint
DROP TABLE `evm_balance_observation_details`;--> statement-breakpoint
ALTER TABLE `__new_evm_balance_observation_details` RENAME TO `evm_balance_observation_details`;--> statement-breakpoint
CREATE TABLE `__new_evm_candidate_details` (
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
	`native_trace_status` text DEFAULT 'not_required' NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `external_transaction_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_candidate_details_chain_check" CHECK("__new_evm_candidate_details"."chain_id" in (1, 8453, 42161)),
	CONSTRAINT "evm_candidate_details_kind_check" CHECK("__new_evm_candidate_details"."candidate_kind" in ('movement', 'gas')),
	CONSTRAINT "evm_candidate_details_classification_check" CHECK("__new_evm_candidate_details"."classification" in ('simple_in', 'simple_out', 'simple_exchange', 'gas_only', 'complex', 'unsupported')),
	CONSTRAINT "evm_candidate_details_tx_status_check" CHECK("__new_evm_candidate_details"."tx_status" in ('success', 'failed', 'unknown')),
	CONSTRAINT "evm_candidate_details_gas_status_check" CHECK("__new_evm_candidate_details"."gas_fee_status" in ('exact', 'not_applicable', 'unresolved')),
	CONSTRAINT "evm_candidate_details_trace_status_check" CHECK("__new_evm_candidate_details"."native_trace_status" in ('not_required', 'exact', 'trace_unavailable', 'trace_invalid'))
);
--> statement-breakpoint
INSERT INTO `__new_evm_candidate_details`("candidate_id", "chain_id", "tx_hash", "candidate_kind", "classification", "tx_status", "block_number_text", "block_timestamp", "from_address_lower", "to_address_lower", "gas_fee_atomic_text", "gas_fee_status", "native_trace_status") SELECT "candidate_id", "chain_id", "tx_hash", "candidate_kind", "classification", "tx_status", "block_number_text", "block_timestamp", "from_address_lower", "to_address_lower", "gas_fee_atomic_text", "gas_fee_status", 'not_required' FROM `evm_candidate_details`;--> statement-breakpoint
CREATE TABLE `__v41_evm_candidate_detail_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v41_evm_candidate_detail_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v41_evm_candidate_detail_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_evm_candidate_details`) = (SELECT count(*) FROM `evm_candidate_details`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v41_evm_candidate_detail_count_guard`;--> statement-breakpoint
DROP TABLE `evm_candidate_details`;--> statement-breakpoint
ALTER TABLE `__new_evm_candidate_details` RENAME TO `evm_candidate_details`;--> statement-breakpoint
CREATE UNIQUE INDEX `evm_candidate_details_tx_kind_unique` ON `evm_candidate_details` (`chain_id`,`tx_hash`,`candidate_kind`);--> statement-breakpoint
CREATE TABLE `__new_evm_wallet_connections` (
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
	CONSTRAINT "evm_wallet_connections_chain_network_check" CHECK(("__new_evm_wallet_connections"."chain_id" = 1 and "__new_evm_wallet_connections"."network_id" = 'eth-mainnet') or ("__new_evm_wallet_connections"."chain_id" = 8453 and "__new_evm_wallet_connections"."network_id" = 'base-mainnet') or ("__new_evm_wallet_connections"."chain_id" = 42161 and "__new_evm_wallet_connections"."network_id" = 'arb-mainnet')),
	CONSTRAINT "evm_wallet_connections_provider_check" CHECK("__new_evm_wallet_connections"."data_provider" = 'alchemy')
);
--> statement-breakpoint
INSERT INTO `__new_evm_wallet_connections`("connection_id", "chain_id", "network_id", "address_lower", "address_display", "data_provider", "history_start_at", "created_at", "updated_at") SELECT "connection_id", "chain_id", "network_id", "address_lower", "address_display", "data_provider", "history_start_at", "created_at", "updated_at" FROM `evm_wallet_connections`;--> statement-breakpoint
CREATE TABLE `__v41_evm_wallet_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v41_evm_wallet_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v41_evm_wallet_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_evm_wallet_connections`) = (SELECT count(*) FROM `evm_wallet_connections`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v41_evm_wallet_count_guard`;--> statement-breakpoint
DROP TABLE `evm_wallet_connections`;--> statement-breakpoint
ALTER TABLE `__new_evm_wallet_connections` RENAME TO `evm_wallet_connections`;--> statement-breakpoint
CREATE UNIQUE INDEX `evm_wallet_connections_chain_address_unique` ON `evm_wallet_connections` (`chain_id`,`address_lower`);--> statement-breakpoint
CREATE TABLE `__new_evm_wallet_connection_state` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`last_finalized_block_text` text,
	`last_balance_sync_at` text,
	`last_activity_sync_at` text,
	`trace_capability_status` text DEFAULT 'unknown' NOT NULL,
	`trace_checked_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `evm_wallet_connections`(`connection_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_wallet_state_trace_capability_check" CHECK("__new_evm_wallet_connection_state"."trace_capability_status" in ('unknown', 'trace_available', 'trace_unavailable'))
);
--> statement-breakpoint
INSERT INTO `__new_evm_wallet_connection_state`("connection_id", "last_finalized_block_text", "last_balance_sync_at", "last_activity_sync_at", "trace_capability_status", "trace_checked_at", "updated_at") SELECT "connection_id", "last_finalized_block_text", "last_balance_sync_at", "last_activity_sync_at", 'unknown', NULL, "updated_at" FROM `evm_wallet_connection_state`;--> statement-breakpoint
CREATE TABLE `__v41_evm_wallet_state_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v41_evm_wallet_state_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v41_evm_wallet_state_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_evm_wallet_connection_state`) = (SELECT count(*) FROM `evm_wallet_connection_state`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v41_evm_wallet_state_count_guard`;--> statement-breakpoint
DROP TABLE `evm_wallet_connection_state`;--> statement-breakpoint
ALTER TABLE `__new_evm_wallet_connection_state` RENAME TO `evm_wallet_connection_state`;
