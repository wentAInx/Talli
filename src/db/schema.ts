import { desc, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const assetTypes = ["fiat", "crypto", "custom"] as const;
export const accountTypes = [
  "cash",
  "bank",
  "ewallet",
  "exchange",
  "crypto_wallet",
  "credit",
  "loan",
  "other",
] as const;
export const categoryTypes = ["expense", "income", "both"] as const;
export const eventTypes = [
  "expense",
  "income",
  "transfer",
  "exchange",
] as const;
export const entryRoles = ["main", "source", "destination", "fee"] as const;

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("books_is_default_check", sql`${table.isDefault} in (0, 1)`),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol"),
    assetType: text("asset_type", { enum: assetTypes }).notNull(),
    scale: integer("scale").notNull(),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("assets_code_unique_nocase").on(
      sql`${table.code} collate nocase`,
    ),
    check(
      "assets_type_check",
      sql`${table.assetType} in ('fiat', 'crypto', 'custom')`,
    ),
    check(
      "assets_scale_check",
      sql`${table.scale} >= 0 and ${table.scale} <= 30`,
    ),
    check("assets_is_archived_check", sql`${table.isArchived} in (0, 1)`),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    accountType: text("account_type", { enum: accountTypes }).notNull(),
    institutionName: text("institution_name"),
    note: text("note"),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_accounts_book").on(table.bookId),
    index("idx_accounts_asset").on(table.assetId),
    index("idx_accounts_archived").on(table.isArchived),
    check(
      "accounts_type_check",
      sql`${table.accountType} in ('cash', 'bank', 'ewallet', 'exchange', 'crypto_wallet', 'credit', 'loan', 'other')`,
    ),
    check("accounts_is_archived_check", sql`${table.isArchived} in (0, 1)`),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => categories.id,
      { onDelete: "restrict" },
    ),
    name: text("name").notNull(),
    categoryType: text("category_type", { enum: categoryTypes })
      .notNull()
      .default("both"),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_categories_book").on(table.bookId),
    index("idx_categories_parent").on(table.parentId),
    check(
      "categories_type_check",
      sql`${table.categoryType} in ('expense', 'income', 'both')`,
    ),
    check("categories_is_archived_check", sql`${table.isArchived} in (0, 1)`),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("tags_book_name_unique").on(table.bookId, table.name),
    check("tags_is_archived_check", sql`${table.isArchived} in (0, 1)`),
  ],
);

export const ledgerEvents = sqliteTable(
  "ledger_events",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    eventType: text("event_type", { enum: eventTypes }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    payee: text("payee"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_events_book_occurred").on(table.bookId, desc(table.occurredAt)),
    index("idx_events_book_order").on(
      table.bookId,
      desc(table.occurredAt),
      desc(table.createdAt),
      desc(table.id),
    ),
    index("idx_events_type").on(table.eventType),
    index("idx_events_category").on(table.categoryId),
    check(
      "events_type_check",
      sql`${table.eventType} in ('expense', 'income', 'transfer', 'exchange')`,
    ),
  ],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => ledgerEvents.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    entryRole: text("entry_role", { enum: entryRoles }).notNull(),
    amountAtomic: text("amount_atomic").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_entries_event").on(table.eventId),
    index("idx_entries_account").on(table.accountId),
    check(
      "entries_role_check",
      sql`${table.entryRole} in ('main', 'source', 'destination', 'fee')`,
    ),
    check(
      "entries_amount_nonempty_check",
      sql`length(${table.amountAtomic}) > 0`,
    ),
  ],
);

export const eventTags = sqliteTable(
  "event_tags",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => ledgerEvents.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index("idx_event_tags_tag").on(table.tagId),
  ],
);

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    asOf: text("as_of").notNull(),
    balanceAtomic: text("balance_atomic").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_snapshots_account_asof").on(table.accountId, desc(table.asOf)),
    check(
      "snapshots_balance_nonempty_check",
      sql`length(${table.balanceAtomic}) > 0`,
    ),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type BookRow = typeof books.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type LedgerEventRow = typeof ledgerEvents.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type BalanceSnapshotRow = typeof balanceSnapshots.$inferSelect;
