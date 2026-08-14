CREATE TABLE `automation_rule_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`position` integer NOT NULL,
	`action_type` text NOT NULL,
	`value_json` text NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_rule_actions_position_check" CHECK("automation_rule_actions"."position" >= 0),
	CONSTRAINT "automation_rule_actions_type_check" CHECK("automation_rule_actions"."action_type" in ('set_payee', 'set_category', 'add_tag', 'set_note', 'append_note', 'suggest_event_type')),
	CONSTRAINT "automation_rule_actions_value_check" CHECK(length("automation_rule_actions"."value_json") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_rule_actions_rule_position_unique` ON `automation_rule_actions` (`rule_id`,`position`);--> statement-breakpoint
CREATE TABLE `automation_rule_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`position` integer NOT NULL,
	`field` text NOT NULL,
	`operator` text NOT NULL,
	`value_json` text NOT NULL,
	`is_negated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_rule_conditions_position_check" CHECK("automation_rule_conditions"."position" >= 0),
	CONSTRAINT "automation_rule_conditions_field_check" CHECK("automation_rule_conditions"."field" in ('source_payee', 'projected_payee', 'memo', 'file_profile', 'target_account', 'source_format', 'direction', 'amount_abs', 'identity_strength')),
	CONSTRAINT "automation_rule_conditions_operator_check" CHECK("automation_rule_conditions"."operator" in ('equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'gt', 'gte', 'lt', 'lte', 'between')),
	CONSTRAINT "automation_rule_conditions_value_check" CHECK(length("automation_rule_conditions"."value_json") > 0),
	CONSTRAINT "automation_rule_conditions_negated_check" CHECK("automation_rule_conditions"."is_negated" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_rule_conditions_rule_position_unique` ON `automation_rule_conditions` (`rule_id`,`position`);--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`name` text NOT NULL,
	`target_scope` text DEFAULT 'file_import_candidate' NOT NULL,
	`stage` text NOT NULL,
	`match_mode` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_rules_scope_check" CHECK("automation_rules"."target_scope" = 'file_import_candidate'),
	CONSTRAINT "automation_rules_stage_check" CHECK("automation_rules"."stage" in ('pre', 'default', 'post')),
	CONSTRAINT "automation_rules_match_mode_check" CHECK("automation_rules"."match_mode" in ('all', 'any')),
	CONSTRAINT "automation_rules_enabled_check" CHECK("automation_rules"."is_enabled" in (0, 1)),
	CONSTRAINT "automation_rules_name_check" CHECK(length("automation_rules"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE INDEX `automation_rules_book_scope_order_idx` ON `automation_rules` (`book_id`,`target_scope`,`stage`,`sort_order`,`id`);--> statement-breakpoint
CREATE TABLE `recurring_item_tags` (
	`recurring_item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recurring_item_id`, `tag_id`),
	FOREIGN KEY (`recurring_item_id`) REFERENCES `recurring_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recurring_item_tags_tag_idx` ON `recurring_item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `recurring_items` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`account_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`name` text NOT NULL,
	`event_type` text NOT NULL,
	`payee_text` text,
	`payee_match_mode` text DEFAULT 'any' NOT NULL,
	`category_id` text,
	`note` text,
	`amount_mode` text NOT NULL,
	`amount_atomic_text` text,
	`tolerance_bps` integer,
	`min_amount_atomic_text` text,
	`max_amount_atomic_text` text,
	`frequency` text NOT NULL,
	`interval_count` integer NOT NULL,
	`anchor_date` text NOT NULL,
	`monthly_day_mode` text,
	`date_window_before_days` integer DEFAULT 2 NOT NULL,
	`date_window_after_days` integer DEFAULT 2 NOT NULL,
	`starts_on` text,
	`ends_on` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "recurring_items_event_type_check" CHECK("recurring_items"."event_type" in ('expense', 'income')),
	CONSTRAINT "recurring_items_payee_mode_check" CHECK("recurring_items"."payee_match_mode" in ('any', 'exact', 'contains')),
	CONSTRAINT "recurring_items_amount_mode_check" CHECK("recurring_items"."amount_mode" in ('exact', 'approx', 'range')),
	CONSTRAINT "recurring_items_amount_shape_check" CHECK(("recurring_items"."amount_mode" = 'exact' and "recurring_items"."amount_atomic_text" is not null and "recurring_items"."tolerance_bps" is null and "recurring_items"."min_amount_atomic_text" is null and "recurring_items"."max_amount_atomic_text" is null) or ("recurring_items"."amount_mode" = 'approx' and "recurring_items"."amount_atomic_text" is not null and "recurring_items"."tolerance_bps" between 0 and 10000 and "recurring_items"."min_amount_atomic_text" is null and "recurring_items"."max_amount_atomic_text" is null) or ("recurring_items"."amount_mode" = 'range' and "recurring_items"."amount_atomic_text" is null and "recurring_items"."tolerance_bps" is null and "recurring_items"."min_amount_atomic_text" is not null and "recurring_items"."max_amount_atomic_text" is not null)),
	CONSTRAINT "recurring_items_amount_atomic_check" CHECK(("recurring_items"."amount_atomic_text" is null or ("recurring_items"."amount_atomic_text" not glob '*[^0-9]*' and length("recurring_items"."amount_atomic_text") > 0 and "recurring_items"."amount_atomic_text" <> '0')) and ("recurring_items"."min_amount_atomic_text" is null or ("recurring_items"."min_amount_atomic_text" not glob '*[^0-9]*' and length("recurring_items"."min_amount_atomic_text") > 0 and "recurring_items"."min_amount_atomic_text" <> '0')) and ("recurring_items"."max_amount_atomic_text" is null or ("recurring_items"."max_amount_atomic_text" not glob '*[^0-9]*' and length("recurring_items"."max_amount_atomic_text") > 0 and "recurring_items"."max_amount_atomic_text" <> '0'))),
	CONSTRAINT "recurring_items_frequency_check" CHECK("recurring_items"."frequency" in ('daily', 'weekly', 'monthly', 'yearly')),
	CONSTRAINT "recurring_items_interval_check" CHECK("recurring_items"."interval_count" between 1 and 10000),
	CONSTRAINT "recurring_items_monthly_mode_check" CHECK(("recurring_items"."frequency" = 'monthly' and "recurring_items"."monthly_day_mode" in ('fixed', 'last')) or ("recurring_items"."frequency" <> 'monthly' and "recurring_items"."monthly_day_mode" is null)),
	CONSTRAINT "recurring_items_window_check" CHECK("recurring_items"."date_window_before_days" between 0 and 31 and "recurring_items"."date_window_after_days" between 0 and 31),
	CONSTRAINT "recurring_items_active_check" CHECK("recurring_items"."is_active" in (0, 1)),
	CONSTRAINT "recurring_items_name_check" CHECK(length("recurring_items"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE INDEX `recurring_items_book_active_idx` ON `recurring_items` (`book_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `recurring_items_account_idx` ON `recurring_items` (`account_id`);--> statement-breakpoint
CREATE TABLE `recurring_occurrence_links` (
	`recurring_item_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`ledger_event_id` text NOT NULL,
	`linked_at` text NOT NULL,
	PRIMARY KEY(`recurring_item_id`, `occurrence_date`),
	FOREIGN KEY (`recurring_item_id`) REFERENCES `recurring_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ledger_event_id`) REFERENCES `ledger_events`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_occurrence_links_event_unique` ON `recurring_occurrence_links` (`ledger_event_id`);--> statement-breakpoint
CREATE TABLE `recurring_occurrence_skips` (
	`recurring_item_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`skipped_at` text NOT NULL,
	`note` text,
	PRIMARY KEY(`recurring_item_id`, `occurrence_date`),
	FOREIGN KEY (`recurring_item_id`) REFERENCES `recurring_items`(`id`) ON UPDATE no action ON DELETE cascade
);
