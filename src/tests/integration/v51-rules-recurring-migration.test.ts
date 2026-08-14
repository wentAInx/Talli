import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseContext } from "../../db/connection";
import { migrateDatabase, migrationsFolder } from "../../db/migrate";

const NOW = "2026-08-15T08:00:00.000Z";
const V50_TAGS = [
  "0000_aberrant_abomination",
  "0001_milky_iron_man",
  "0002_amusing_sage",
  "0003_rich_cargill",
  "0004_v4_evm_wallet_sync",
  "0005_quiet_betty_brant",
  "0006_v41_evm_l2_expansion",
  "0007_v5_financial_file_import",
] as const;

function v50MigrationsFolder(directory: string): string {
  const source = migrationsFolder();
  const target = join(directory, "v50-migrations");
  mkdirSync(join(target, "meta"), { recursive: true });
  for (const tag of V50_TAGS) {
    copyFileSync(join(source, `${tag}.sql`), join(target, `${tag}.sql`));
  }
  const journal = JSON.parse(
    readFileSync(join(source, "meta/_journal.json"), "utf8"),
  ) as { version: string; dialect: string; entries: { tag: string }[] };
  writeFileSync(
    join(target, "meta/_journal.json"),
    JSON.stringify(
      {
        ...journal,
        entries: journal.entries.filter((entry) =>
          V50_TAGS.includes(entry.tag as (typeof V50_TAGS)[number]),
        ),
      },
      null,
      2,
    ),
  );
  return target;
}

function rows(context: DatabaseContext, sql: string): unknown[] {
  return context.sqlite.prepare(sql).all();
}

function insertFrozenV50Facts(context: DatabaseContext): void {
  context.sqlite.exec(`
    INSERT INTO books (id, name, is_default, created_at, updated_at)
    VALUES ('book-v51', 'V5.1 migration fixture', 1, '${NOW}', '${NOW}');
    INSERT INTO assets (id, code, name, symbol, asset_type, scale, is_archived, sort_order, created_at, updated_at)
    VALUES ('asset-v51', 'USD', 'US Dollar', '$', 'fiat', 2, 0, 1, '${NOW}', '${NOW}');
    INSERT INTO accounts (id, book_id, asset_id, name, account_type, is_archived, sort_order, created_at, updated_at)
    VALUES ('account-v51', 'book-v51', 'asset-v51', 'Checking', 'bank', 0, 1, '${NOW}', '${NOW}');
    INSERT INTO categories (id, book_id, parent_id, name, category_type, is_archived, sort_order, created_at, updated_at)
    VALUES ('category-v51', 'book-v51', NULL, 'Food', 'expense', 0, 1, '${NOW}', '${NOW}');
    INSERT INTO tags (id, book_id, name, is_archived, created_at, updated_at)
    VALUES ('tag-v51', 'book-v51', 'Routine', 0, '${NOW}', '${NOW}');
    INSERT INTO ledger_events (id, book_id, event_type, occurred_at, category_id, payee, note, created_at, updated_at)
    VALUES ('event-v51', 'book-v51', 'expense', '${NOW}', 'category-v51', 'Coffee', 'Frozen V5 Ledger fact', '${NOW}', '${NOW}');
    INSERT INTO ledger_entries (id, event_id, account_id, entry_role, amount_atomic, created_at)
    VALUES ('entry-v51', 'event-v51', 'account-v51', 'main', '-3500', '${NOW}');
    INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
    VALUES ('connection-v51', 'book-v51', 'file_import', 'file:connection-v51', 'Checking CSV', 'local:file-import', 1, '${NOW}', '${NOW}');
    INSERT INTO external_asset_mappings (connection_id, provider_asset_key, provider_display_code, talli_asset_id, mapping_status, provider_metadata_json, created_at, updated_at)
    VALUES ('connection-v51', 'file:connection-v51:target', 'USD', 'asset-v51', 'mapped', '{"explicit":true}', '${NOW}', '${NOW}');
    INSERT INTO external_account_mappings (connection_id, provider_asset_key, talli_account_id, is_enabled, created_at, updated_at)
    VALUES ('connection-v51', 'file:connection-v51:target', 'account-v51', 1, '${NOW}', '${NOW}');
    INSERT INTO file_import_profiles (connection_id, target_account_id, format, parser_config_json, statement_account_fingerprint, statement_account_last4, statement_currency_code, created_at, updated_at)
    VALUES ('connection-v51', 'account-v51', 'csv', '{"kind":"csv"}', NULL, NULL, 'USD', '${NOW}', '${NOW}');
    INSERT INTO file_import_batches (id, connection_id, file_sha256, original_filename, format, parser_version, ingested_at, source_row_count, new_candidate_count, duplicate_count, unsupported_count, statement_from_date, statement_to_date)
    VALUES ('batch-v51', 'connection-v51', '${"a".repeat(64)}', 'statement.csv', 'csv', 1, '${NOW}', 1, 1, 0, 0, '2026-08-15', '2026-08-15');
    INSERT INTO external_source_objects (id, connection_id, object_type, external_id, occurred_at, payload_json, payload_hash, first_seen_at, last_seen_at)
    VALUES ('source-v51', 'connection-v51', 'file_transaction', 'csv:tx-1', '${NOW}', '{"payee":"Coffee"}', '${"b".repeat(64)}', '${NOW}', '${NOW}');
    INSERT INTO file_import_source_details (source_object_id, identity_strength, source_id_kind, original_date_text, date_precision, normalized_payee, memo, statement_currency_code)
    VALUES ('source-v51', 'strong', 'csv_id', '2026-08-15', 'day', 'coffee', NULL, 'USD');
    INSERT INTO file_import_batch_source_objects (batch_id, source_object_id, row_index, raw_row_sha256)
    VALUES ('batch-v51', 'source-v51', 0, '${"c".repeat(64)}');
    INSERT INTO external_transaction_candidates (id, connection_id, stable_key, suggested_event_type, status, occurred_at, title, normalization_version, source_fingerprint, created_at, updated_at, last_seen_at)
    VALUES ('candidate-v51', 'connection-v51', 'file:csv:tx-1', 'expense', 'pending', '${NOW}', 'Coffee', 1, '${"d".repeat(64)}', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO file_import_candidate_details (candidate_id, target_account_id, direction, normalized_payee, memo, source_date_text, date_precision)
    VALUES ('candidate-v51', 'account-v51', 'out', 'coffee', NULL, '2026-08-15', 'day');
    INSERT INTO external_candidate_source_objects (candidate_id, source_object_id, relation)
    VALUES ('candidate-v51', 'source-v51', 'primary');
    INSERT INTO external_transaction_legs (id, candidate_id, leg_index, role, provider_asset_key, talli_asset_id, amount_text, amount_atomic, precision_status, note)
    VALUES ('leg-v51', 'candidate-v51', 0, 'external_out', 'file:connection-v51:target', 'asset-v51', '-35', '-3500', 'exact', NULL);
  `);
}

describe("V5 to V5.1 rules and recurring forward migration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("preserves every frozen fact and adds only durable definitions and decisions", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v51-migration-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v50.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context, v50MigrationsFolder(directory));
    insertFrozenV50Facts(context);

    const frozen = {
      events: rows(context, "SELECT * FROM ledger_events ORDER BY id"),
      entries: rows(context, "SELECT * FROM ledger_entries ORDER BY id"),
      sources: rows(
        context,
        "SELECT * FROM external_source_objects ORDER BY id",
      ),
      candidates: rows(
        context,
        "SELECT * FROM external_transaction_candidates ORDER BY id",
      ),
      legs: rows(
        context,
        "SELECT * FROM external_transaction_legs ORDER BY id",
      ),
      details: rows(
        context,
        "SELECT * FROM file_import_candidate_details ORDER BY candidate_id",
      ),
    };

    migrateDatabase(context);

    expect(rows(context, "SELECT * FROM ledger_events ORDER BY id")).toEqual(
      frozen.events,
    );
    expect(rows(context, "SELECT * FROM ledger_entries ORDER BY id")).toEqual(
      frozen.entries,
    );
    expect(
      rows(context, "SELECT * FROM external_source_objects ORDER BY id"),
    ).toEqual(frozen.sources);
    expect(
      rows(
        context,
        "SELECT * FROM external_transaction_candidates ORDER BY id",
      ),
    ).toEqual(frozen.candidates);
    expect(
      rows(context, "SELECT * FROM external_transaction_legs ORDER BY id"),
    ).toEqual(frozen.legs);
    expect(
      rows(
        context,
        "SELECT * FROM file_import_candidate_details ORDER BY candidate_id",
      ),
    ).toEqual(frozen.details);

    expect(
      rows(
        context,
        "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'automation_rule%' OR name LIKE 'recurring_%') ORDER BY name",
      ),
    ).toEqual([
      { name: "automation_rule_actions" },
      { name: "automation_rule_conditions" },
      { name: "automation_rules" },
      { name: "recurring_item_tags" },
      { name: "recurring_items" },
      { name: "recurring_occurrence_links" },
      { name: "recurring_occurrence_skips" },
    ]);

    context.sqlite.exec(`
      INSERT INTO automation_rules (id, book_id, name, target_scope, stage, match_mode, is_enabled, sort_order, created_at, updated_at)
      VALUES ('rule-v51', 'book-v51', 'Coffee projection', 'file_import_candidate', 'default', 'all', 1, 100, '${NOW}', '${NOW}');
      INSERT INTO automation_rule_conditions (id, rule_id, position, field, operator, value_json, is_negated)
      VALUES ('condition-v51', 'rule-v51', 0, 'source_payee', 'contains', '"coffee"', 0);
      INSERT INTO automation_rule_actions (id, rule_id, position, action_type, value_json)
      VALUES ('action-v51', 'rule-v51', 0, 'set_category', '"category-v51"');
      INSERT INTO recurring_items (id, book_id, account_id, asset_id, name, event_type, payee_text, payee_match_mode, category_id, note, amount_mode, amount_atomic_text, tolerance_bps, min_amount_atomic_text, max_amount_atomic_text, frequency, interval_count, anchor_date, monthly_day_mode, date_window_before_days, date_window_after_days, starts_on, ends_on, is_active, created_at, updated_at)
      VALUES ('recurring-v51', 'book-v51', 'account-v51', 'asset-v51', 'Daily coffee', 'expense', 'coffee', 'contains', 'category-v51', NULL, 'exact', '3500', NULL, NULL, NULL, 'daily', 1, '2026-08-15', NULL, 2, 2, NULL, NULL, 1, '${NOW}', '${NOW}');
      INSERT INTO recurring_item_tags (recurring_item_id, tag_id)
      VALUES ('recurring-v51', 'tag-v51');
      INSERT INTO recurring_occurrence_links (recurring_item_id, occurrence_date, ledger_event_id, linked_at)
      VALUES ('recurring-v51', '2026-08-15', 'event-v51', '${NOW}');
      INSERT INTO recurring_occurrence_skips (recurring_item_id, occurrence_date, skipped_at, note)
      VALUES ('recurring-v51', '2026-08-16', '${NOW}', 'Explicit skip');
    `);

    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(() =>
      context.sqlite.exec(`
        INSERT INTO automation_rule_actions (id, rule_id, position, action_type, value_json)
        VALUES ('bad-action', 'rule-v51', 1, 'set_amount', '"1"');
      `),
    ).toThrow();
    expect(() =>
      context.sqlite.exec(`
        INSERT INTO recurring_items (id, book_id, account_id, asset_id, name, event_type, amount_mode, amount_atomic_text, frequency, interval_count, anchor_date, monthly_day_mode, date_window_before_days, date_window_after_days, is_active, created_at, updated_at)
        VALUES ('bad-recurring', 'book-v51', 'account-v51', 'asset-v51', 'Transfer', 'transfer', 'exact', '1', 'daily', 1, '2026-08-15', NULL, 2, 2, 1, '${NOW}', '${NOW}');
      `),
    ).toThrow();

    const afterFirstMigration = rows(
      context,
      "SELECT * FROM __drizzle_migrations ORDER BY created_at",
    );
    migrateDatabase(context);
    expect(
      rows(context, "SELECT * FROM __drizzle_migrations ORDER BY created_at"),
    ).toEqual(afterFirstMigration);
  });
});
