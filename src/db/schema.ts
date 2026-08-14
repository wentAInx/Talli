import { desc, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
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
export const priceProviderIds = ["coingecko", "ecb"] as const;
export const externalQuoteKinds = ["spot", "reference"] as const;
export const externalProviderIds = [
  "kraken",
  "evm_wallet",
  "file_import",
] as const;
export const externalObjectTypes = [
  "kraken_ledger",
  "kraken_trade",
  "evm_transaction",
  "evm_transfer",
  "file_transaction",
] as const;
export const externalMappingStatuses = [
  "mapped",
  "unmapped",
  "ignored",
] as const;
export const externalSyncRunStatuses = [
  "running",
  "success",
  "partial",
  "error",
] as const;
export const externalCandidateEventTypes = [
  "exchange",
  "transfer",
  "income",
  "expense",
  "unknown",
] as const;
export const externalCandidateStatuses = [
  "pending",
  "needs_mapping",
  "ignored",
  "imported",
  "matched",
  "unsupported",
  "source_changed",
] as const;
export const externalPrecisionStatuses = [
  "exact",
  "excess_precision",
  "unmapped",
] as const;
export const externalCandidateSourceRelations = [
  "primary",
  "cross_check",
] as const;
export const externalTransactionLegRoles = [
  "source",
  "destination",
  "fee",
  "external_in",
  "external_out",
  "unknown",
] as const;
export const evmAssetKinds = ["native", "erc20"] as const;
export const evmCandidateKinds = ["movement", "gas"] as const;
export const evmCandidateClassifications = [
  "simple_in",
  "simple_out",
  "simple_exchange",
  "gas_only",
  "complex",
  "unsupported",
] as const;
export const evmTransactionStatuses = ["success", "failed", "unknown"] as const;
export const evmGasFeeStatuses = [
  "exact",
  "not_applicable",
  "unresolved",
] as const;
export const evmTraceCapabilityStatuses = [
  "unknown",
  "trace_available",
  "trace_unavailable",
] as const;
export const evmNativeTraceStatuses = [
  "not_required",
  "exact",
  "trace_unavailable",
  "trace_invalid",
] as const;
export const evmL2FeeModels = ["base_op_stack", "arbitrum_nitro"] as const;
export const evmL2FeeStatuses = ["exact", "unresolved"] as const;
export const fileImportFormats = ["csv", "ofx", "qfx", "camt053"] as const;
export const fileImportIdentityStrengths = ["strong", "weak"] as const;
export const fileImportSourceIdKinds = [
  "fitid",
  "acct_svcr_ref",
  "tx_id",
  "ntry_ref",
  "csv_id",
  "weak_signature",
] as const;
export const fileImportDatePrecisions = ["timestamp", "day"] as const;
export const fileImportDirections = ["in", "out"] as const;
export const fileImportBalanceKinds = [
  "closing_ledger",
  "closing_booked",
] as const;

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

export const bookValuationSettings = sqliteTable(
  "book_valuation_settings",
  {
    bookId: text("book_id")
      .primaryKey()
      .references(() => books.id, { onDelete: "cascade" }),
    homeAssetId: text("home_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_book_valuation_home_asset").on(table.homeAssetId)],
);

export const priceProviderMappings = sqliteTable(
  "price_provider_mappings",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: priceProviderIds }).notNull(),
    providerAssetKey: text("provider_asset_key").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    priority: integer("priority").notNull().default(100),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.provider] }),
    index("idx_price_provider_mappings_provider_enabled").on(
      table.provider,
      table.isEnabled,
      table.priority,
    ),
    check(
      "price_provider_mapping_provider_check",
      sql`${table.provider} in ('coingecko', 'ecb')`,
    ),
    check(
      "price_provider_mapping_enabled_check",
      sql`${table.isEnabled} in (0, 1)`,
    ),
    check(
      "price_provider_mapping_key_nonempty_check",
      sql`length(${table.providerAssetKey}) > 0`,
    ),
  ],
);

export const manualPriceQuotes = sqliteTable(
  "manual_price_quotes",
  {
    id: text("id").primaryKey(),
    baseAssetId: text("base_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    quoteAssetId: text("quote_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    rateText: text("rate_text").notNull(),
    observedAt: text("observed_at").notNull(),
    note: text("note"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "manual_quote_distinct_assets_check",
      sql`${table.baseAssetId} <> ${table.quoteAssetId}`,
    ),
    check(
      "manual_quote_rate_nonempty_check",
      sql`length(${table.rateText}) > 0`,
    ),
    check("manual_quote_active_check", sql`${table.isActive} in (0, 1)`),
    uniqueIndex("manual_price_quotes_one_active_pair")
      .on(table.baseAssetId, table.quoteAssetId)
      .where(sql`${table.isActive} = 1`),
    index("idx_manual_price_quotes_pair_observed").on(
      table.baseAssetId,
      table.quoteAssetId,
      desc(table.observedAt),
    ),
  ],
);

export const latestPriceQuotes = sqliteTable(
  "latest_price_quotes",
  {
    baseAssetId: text("base_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    quoteAssetId: text("quote_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: priceProviderIds }).notNull(),
    quoteKind: text("quote_kind", { enum: externalQuoteKinds }).notNull(),
    rateText: text("rate_text").notNull(),
    providerObservedAt: text("provider_observed_at"),
    providerObservationDate: text("provider_observation_date"),
    fetchedAt: text("fetched_at").notNull(),
    sourceMetadataJson: text("source_metadata_json"),
  },
  (table) => [
    primaryKey({
      columns: [table.baseAssetId, table.quoteAssetId, table.provider],
    }),
    index("idx_latest_price_quotes_provider_fetched").on(
      table.provider,
      desc(table.fetchedAt),
    ),
    check(
      "latest_quote_distinct_assets_check",
      sql`${table.baseAssetId} <> ${table.quoteAssetId}`,
    ),
    check(
      "latest_quote_provider_check",
      sql`${table.provider} in ('coingecko', 'ecb')`,
    ),
    check(
      "latest_quote_kind_check",
      sql`${table.quoteKind} in ('spot', 'reference')`,
    ),
    check(
      "latest_quote_rate_nonempty_check",
      sql`length(${table.rateText}) > 0`,
    ),
    check(
      "latest_quote_observation_check",
      sql`${table.providerObservedAt} is not null or ${table.providerObservationDate} is not null`,
    ),
  ],
);

export const priceProviderState = sqliteTable(
  "price_provider_state",
  {
    provider: text("provider", { enum: priceProviderIds }).primaryKey(),
    lastAttemptAt: text("last_attempt_at"),
    lastSuccessAt: text("last_success_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    cooldownUntil: text("cooldown_until"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "price_provider_state_provider_check",
      sql`${table.provider} in ('coingecko', 'ecb')`,
    ),
  ],
);

export const externalConnections = sqliteTable(
  "external_connections",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    provider: text("provider", { enum: externalProviderIds }).notNull(),
    sourceKey: text("source_key").notNull(),
    name: text("name").notNull(),
    credentialRef: text("credential_ref").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("external_connections_book_provider_source_unique").on(
      table.bookId,
      table.provider,
      table.sourceKey,
    ),
    index("external_connections_book_provider_idx").on(
      table.bookId,
      table.provider,
      table.isEnabled,
    ),
    check(
      "external_connections_provider_check",
      sql`${table.provider} in ('kraken', 'evm_wallet', 'file_import')`,
    ),
    check(
      "external_connections_enabled_check",
      sql`${table.isEnabled} in (0, 1)`,
    ),
  ],
);

export const fileImportProfiles = sqliteTable(
  "file_import_profiles",
  {
    connectionId: text("connection_id")
      .primaryKey()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    targetAccountId: text("target_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    format: text("format", { enum: fileImportFormats }).notNull(),
    parserConfigJson: text("parser_config_json").notNull(),
    statementAccountFingerprint: text("statement_account_fingerprint"),
    statementAccountLast4: text("statement_account_last4"),
    statementCurrencyCode: text("statement_currency_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("file_import_profiles_target_account_idx").on(table.targetAccountId),
    check(
      "file_import_profiles_format_check",
      sql`${table.format} in ('csv', 'ofx', 'qfx', 'camt053')`,
    ),
    check(
      "file_import_profiles_config_check",
      sql`length(${table.parserConfigJson}) > 0`,
    ),
    check(
      "file_import_profiles_fingerprint_check",
      sql`${table.statementAccountFingerprint} is null or (length(${table.statementAccountFingerprint}) = 64 and ${table.statementAccountFingerprint} not glob '*[^0-9a-f]*')`,
    ),
    check(
      "file_import_profiles_last4_check",
      sql`${table.statementAccountLast4} is null or (length(${table.statementAccountLast4}) between 1 and 4)`,
    ),
  ],
);

export const fileImportBatches = sqliteTable(
  "file_import_batches",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => fileImportProfiles.connectionId, {
        onDelete: "cascade",
      }),
    fileSha256: text("file_sha256").notNull(),
    originalFilename: text("original_filename").notNull(),
    format: text("format", { enum: fileImportFormats }).notNull(),
    parserVersion: integer("parser_version").notNull(),
    ingestedAt: text("ingested_at").notNull(),
    sourceRowCount: integer("source_row_count").notNull(),
    newCandidateCount: integer("new_candidate_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull(),
    unsupportedCount: integer("unsupported_count").notNull(),
    statementFromDate: text("statement_from_date"),
    statementToDate: text("statement_to_date"),
  },
  (table) => [
    uniqueIndex("file_import_batches_connection_hash_unique").on(
      table.connectionId,
      table.fileSha256,
    ),
    index("file_import_batches_connection_ingested_idx").on(
      table.connectionId,
      desc(table.ingestedAt),
    ),
    check(
      "file_import_batches_hash_check",
      sql`length(${table.fileSha256}) = 64 and ${table.fileSha256} not glob '*[^0-9a-f]*'`,
    ),
    check(
      "file_import_batches_filename_check",
      sql`length(${table.originalFilename}) between 1 and 255`,
    ),
    check(
      "file_import_batches_format_check",
      sql`${table.format} in ('csv', 'ofx', 'qfx', 'camt053')`,
    ),
    check(
      "file_import_batches_parser_version_check",
      sql`${table.parserVersion} > 0`,
    ),
    check(
      "file_import_batches_counts_check",
      sql`${table.sourceRowCount} >= 0 and ${table.newCandidateCount} >= 0 and ${table.duplicateCount} >= 0 and ${table.unsupportedCount} >= 0`,
    ),
  ],
);

export const externalConnectionState = sqliteTable(
  "external_connection_state",
  {
    connectionId: text("connection_id")
      .primaryKey()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    lastAttemptAt: text("last_attempt_at"),
    lastSuccessAt: text("last_success_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    permissionCheckedAt: text("permission_checked_at"),
    permissionSummaryJson: text("permission_summary_json"),
    cooldownUntil: text("cooldown_until"),
    lastNonceText: text("last_nonce_text").notNull().default("0"),
    lastLedgerSyncAt: text("last_ledger_sync_at"),
    lastTradeSyncAt: text("last_trade_sync_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "external_connection_state_nonce_check",
      sql`length(${table.lastNonceText}) > 0 and ${table.lastNonceText} not glob '*[^0-9]*'`,
    ),
  ],
);

export const evmWalletConnections = sqliteTable(
  "evm_wallet_connections",
  {
    connectionId: text("connection_id")
      .primaryKey()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    chainId: integer("chain_id").$type<1 | 8453 | 42161>().notNull(),
    networkId: text("network_id", {
      enum: ["eth-mainnet", "base-mainnet", "arb-mainnet"],
    }).notNull(),
    addressLower: text("address_lower").notNull(),
    addressDisplay: text("address_display").notNull(),
    dataProvider: text("data_provider", { enum: ["alchemy"] }).notNull(),
    historyStartAt: text("history_start_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("evm_wallet_connections_chain_address_unique").on(
      table.chainId,
      table.addressLower,
    ),
    check(
      "evm_wallet_connections_chain_network_check",
      sql`(${table.chainId} = 1 and ${table.networkId} = 'eth-mainnet') or (${table.chainId} = 8453 and ${table.networkId} = 'base-mainnet') or (${table.chainId} = 42161 and ${table.networkId} = 'arb-mainnet')`,
    ),
    check(
      "evm_wallet_connections_provider_check",
      sql`${table.dataProvider} = 'alchemy'`,
    ),
  ],
);

export const evmWalletConnectionState = sqliteTable(
  "evm_wallet_connection_state",
  {
    connectionId: text("connection_id")
      .primaryKey()
      .references(() => evmWalletConnections.connectionId, {
        onDelete: "cascade",
      }),
    lastFinalizedBlockText: text("last_finalized_block_text"),
    lastBalanceSyncAt: text("last_balance_sync_at"),
    lastActivitySyncAt: text("last_activity_sync_at"),
    traceCapabilityStatus: text("trace_capability_status", {
      enum: evmTraceCapabilityStatuses,
    })
      .notNull()
      .default("unknown"),
    traceCheckedAt: text("trace_checked_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "evm_wallet_state_trace_capability_check",
      sql`${table.traceCapabilityStatus} in ('unknown', 'trace_available', 'trace_unavailable')`,
    ),
  ],
);

export const externalAssetMappings = sqliteTable(
  "external_asset_mappings",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    providerAssetKey: text("provider_asset_key").notNull(),
    providerDisplayCode: text("provider_display_code"),
    talliAssetId: text("talli_asset_id").references(() => assets.id, {
      onDelete: "restrict",
    }),
    mappingStatus: text("mapping_status", {
      enum: externalMappingStatuses,
    })
      .notNull()
      .default("unmapped"),
    providerMetadataJson: text("provider_metadata_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.providerAssetKey] }),
    index("external_asset_mappings_talli_asset_idx").on(table.talliAssetId),
    check(
      "external_asset_mappings_status_check",
      sql`${table.mappingStatus} in ('mapped', 'unmapped', 'ignored')`,
    ),
  ],
);

export const externalAccountMappings = sqliteTable(
  "external_account_mappings",
  {
    connectionId: text("connection_id").notNull(),
    providerAssetKey: text("provider_asset_key").notNull(),
    talliAccountId: text("talli_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.providerAssetKey] }),
    foreignKey({
      columns: [table.connectionId, table.providerAssetKey],
      foreignColumns: [
        externalAssetMappings.connectionId,
        externalAssetMappings.providerAssetKey,
      ],
      name: "external_account_mappings_asset_mapping_fk",
    }).onDelete("cascade"),
    index("external_account_mappings_talli_account_idx").on(
      table.talliAccountId,
    ),
    check(
      "external_account_mappings_enabled_check",
      sql`${table.isEnabled} in (0, 1)`,
    ),
  ],
);

export const externalSyncRuns = sqliteTable(
  "external_sync_runs",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", { enum: externalSyncRunStatuses }).notNull(),
    balancesSeen: integer("balances_seen").notNull().default(0),
    sourceObjectsSeen: integer("source_objects_seen").notNull().default(0),
    candidatesCreated: integer("candidates_created").notNull().default(0),
    candidatesUpdated: integer("candidates_updated").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("external_sync_runs_connection_started_idx").on(
      table.connectionId,
      desc(table.startedAt),
    ),
    check(
      "external_sync_runs_status_check",
      sql`${table.status} in ('running', 'success', 'partial', 'error')`,
    ),
  ],
);

export const externalSourceObjects = sqliteTable(
  "external_source_objects",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    objectType: text("object_type", { enum: externalObjectTypes }).notNull(),
    externalId: text("external_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("external_source_objects_identity_unique").on(
      table.connectionId,
      table.objectType,
      table.externalId,
    ),
    index("external_source_objects_time_idx").on(
      table.connectionId,
      desc(table.occurredAt),
    ),
    check(
      "external_source_objects_type_check",
      sql`${table.objectType} in ('kraken_ledger', 'kraken_trade', 'evm_transaction', 'evm_transfer', 'file_transaction')`,
    ),
  ],
);

export const fileImportSourceDetails = sqliteTable(
  "file_import_source_details",
  {
    sourceObjectId: text("source_object_id")
      .primaryKey()
      .references(() => externalSourceObjects.id, { onDelete: "cascade" }),
    identityStrength: text("identity_strength", {
      enum: fileImportIdentityStrengths,
    }).notNull(),
    sourceIdKind: text("source_id_kind", {
      enum: fileImportSourceIdKinds,
    }).notNull(),
    originalDateText: text("original_date_text").notNull(),
    datePrecision: text("date_precision", {
      enum: fileImportDatePrecisions,
    }).notNull(),
    normalizedPayee: text("normalized_payee"),
    memo: text("memo"),
    statementCurrencyCode: text("statement_currency_code"),
  },
  (table) => [
    check(
      "file_import_source_details_strength_check",
      sql`${table.identityStrength} in ('strong', 'weak')`,
    ),
    check(
      "file_import_source_details_id_kind_check",
      sql`${table.sourceIdKind} in ('fitid', 'acct_svcr_ref', 'tx_id', 'ntry_ref', 'csv_id', 'weak_signature')`,
    ),
    check(
      "file_import_source_details_date_precision_check",
      sql`${table.datePrecision} in ('timestamp', 'day')`,
    ),
  ],
);

export const fileImportBatchSourceObjects = sqliteTable(
  "file_import_batch_source_objects",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => fileImportBatches.id, { onDelete: "cascade" }),
    sourceObjectId: text("source_object_id")
      .notNull()
      .references(() => externalSourceObjects.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    rawRowSha256: text("raw_row_sha256").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.batchId, table.sourceObjectId] }),
    uniqueIndex("file_import_batch_source_row_unique").on(
      table.batchId,
      table.rowIndex,
    ),
    check("file_import_batch_source_row_check", sql`${table.rowIndex} >= 0`),
    check(
      "file_import_batch_source_hash_check",
      sql`length(${table.rawRowSha256}) = 64 and ${table.rawRowSha256} not glob '*[^0-9a-f]*'`,
    ),
  ],
);

export const externalBalanceObservations = sqliteTable(
  "external_balance_observations",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    providerAssetKey: text("provider_asset_key").notNull(),
    talliAssetId: text("talli_asset_id").references(() => assets.id, {
      onDelete: "restrict",
    }),
    providerAmountText: text("provider_amount_text").notNull(),
    mappedAmountAtomic: text("mapped_amount_atomic"),
    precisionStatus: text("precision_status", {
      enum: externalPrecisionStatuses,
    }).notNull(),
    observedAt: text("observed_at").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.connectionId, table.providerAssetKey],
      foreignColumns: [
        externalAssetMappings.connectionId,
        externalAssetMappings.providerAssetKey,
      ],
      name: "external_balance_observations_asset_mapping_fk",
    }).onDelete("restrict"),
    index("external_balance_latest_idx").on(
      table.connectionId,
      table.providerAssetKey,
      desc(table.observedAt),
    ),
    check(
      "external_balance_observations_precision_check",
      sql`${table.precisionStatus} in ('exact', 'excess_precision', 'unmapped')`,
    ),
  ],
);

export const fileImportBalanceObservationDetails = sqliteTable(
  "file_import_balance_observation_details",
  {
    observationId: text("observation_id")
      .primaryKey()
      .references(() => externalBalanceObservations.id, {
        onDelete: "cascade",
      }),
    batchId: text("batch_id")
      .notNull()
      .references(() => fileImportBatches.id, { onDelete: "cascade" }),
    balanceKind: text("balance_kind", {
      enum: fileImportBalanceKinds,
    }).notNull(),
    sourceDateText: text("source_date_text").notNull(),
    datePrecision: text("date_precision", {
      enum: fileImportDatePrecisions,
    }).notNull(),
    statementCurrencyCode: text("statement_currency_code").notNull(),
  },
  (table) => [
    uniqueIndex("file_import_balance_batch_unique").on(table.batchId),
    check(
      "file_import_balance_kind_check",
      sql`${table.balanceKind} in ('closing_ledger', 'closing_booked')`,
    ),
    check(
      "file_import_balance_date_precision_check",
      sql`${table.datePrecision} in ('timestamp', 'day')`,
    ),
  ],
);

export const evmBalanceObservationDetails = sqliteTable(
  "evm_balance_observation_details",
  {
    observationId: text("observation_id")
      .primaryKey()
      .references(() => externalBalanceObservations.id, {
        onDelete: "cascade",
      }),
    chainId: integer("chain_id").$type<1 | 8453 | 42161>().notNull(),
    assetKind: text("asset_kind", { enum: evmAssetKinds }).notNull(),
    contractAddressLower: text("contract_address_lower"),
    rawAmountAtomicText: text("raw_amount_atomic_text").notNull(),
    tokenDecimals: integer("token_decimals"),
    syncHeadBlockText: text("sync_head_block_text"),
  },
  (table) => [
    check(
      "evm_balance_details_chain_check",
      sql`${table.chainId} in (1, 8453, 42161)`,
    ),
    check(
      "evm_balance_details_kind_check",
      sql`${table.assetKind} in ('native', 'erc20')`,
    ),
    check(
      "evm_balance_details_decimals_check",
      sql`${table.tokenDecimals} is null or (${table.tokenDecimals} >= 0 and ${table.tokenDecimals} <= 255)`,
    ),
    check(
      "evm_balance_details_contract_check",
      sql`(${table.assetKind} = 'native' and ${table.contractAddressLower} is null and ${table.tokenDecimals} = 18) or (${table.assetKind} = 'erc20' and ${table.contractAddressLower} is not null)`,
    ),
  ],
);

export const externalTransactionCandidates = sqliteTable(
  "external_transaction_candidates",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    suggestedEventType: text("suggested_event_type", {
      enum: externalCandidateEventTypes,
    }).notNull(),
    status: text("status", { enum: externalCandidateStatuses }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    title: text("title").notNull(),
    normalizationVersion: integer("normalization_version").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("external_candidates_stable_key_unique").on(
      table.connectionId,
      table.stableKey,
    ),
    index("external_candidates_status_time_idx").on(
      table.connectionId,
      table.status,
      desc(table.occurredAt),
    ),
    check(
      "external_candidates_event_type_check",
      sql`${table.suggestedEventType} in ('exchange', 'transfer', 'income', 'expense', 'unknown')`,
    ),
    check(
      "external_candidates_status_check",
      sql`${table.status} in ('pending', 'needs_mapping', 'ignored', 'imported', 'matched', 'unsupported', 'source_changed')`,
    ),
  ],
);

export const fileImportCandidateDetails = sqliteTable(
  "file_import_candidate_details",
  {
    candidateId: text("candidate_id")
      .primaryKey()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "cascade",
      }),
    targetAccountId: text("target_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    direction: text("direction", { enum: fileImportDirections }).notNull(),
    normalizedPayee: text("normalized_payee"),
    memo: text("memo"),
    sourceDateText: text("source_date_text").notNull(),
    datePrecision: text("date_precision", {
      enum: fileImportDatePrecisions,
    }).notNull(),
  },
  (table) => [
    index("file_import_candidate_target_account_idx").on(table.targetAccountId),
    check(
      "file_import_candidate_direction_check",
      sql`${table.direction} in ('in', 'out')`,
    ),
    check(
      "file_import_candidate_date_precision_check",
      sql`${table.datePrecision} in ('timestamp', 'day')`,
    ),
  ],
);

export const externalCandidateSourceObjects = sqliteTable(
  "external_candidate_source_objects",
  {
    candidateId: text("candidate_id")
      .notNull()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "cascade",
      }),
    sourceObjectId: text("source_object_id")
      .notNull()
      .references(() => externalSourceObjects.id, { onDelete: "restrict" }),
    relation: text("relation", {
      enum: externalCandidateSourceRelations,
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.candidateId, table.sourceObjectId] }),
    check(
      "external_candidate_source_relation_check",
      sql`${table.relation} in ('primary', 'cross_check')`,
    ),
  ],
);

export const externalTransactionLegs = sqliteTable(
  "external_transaction_legs",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "cascade",
      }),
    legIndex: integer("leg_index").notNull(),
    role: text("role", { enum: externalTransactionLegRoles }).notNull(),
    providerAssetKey: text("provider_asset_key").notNull(),
    talliAssetId: text("talli_asset_id").references(() => assets.id, {
      onDelete: "restrict",
    }),
    amountText: text("amount_text").notNull(),
    amountAtomic: text("amount_atomic"),
    precisionStatus: text("precision_status", {
      enum: externalPrecisionStatuses,
    }).notNull(),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("external_transaction_legs_candidate_index_unique").on(
      table.candidateId,
      table.legIndex,
    ),
    check("external_transaction_legs_index_check", sql`${table.legIndex} >= 0`),
    check(
      "external_transaction_legs_role_check",
      sql`${table.role} in ('source', 'destination', 'fee', 'external_in', 'external_out', 'unknown')`,
    ),
    check(
      "external_transaction_legs_precision_check",
      sql`${table.precisionStatus} in ('exact', 'excess_precision', 'unmapped')`,
    ),
  ],
);

export const evmCandidateDetails = sqliteTable(
  "evm_candidate_details",
  {
    candidateId: text("candidate_id")
      .primaryKey()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "cascade",
      }),
    chainId: integer("chain_id").$type<1 | 8453 | 42161>().notNull(),
    txHash: text("tx_hash").notNull(),
    candidateKind: text("candidate_kind", {
      enum: evmCandidateKinds,
    }).notNull(),
    classification: text("classification", {
      enum: evmCandidateClassifications,
    }).notNull(),
    txStatus: text("tx_status", { enum: evmTransactionStatuses }).notNull(),
    blockNumberText: text("block_number_text"),
    blockTimestamp: text("block_timestamp"),
    fromAddressLower: text("from_address_lower").notNull(),
    toAddressLower: text("to_address_lower"),
    gasFeeAtomicText: text("gas_fee_atomic_text"),
    gasFeeStatus: text("gas_fee_status", {
      enum: evmGasFeeStatuses,
    }).notNull(),
    nativeTraceStatus: text("native_trace_status", {
      enum: evmNativeTraceStatuses,
    })
      .notNull()
      .default("not_required"),
  },
  (table) => [
    uniqueIndex("evm_candidate_details_tx_kind_unique").on(
      table.chainId,
      table.txHash,
      table.candidateKind,
    ),
    check(
      "evm_candidate_details_chain_check",
      sql`${table.chainId} in (1, 8453, 42161)`,
    ),
    check(
      "evm_candidate_details_kind_check",
      sql`${table.candidateKind} in ('movement', 'gas')`,
    ),
    check(
      "evm_candidate_details_classification_check",
      sql`${table.classification} in ('simple_in', 'simple_out', 'simple_exchange', 'gas_only', 'complex', 'unsupported')`,
    ),
    check(
      "evm_candidate_details_tx_status_check",
      sql`${table.txStatus} in ('success', 'failed', 'unknown')`,
    ),
    check(
      "evm_candidate_details_gas_status_check",
      sql`${table.gasFeeStatus} in ('exact', 'not_applicable', 'unresolved')`,
    ),
    check(
      "evm_candidate_details_trace_status_check",
      sql`${table.nativeTraceStatus} in ('not_required', 'exact', 'trace_unavailable', 'trace_invalid')`,
    ),
  ],
);

export const evmL2GasFeeDetails = sqliteTable(
  "evm_l2_gas_fee_details",
  {
    candidateId: text("candidate_id")
      .primaryKey()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "cascade",
      }),
    chainId: integer("chain_id").$type<8453 | 42161>().notNull(),
    feeModel: text("fee_model", { enum: evmL2FeeModels }).notNull(),
    executionFeeAtomicText: text("execution_fee_atomic_text"),
    parentDataFeeAtomicText: text("parent_data_fee_atomic_text"),
    operatorFeeAtomicText: text("operator_fee_atomic_text"),
    totalFeeAtomicText: text("total_fee_atomic_text"),
    feeStatus: text("fee_status", { enum: evmL2FeeStatuses }).notNull(),
    evidenceJson: text("evidence_json").notNull(),
  },
  (table) => [
    check(
      "evm_l2_gas_fee_chain_model_check",
      sql`(${table.chainId} = 8453 and ${table.feeModel} = 'base_op_stack') or (${table.chainId} = 42161 and ${table.feeModel} = 'arbitrum_nitro')`,
    ),
    check(
      "evm_l2_gas_fee_exact_fields_check",
      sql`(${table.feeStatus} = 'exact' and ${table.executionFeeAtomicText} is not null and ${table.parentDataFeeAtomicText} is not null and ${table.totalFeeAtomicText} is not null) or (${table.feeStatus} = 'unresolved' and ${table.totalFeeAtomicText} is null)`,
    ),
    check(
      "evm_l2_gas_fee_operator_check",
      sql`(${table.chainId} = 8453 and ((${table.feeStatus} = 'exact' and ${table.operatorFeeAtomicText} is not null) or ${table.feeStatus} = 'unresolved')) or (${table.chainId} = 42161 and ${table.operatorFeeAtomicText} is null)`,
    ),
  ],
);

export const externalImportLinks = sqliteTable(
  "external_import_links",
  {
    candidateId: text("candidate_id")
      .primaryKey()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "restrict",
      }),
    ledgerEventId: text("ledger_event_id")
      .notNull()
      .references(() => ledgerEvents.id, { onDelete: "restrict" }),
    importedAt: text("imported_at").notNull(),
    importFingerprint: text("import_fingerprint").notNull(),
  },
  (table) => [
    uniqueIndex("external_import_links_ledger_event_unique").on(
      table.ledgerEventId,
    ),
  ],
);

export const externalCandidateMatchLinks = sqliteTable(
  "external_candidate_match_links",
  {
    candidateId: text("candidate_id")
      .primaryKey()
      .references(() => externalTransactionCandidates.id, {
        onDelete: "restrict",
      }),
    ledgerEventId: text("ledger_event_id")
      .notNull()
      .references(() => ledgerEvents.id, { onDelete: "restrict" }),
    matchedAt: text("matched_at").notNull(),
    matchFingerprint: text("match_fingerprint").notNull(),
  },
  (table) => [
    index("external_candidate_match_ledger_event_idx").on(table.ledgerEventId),
  ],
);

export type BookRow = typeof books.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type LedgerEventRow = typeof ledgerEvents.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type BalanceSnapshotRow = typeof balanceSnapshots.$inferSelect;
export type BookValuationSettingRow = typeof bookValuationSettings.$inferSelect;
export type PriceProviderMappingRow = typeof priceProviderMappings.$inferSelect;
export type ManualPriceQuoteRow = typeof manualPriceQuotes.$inferSelect;
export type LatestPriceQuoteRow = typeof latestPriceQuotes.$inferSelect;
export type PriceProviderStateRow = typeof priceProviderState.$inferSelect;
export type ExternalConnectionRow = typeof externalConnections.$inferSelect;
export type ExternalConnectionStateRow =
  typeof externalConnectionState.$inferSelect;
export type EvmWalletConnectionRow = typeof evmWalletConnections.$inferSelect;
export type EvmWalletConnectionStateRow =
  typeof evmWalletConnectionState.$inferSelect;
export type ExternalAssetMappingRow = typeof externalAssetMappings.$inferSelect;
export type ExternalAccountMappingRow =
  typeof externalAccountMappings.$inferSelect;
export type ExternalSyncRunRow = typeof externalSyncRuns.$inferSelect;
export type ExternalSourceObjectRow = typeof externalSourceObjects.$inferSelect;
export type ExternalBalanceObservationRow =
  typeof externalBalanceObservations.$inferSelect;
export type EvmBalanceObservationDetailRow =
  typeof evmBalanceObservationDetails.$inferSelect;
export type ExternalTransactionCandidateRow =
  typeof externalTransactionCandidates.$inferSelect;
export type ExternalTransactionLegRow =
  typeof externalTransactionLegs.$inferSelect;
export type EvmCandidateDetailRow = typeof evmCandidateDetails.$inferSelect;
export type EvmL2GasFeeDetailRow = typeof evmL2GasFeeDetails.$inferSelect;
export type ExternalImportLinkRow = typeof externalImportLinks.$inferSelect;
export type FileImportProfileRow = typeof fileImportProfiles.$inferSelect;
export type FileImportBatchRow = typeof fileImportBatches.$inferSelect;
export type FileImportSourceDetailRow =
  typeof fileImportSourceDetails.$inferSelect;
export type FileImportBatchSourceObjectRow =
  typeof fileImportBatchSourceObjects.$inferSelect;
export type FileImportCandidateDetailRow =
  typeof fileImportCandidateDetails.$inferSelect;
export type FileImportBalanceObservationDetailRow =
  typeof fileImportBalanceObservationDetails.$inferSelect;
export type ExternalCandidateMatchLinkRow =
  typeof externalCandidateMatchLinks.$inferSelect;
