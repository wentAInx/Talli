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

const NOW = "2026-08-14T08:00:00.000Z";
const V41_TAGS = [
  "0000_aberrant_abomination",
  "0001_milky_iron_man",
  "0002_amusing_sage",
  "0003_rich_cargill",
  "0004_v4_evm_wallet_sync",
  "0005_quiet_betty_brant",
  "0006_v41_evm_l2_expansion",
] as const;

function v41MigrationsFolder(directory: string): string {
  const source = migrationsFolder();
  const target = join(directory, "v41-migrations");
  mkdirSync(join(target, "meta"), { recursive: true });
  for (const tag of V41_TAGS) {
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
          V41_TAGS.includes(entry.tag as (typeof V41_TAGS)[number]),
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

function insertFrozenV41Facts(context: DatabaseContext): void {
  context.sqlite.exec(`
    INSERT INTO books (id, name, is_default, created_at, updated_at)
    VALUES ('book-v5', 'V5 migration fixture', 1, '${NOW}', '${NOW}');
    INSERT INTO assets (id, code, name, symbol, asset_type, scale, is_archived, sort_order, created_at, updated_at)
    VALUES ('asset-v5', 'USD', 'US Dollar', '$', 'fiat', 2, 0, 1, '${NOW}', '${NOW}');
    INSERT INTO accounts (id, book_id, asset_id, name, account_type, is_archived, sort_order, created_at, updated_at)
    VALUES ('account-v5', 'book-v5', 'asset-v5', 'Checking', 'bank', 0, 1, '${NOW}', '${NOW}');
    INSERT INTO ledger_events (id, book_id, event_type, occurred_at, category_id, payee, note, created_at, updated_at)
    VALUES ('event-v5', 'book-v5', 'expense', '${NOW}', NULL, 'Coffee', 'Frozen Ledger fact', '${NOW}', '${NOW}');
    INSERT INTO ledger_entries (id, event_id, account_id, entry_role, amount_atomic, created_at)
    VALUES ('entry-v5', 'event-v5', 'account-v5', 'main', '-3500', '${NOW}');
    INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
    VALUES ('connection-v5-old', 'book-v5', 'evm_wallet', 'eip155:1:0x1111111111111111111111111111111111111111', 'Frozen wallet', 'env:alchemy.primary', 1, '${NOW}', '${NOW}');
    INSERT INTO external_asset_mappings (connection_id, provider_asset_key, provider_display_code, talli_asset_id, mapping_status, provider_metadata_json, created_at, updated_at)
    VALUES ('connection-v5-old', 'eip155:1/native', 'ETH', 'asset-v5', 'mapped', '{"chainId":1}', '${NOW}', '${NOW}');
    INSERT INTO external_account_mappings (connection_id, provider_asset_key, talli_account_id, is_enabled, created_at, updated_at)
    VALUES ('connection-v5-old', 'eip155:1/native', 'account-v5', 1, '${NOW}', '${NOW}');
    INSERT INTO external_source_objects (id, connection_id, object_type, external_id, occurred_at, payload_json, payload_hash, first_seen_at, last_seen_at)
    VALUES ('source-v5-old', 'connection-v5-old', 'evm_transaction', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${NOW}', '{"frozen":true}', '${"a".repeat(64)}', '${NOW}', '${NOW}');
    INSERT INTO external_transaction_candidates (id, connection_id, stable_key, suggested_event_type, status, occurred_at, title, normalization_version, source_fingerprint, created_at, updated_at, last_seen_at)
    VALUES ('candidate-v5-old', 'connection-v5-old', 'evm:1:movement:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'expense', 'source_changed', '${NOW}', 'Frozen candidate', 1, '${"b".repeat(64)}', '${NOW}', '${NOW}', '${NOW}');
  `);
}

describe("V4.1 to V5 financial file import migration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("preserves frozen facts and adds the file-import schema atomically", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v50-migration-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v41.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context, v41MigrationsFolder(directory));
    insertFrozenV41Facts(context);

    const frozen = {
      ledgerEvents: rows(context, "SELECT * FROM ledger_events ORDER BY id"),
      ledgerEntries: rows(context, "SELECT * FROM ledger_entries ORDER BY id"),
      connections: rows(
        context,
        "SELECT * FROM external_connections ORDER BY id",
      ),
      sources: rows(
        context,
        "SELECT * FROM external_source_objects ORDER BY id",
      ),
      candidates: rows(
        context,
        "SELECT * FROM external_transaction_candidates ORDER BY id",
      ),
    };

    migrateDatabase(context);

    expect(rows(context, "SELECT * FROM ledger_events ORDER BY id")).toEqual(
      frozen.ledgerEvents,
    );
    expect(rows(context, "SELECT * FROM ledger_entries ORDER BY id")).toEqual(
      frozen.ledgerEntries,
    );
    expect(
      rows(context, "SELECT * FROM external_connections ORDER BY id"),
    ).toEqual(frozen.connections);
    expect(
      rows(context, "SELECT * FROM external_source_objects ORDER BY id"),
    ).toEqual(frozen.sources);
    expect(
      rows(
        context,
        "SELECT * FROM external_transaction_candidates ORDER BY id",
      ),
    ).toEqual(frozen.candidates);

    const v5Tables = rows(
      context,
      "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'file_import_%' OR name='external_candidate_match_links') ORDER BY name",
    );
    expect(v5Tables).toEqual([
      { name: "external_candidate_match_links" },
      { name: "file_import_balance_observation_details" },
      { name: "file_import_batch_source_objects" },
      { name: "file_import_batches" },
      { name: "file_import_candidate_details" },
      { name: "file_import_profiles" },
      { name: "file_import_source_details" },
    ]);

    context.sqlite.exec(`
      INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
      VALUES ('connection-v5-file', 'book-v5', 'file_import', 'file:connection-v5-file', 'Checking CSV', 'local:file-import', 1, '${NOW}', '${NOW}');
      INSERT INTO external_asset_mappings (connection_id, provider_asset_key, provider_display_code, talli_asset_id, mapping_status, provider_metadata_json, created_at, updated_at)
      VALUES ('connection-v5-file', 'file:connection-v5-file:target', 'USD', 'asset-v5', 'mapped', '{"explicit":true}', '${NOW}', '${NOW}');
      INSERT INTO external_account_mappings (connection_id, provider_asset_key, talli_account_id, is_enabled, created_at, updated_at)
      VALUES ('connection-v5-file', 'file:connection-v5-file:target', 'account-v5', 1, '${NOW}', '${NOW}');
      INSERT INTO file_import_profiles (connection_id, target_account_id, format, parser_config_json, statement_account_fingerprint, statement_account_last4, statement_currency_code, created_at, updated_at)
      VALUES ('connection-v5-file', 'account-v5', 'csv', '{"kind":"csv"}', NULL, NULL, 'USD', '${NOW}', '${NOW}');
      INSERT INTO file_import_batches (id, connection_id, file_sha256, original_filename, format, parser_version, ingested_at, source_row_count, new_candidate_count, duplicate_count, unsupported_count, statement_from_date, statement_to_date)
      VALUES ('batch-v5', 'connection-v5-file', '${"c".repeat(64)}', 'statement.csv', 'csv', 1, '${NOW}', 1, 1, 0, 0, '2026-08-14', '2026-08-14');
      INSERT INTO external_source_objects (id, connection_id, object_type, external_id, occurred_at, payload_json, payload_hash, first_seen_at, last_seen_at)
      VALUES ('source-v5-file', 'connection-v5-file', 'file_transaction', 'csv:tx-1', '${NOW}', '{"payee":"Coffee"}', '${"d".repeat(64)}', '${NOW}', '${NOW}');
      INSERT INTO file_import_source_details (source_object_id, identity_strength, source_id_kind, original_date_text, date_precision, normalized_payee, memo, statement_currency_code)
      VALUES ('source-v5-file', 'strong', 'csv_id', '2026-08-14', 'day', 'coffee', NULL, 'USD');
      INSERT INTO file_import_batch_source_objects (batch_id, source_object_id, row_index, raw_row_sha256)
      VALUES ('batch-v5', 'source-v5-file', 0, '${"e".repeat(64)}');
      INSERT INTO external_transaction_candidates (id, connection_id, stable_key, suggested_event_type, status, occurred_at, title, normalization_version, source_fingerprint, created_at, updated_at, last_seen_at)
      VALUES ('candidate-v5-file', 'connection-v5-file', 'file:csv:tx-1', 'unknown', 'matched', '${NOW}', 'Coffee', 1, '${"f".repeat(64)}', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO file_import_candidate_details (candidate_id, target_account_id, direction, normalized_payee, memo, source_date_text, date_precision)
      VALUES ('candidate-v5-file', 'account-v5', 'out', 'coffee', NULL, '2026-08-14', 'day');
      INSERT INTO external_candidate_match_links (candidate_id, ledger_event_id, matched_at, match_fingerprint)
      VALUES ('candidate-v5-file', 'event-v5', '${NOW}', '${"1".repeat(64)}');
    `);

    expect(
      rows(
        context,
        "SELECT provider, source_key AS sourceKey, credential_ref AS credentialRef FROM external_connections WHERE id='connection-v5-file'",
      ),
    ).toEqual([
      {
        provider: "file_import",
        sourceKey: "file:connection-v5-file",
        credentialRef: "local:file-import",
      },
    ]);
    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);

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
