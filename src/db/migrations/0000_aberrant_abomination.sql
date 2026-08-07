CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`name` text NOT NULL,
	`account_type` text NOT NULL,
	`institution_name` text,
	`note` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "accounts_type_check" CHECK("accounts"."account_type" in ('cash', 'bank', 'ewallet', 'exchange', 'crypto_wallet', 'credit', 'loan', 'other')),
	CONSTRAINT "accounts_is_archived_check" CHECK("accounts"."is_archived" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `idx_accounts_book` ON `accounts` (`book_id`);--> statement-breakpoint
CREATE INDEX `idx_accounts_asset` ON `accounts` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_accounts_archived` ON `accounts` (`is_archived`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text,
	`asset_type` text NOT NULL,
	`scale` integer NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "assets_type_check" CHECK("assets"."asset_type" in ('fiat', 'crypto', 'custom')),
	CONSTRAINT "assets_scale_check" CHECK("assets"."scale" >= 0 and "assets"."scale" <= 30),
	CONSTRAINT "assets_is_archived_check" CHECK("assets"."is_archived" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_code_unique_nocase` ON `assets` ("code" collate nocase);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`as_of` text NOT NULL,
	`balance_atomic` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "snapshots_balance_nonempty_check" CHECK(length("balance_snapshots"."balance_atomic") > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_account_asof` ON `balance_snapshots` (`account_id`,"as_of" desc);--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "books_is_default_check" CHECK("books"."is_default" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`category_type` text DEFAULT 'both' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "categories_type_check" CHECK("categories"."category_type" in ('expense', 'income', 'both')),
	CONSTRAINT "categories_is_archived_check" CHECK("categories"."is_archived" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `idx_categories_book` ON `categories` (`book_id`);--> statement-breakpoint
CREATE INDEX `idx_categories_parent` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `event_tags` (
	`event_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `tag_id`),
	FOREIGN KEY (`event_id`) REFERENCES `ledger_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_tags_tag` ON `event_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`account_id` text NOT NULL,
	`entry_role` text NOT NULL,
	`amount_atomic` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `ledger_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entries_role_check" CHECK("ledger_entries"."entry_role" in ('main', 'source', 'destination', 'fee')),
	CONSTRAINT "entries_amount_nonempty_check" CHECK(length("ledger_entries"."amount_atomic") > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_entries_event` ON `ledger_entries` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_entries_account` ON `ledger_entries` (`account_id`);--> statement-breakpoint
CREATE TABLE `ledger_events` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`category_id` text,
	`payee` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "events_type_check" CHECK("ledger_events"."event_type" in ('expense', 'income', 'transfer', 'exchange'))
);
--> statement-breakpoint
CREATE INDEX `idx_events_book_occurred` ON `ledger_events` (`book_id`,"occurred_at" desc);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `ledger_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_category` ON `ledger_events` (`category_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`name` text NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tags_is_archived_check" CHECK("tags"."is_archived" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_book_name_unique` ON `tags` (`book_id`,`name`);