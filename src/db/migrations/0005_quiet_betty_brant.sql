CREATE TABLE `__new_evm_balance_observation_details` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`asset_kind` text NOT NULL,
	`contract_address_lower` text,
	`raw_amount_atomic_text` text NOT NULL,
	`token_decimals` integer,
	`sync_head_block_text` text,
	FOREIGN KEY (`observation_id`) REFERENCES `external_balance_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evm_balance_details_chain_check" CHECK("__new_evm_balance_observation_details"."chain_id" = 1),
	CONSTRAINT "evm_balance_details_kind_check" CHECK("__new_evm_balance_observation_details"."asset_kind" in ('native', 'erc20')),
	CONSTRAINT "evm_balance_details_decimals_check" CHECK("__new_evm_balance_observation_details"."token_decimals" is null or ("__new_evm_balance_observation_details"."token_decimals" >= 0 and "__new_evm_balance_observation_details"."token_decimals" <= 255)),
	CONSTRAINT "evm_balance_details_contract_check" CHECK(("__new_evm_balance_observation_details"."asset_kind" = 'native' and "__new_evm_balance_observation_details"."contract_address_lower" is null) or ("__new_evm_balance_observation_details"."asset_kind" = 'erc20' and "__new_evm_balance_observation_details"."contract_address_lower" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_evm_balance_observation_details`("observation_id", "chain_id", "asset_kind", "contract_address_lower", "raw_amount_atomic_text", "token_decimals", "sync_head_block_text") SELECT "observation_id", "chain_id", "asset_kind", "contract_address_lower", "raw_amount_atomic_text", "token_decimals", "sync_head_block_text" FROM `evm_balance_observation_details`;--> statement-breakpoint
CREATE TABLE `__v5_evm_balance_detail_count_guard` (`ok` integer NOT NULL, CONSTRAINT "v5_evm_balance_detail_count_guard_check" CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__v5_evm_balance_detail_count_guard` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `__new_evm_balance_observation_details`) = (SELECT count(*) FROM `evm_balance_observation_details`) THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__v5_evm_balance_detail_count_guard`;--> statement-breakpoint
DROP TABLE `evm_balance_observation_details`;--> statement-breakpoint
ALTER TABLE `__new_evm_balance_observation_details` RENAME TO `evm_balance_observation_details`;
