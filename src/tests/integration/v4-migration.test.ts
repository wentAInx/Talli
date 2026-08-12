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

const NOW = "2026-08-12T13:00:00.000Z";
const V3_TAGS = [
  "0000_aberrant_abomination",
  "0001_milky_iron_man",
  "0002_amusing_sage",
  "0003_rich_cargill",
] as const;

function v3MigrationsFolder(directory: string): string {
  const source = migrationsFolder();
  const target = join(directory, "v3-migrations");
  mkdirSync(join(target, "meta"), { recursive: true });
  for (const tag of V3_TAGS) {
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
          V3_TAGS.includes(entry.tag as (typeof V3_TAGS)[number]),
        ),
      },
      null,
      2,
    ),
  );
  return target;
}

function insertV3Facts(context: DatabaseContext): void {
  context.sqlite.exec(`
    INSERT INTO books (id, name, is_default, created_at, updated_at)
    VALUES ('book-v3-fixture', 'V3 fixture', 1, '${NOW}', '${NOW}');
    INSERT INTO assets (id, code, name, symbol, asset_type, scale, is_archived, sort_order, created_at, updated_at)
    VALUES ('asset-v3-eth', 'ETH-V3', 'Ethereum V3 fixture', 'ETH', 'crypto', 18, 0, 1, '${NOW}', '${NOW}');
    INSERT INTO accounts (id, book_id, asset_id, name, account_type, is_archived, sort_order, created_at, updated_at)
    VALUES ('account-v3-wallet', 'book-v3-fixture', 'asset-v3-eth', 'V3 Kraken ETH', 'exchange', 0, 1, '${NOW}', '${NOW}');
    INSERT INTO ledger_events (id, book_id, event_type, occurred_at, category_id, payee, note, created_at, updated_at)
    VALUES ('ledger-event-v3-import', 'book-v3-fixture', 'expense', '${NOW}', NULL, 'Kraken', 'Frozen V3 fact', '${NOW}', '${NOW}');
    INSERT INTO ledger_entries (id, event_id, account_id, entry_role, amount_atomic, created_at)
    VALUES ('ledger-entry-v3-import', 'ledger-event-v3-import', 'account-v3-wallet', 'main', '-21000000000000', '${NOW}');
    INSERT INTO external_connections (id, book_id, provider, name, credential_ref, is_enabled, created_at, updated_at)
    VALUES ('connection-v3-kraken', 'book-v3-fixture', 'kraken', 'Kraken', 'env:kraken.primary', 1, '${NOW}', '${NOW}');
    INSERT INTO external_connection_state (connection_id, last_nonce_text, updated_at)
    VALUES ('connection-v3-kraken', '1786540000000', '${NOW}');
    INSERT INTO external_asset_mappings (connection_id, provider_asset_key, provider_display_code, talli_asset_id, mapping_status, provider_metadata_json, created_at, updated_at)
    VALUES ('connection-v3-kraken', 'XETH', 'ETH', 'asset-v3-eth', 'mapped', '{"displayCode":"ETH"}', '${NOW}', '${NOW}');
    INSERT INTO external_account_mappings (connection_id, provider_asset_key, talli_account_id, is_enabled, created_at, updated_at)
    VALUES ('connection-v3-kraken', 'XETH', 'account-v3-wallet', 1, '${NOW}', '${NOW}');
    INSERT INTO external_balance_observations (id, connection_id, provider_asset_key, talli_asset_id, provider_amount_text, mapped_amount_atomic, precision_status, observed_at, payload_hash, created_at)
    VALUES ('observation-v3', 'connection-v3-kraken', 'XETH', 'asset-v3-eth', '1.5', '1500000000000000000', 'exact', '${NOW}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${NOW}');
    INSERT INTO external_source_objects (id, connection_id, object_type, external_id, occurred_at, payload_json, payload_hash, first_seen_at, last_seen_at)
    VALUES ('source-v3-trade', 'connection-v3-kraken', 'kraken_trade', 'trade-v3', '${NOW}', '{}', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '${NOW}', '${NOW}');
    INSERT INTO external_transaction_candidates (id, connection_id, stable_key, suggested_event_type, status, occurred_at, title, normalization_version, source_fingerprint, created_at, updated_at, last_seen_at)
    VALUES ('candidate-v3-import', 'connection-v3-kraken', 'kraken_trade:trade-v3', 'expense', 'imported', '${NOW}', 'Imported V3 candidate', 1, 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO external_candidate_source_objects (candidate_id, source_object_id, relation)
    VALUES ('candidate-v3-import', 'source-v3-trade', 'primary');
    INSERT INTO external_transaction_legs (id, candidate_id, leg_index, role, provider_asset_key, talli_asset_id, amount_text, amount_atomic, precision_status, note)
    VALUES ('leg-v3-import', 'candidate-v3-import', 0, 'external_out', 'XETH', 'asset-v3-eth', '-0.000021', '-21000000000000', 'exact', NULL);
    INSERT INTO external_import_links (candidate_id, ledger_event_id, imported_at, import_fingerprint)
    VALUES ('candidate-v3-import', 'ledger-event-v3-import', '${NOW}', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
  `);
}

function rows(context: DatabaseContext, table: string): unknown[] {
  return context.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
}

describe("V3 to V4 forward migration", () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("preserves Kraken and Ledger IDs/facts while injecting sourceKey", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v4-migration-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v3.sqlite"));
    cleanups.push(() => context.close());

    migrateDatabase(context, v3MigrationsFolder(directory));
    insertV3Facts(context);
    const before = {
      ledgerEvents: rows(context, "ledger_events"),
      ledgerEntries: rows(context, "ledger_entries"),
      connections: rows(context, "external_connections"),
      sources: rows(context, "external_source_objects"),
      candidates: rows(context, "external_transaction_candidates"),
      imports: rows(context, "external_import_links"),
    };

    migrateDatabase(context);

    expect(rows(context, "ledger_events")).toEqual(before.ledgerEvents);
    expect(rows(context, "ledger_entries")).toEqual(before.ledgerEntries);
    expect(rows(context, "external_source_objects")).toEqual(before.sources);
    expect(rows(context, "external_transaction_candidates")).toEqual(
      before.candidates,
    );
    expect(rows(context, "external_import_links")).toEqual(before.imports);
    expect(rows(context, "external_connections")).toEqual([
      {
        ...(before.connections[0] as Record<string, unknown>),
        source_key: "kraken:primary",
      },
    ]);
    expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(context.sqlite.inTransaction).toBe(false);
    expect(
      context.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'evm_%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "evm_balance_observation_details" },
      { name: "evm_candidate_details" },
      { name: "evm_wallet_connection_state" },
      { name: "evm_wallet_connections" },
    ]);

    const afterFirstMigration = rows(context, "__drizzle_migrations");
    migrateDatabase(context);
    expect(rows(context, "__drizzle_migrations")).toEqual(afterFirstMigration);
    expect(rows(context, "ledger_events")).toEqual(before.ledgerEvents);
  });

  it("allows multiple wallets to share the opaque Alchemy credential", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v4-wallets-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v4.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context);
    context.sqlite.exec(`
      INSERT INTO books (id, name, is_default, created_at, updated_at)
      VALUES ('book-v4-wallets', 'V4 wallets', 1, '${NOW}', '${NOW}');
      INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
      VALUES
        ('connection-wallet-1', 'book-v4-wallets', 'evm_wallet', 'eip155:1:0x1111111111111111111111111111111111111111', 'Wallet 1', 'env:alchemy.primary', 1, '${NOW}', '${NOW}'),
        ('connection-wallet-2', 'book-v4-wallets', 'evm_wallet', 'eip155:1:0x2222222222222222222222222222222222222222', 'Wallet 2', 'env:alchemy.primary', 1, '${NOW}', '${NOW}');
      INSERT INTO evm_wallet_connections (connection_id, chain_id, network_id, address_lower, address_display, data_provider, history_start_at, created_at, updated_at)
      VALUES
        ('connection-wallet-1', 1, 'eth-mainnet', '0x1111111111111111111111111111111111111111', '0x1111111111111111111111111111111111111111', 'alchemy', '${NOW}', '${NOW}', '${NOW}'),
        ('connection-wallet-2', 1, 'eth-mainnet', '0x2222222222222222222222222222222222222222', '0x2222222222222222222222222222222222222222', 'alchemy', '${NOW}', '${NOW}', '${NOW}');
    `);

    expect(rows(context, "external_connections")).toHaveLength(2);
    expect(rows(context, "evm_wallet_connections")).toHaveLength(2);
    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
