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

const NOW = "2026-08-13T09:00:00.000Z";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const TX_HASH = `0x${"a".repeat(64)}`;
const V40_TAGS = [
  "0000_aberrant_abomination",
  "0001_milky_iron_man",
  "0002_amusing_sage",
  "0003_rich_cargill",
  "0004_v4_evm_wallet_sync",
  "0005_quiet_betty_brant",
] as const;

function v40MigrationsFolder(directory: string): string {
  const source = migrationsFolder();
  const target = join(directory, "v40-migrations");
  mkdirSync(join(target, "meta"), { recursive: true });
  for (const tag of V40_TAGS) {
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
          V40_TAGS.includes(entry.tag as (typeof V40_TAGS)[number]),
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

function insertV40Facts(context: DatabaseContext): void {
  context.sqlite.exec(`
    INSERT INTO books (id, name, is_default, created_at, updated_at)
    VALUES ('book-v41', 'V4.1 fixture', 1, '${NOW}', '${NOW}');
    INSERT INTO assets (id, code, name, symbol, asset_type, scale, is_archived, sort_order, created_at, updated_at)
    VALUES ('asset-eth-v41', 'ETH-V41', 'Ethereum fixture', 'ETH', 'crypto', 18, 0, 1, '${NOW}', '${NOW}');
    INSERT INTO accounts (id, book_id, asset_id, name, account_type, is_archived, sort_order, created_at, updated_at)
    VALUES ('account-eth-v41', 'book-v41', 'asset-eth-v41', 'Ethereum wallet', 'crypto_wallet', 0, 1, '${NOW}', '${NOW}');
    INSERT INTO ledger_events (id, book_id, event_type, occurred_at, category_id, payee, note, created_at, updated_at)
    VALUES ('event-v41', 'book-v41', 'expense', '${NOW}', NULL, 'Network', 'Frozen V4.0 fact', '${NOW}', '${NOW}');
    INSERT INTO ledger_entries (id, event_id, account_id, entry_role, amount_atomic, created_at)
    VALUES ('entry-v41', 'event-v41', 'account-eth-v41', 'main', '-21000000000000', '${NOW}');
    INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
    VALUES ('connection-eth-v41', 'book-v41', 'evm_wallet', 'eip155:1:${ADDRESS}', 'Ethereum wallet', 'env:alchemy.primary', 1, '${NOW}', '${NOW}');
    INSERT INTO evm_wallet_connections (connection_id, chain_id, network_id, address_lower, address_display, data_provider, history_start_at, created_at, updated_at)
    VALUES ('connection-eth-v41', 1, 'eth-mainnet', '${ADDRESS}', '${ADDRESS}', 'alchemy', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO evm_wallet_connection_state (connection_id, last_finalized_block_text, last_balance_sync_at, last_activity_sync_at, updated_at)
    VALUES ('connection-eth-v41', '21000018', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO external_asset_mappings (connection_id, provider_asset_key, provider_display_code, talli_asset_id, mapping_status, provider_metadata_json, created_at, updated_at)
    VALUES ('connection-eth-v41', 'eip155:1/native', 'ETH', 'asset-eth-v41', 'mapped', '{"chainId":1,"assetKind":"native"}', '${NOW}', '${NOW}');
    INSERT INTO external_account_mappings (connection_id, provider_asset_key, talli_account_id, is_enabled, created_at, updated_at)
    VALUES ('connection-eth-v41', 'eip155:1/native', 'account-eth-v41', 1, '${NOW}', '${NOW}');
    INSERT INTO external_balance_observations (id, connection_id, provider_asset_key, talli_asset_id, provider_amount_text, mapped_amount_atomic, precision_status, observed_at, payload_hash, created_at)
    VALUES ('observation-v41', 'connection-eth-v41', 'eip155:1/native', 'asset-eth-v41', '1', '1000000000000000000', 'exact', '${NOW}', '${"b".repeat(64)}', '${NOW}');
    INSERT INTO evm_balance_observation_details (observation_id, chain_id, asset_kind, contract_address_lower, raw_amount_atomic_text, token_decimals, sync_head_block_text)
    VALUES ('observation-v41', 1, 'native', NULL, '1000000000000000000', 18, '21000020');
    INSERT INTO external_source_objects (id, connection_id, object_type, external_id, occurred_at, payload_json, payload_hash, first_seen_at, last_seen_at)
    VALUES ('source-v41', 'connection-eth-v41', 'evm_transaction', '${TX_HASH}', '${NOW}', '{}', '${"c".repeat(64)}', '${NOW}', '${NOW}');
    INSERT INTO external_transaction_candidates (id, connection_id, stable_key, suggested_event_type, status, occurred_at, title, normalization_version, source_fingerprint, created_at, updated_at, last_seen_at)
    VALUES ('candidate-v41', 'connection-eth-v41', 'evm:1:gas:${TX_HASH}', 'expense', 'imported', '${NOW}', 'Ethereum fee', 1, '${"d".repeat(64)}', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO external_candidate_source_objects (candidate_id, source_object_id, relation)
    VALUES ('candidate-v41', 'source-v41', 'primary');
    INSERT INTO external_transaction_legs (id, candidate_id, leg_index, role, provider_asset_key, talli_asset_id, amount_text, amount_atomic, precision_status, note)
    VALUES ('leg-v41', 'candidate-v41', 0, 'external_out', 'eip155:1/native', 'asset-eth-v41', '-0.000021', '-21000000000000', 'exact', NULL);
    INSERT INTO evm_candidate_details (candidate_id, chain_id, tx_hash, candidate_kind, classification, tx_status, block_number_text, block_timestamp, from_address_lower, to_address_lower, gas_fee_atomic_text, gas_fee_status)
    VALUES ('candidate-v41', 1, '${TX_HASH}', 'gas', 'gas_only', 'success', '21000017', '${NOW}', '${ADDRESS}', '0x2222222222222222222222222222222222222222', '21000000000000', 'exact');
    INSERT INTO external_import_links (candidate_id, ledger_event_id, imported_at, import_fingerprint)
    VALUES ('candidate-v41', 'event-v41', '${NOW}', '${"e".repeat(64)}');
  `);
}

describe("V4.0 to V4.1 forward migration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("preserves Ethereum and Ledger facts while generalizing chain identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v41-migration-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v40.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context, v40MigrationsFolder(directory));
    insertV40Facts(context);

    const frozen = {
      ledger: rows(context, "SELECT * FROM ledger_events ORDER BY id"),
      entries: rows(context, "SELECT * FROM ledger_entries ORDER BY id"),
      wallet: rows(
        context,
        "SELECT * FROM evm_wallet_connections ORDER BY connection_id",
      ),
      observation: rows(
        context,
        "SELECT * FROM evm_balance_observation_details ORDER BY observation_id",
      ),
      candidate: rows(
        context,
        "SELECT candidate_id, chain_id, tx_hash, candidate_kind, classification, tx_status, block_number_text, block_timestamp, from_address_lower, to_address_lower, gas_fee_atomic_text, gas_fee_status FROM evm_candidate_details ORDER BY candidate_id",
      ),
      imports: rows(
        context,
        "SELECT * FROM external_import_links ORDER BY candidate_id",
      ),
    };

    migrateDatabase(context);

    expect(rows(context, "SELECT * FROM ledger_events ORDER BY id")).toEqual(
      frozen.ledger,
    );
    expect(rows(context, "SELECT * FROM ledger_entries ORDER BY id")).toEqual(
      frozen.entries,
    );
    expect(
      rows(
        context,
        "SELECT * FROM evm_wallet_connections ORDER BY connection_id",
      ),
    ).toEqual(frozen.wallet);
    expect(
      rows(
        context,
        "SELECT * FROM evm_balance_observation_details ORDER BY observation_id",
      ),
    ).toEqual(frozen.observation);
    expect(
      rows(
        context,
        "SELECT candidate_id, chain_id, tx_hash, candidate_kind, classification, tx_status, block_number_text, block_timestamp, from_address_lower, to_address_lower, gas_fee_atomic_text, gas_fee_status FROM evm_candidate_details ORDER BY candidate_id",
      ),
    ).toEqual(frozen.candidate);
    expect(
      rows(
        context,
        "SELECT * FROM external_import_links ORDER BY candidate_id",
      ),
    ).toEqual(frozen.imports);
    expect(
      context.sqlite
        .prepare(
          "SELECT native_trace_status AS nativeTraceStatus FROM evm_candidate_details WHERE candidate_id='candidate-v41'",
        )
        .get(),
    ).toEqual({ nativeTraceStatus: "not_required" });
    expect(
      context.sqlite
        .prepare(
          "SELECT trace_capability_status AS traceCapabilityStatus, trace_checked_at AS traceCheckedAt FROM evm_wallet_connection_state WHERE connection_id='connection-eth-v41'",
        )
        .get(),
    ).toEqual({ traceCapabilityStatus: "unknown", traceCheckedAt: null });
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

  it("allows one address across chains but rejects same-chain duplicates and bad pairs", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v41-chains-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v41.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context);
    context.sqlite.exec(`
      INSERT INTO books (id, name, is_default, created_at, updated_at)
      VALUES ('book-v41-chains', 'V4.1 chains', 1, '${NOW}', '${NOW}');
      INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
      VALUES
        ('connection-base-v41', 'book-v41-chains', 'evm_wallet', 'eip155:8453:${ADDRESS}', 'Base', 'env:alchemy.primary', 1, '${NOW}', '${NOW}'),
        ('connection-arb-v41', 'book-v41-chains', 'evm_wallet', 'eip155:42161:${ADDRESS}', 'Arbitrum', 'env:alchemy.primary', 1, '${NOW}', '${NOW}'),
        ('connection-base-duplicate-v41', 'book-v41-chains', 'evm_wallet', 'eip155:8453:0x2222222222222222222222222222222222222222', 'Base duplicate', 'env:alchemy.primary', 1, '${NOW}', '${NOW}');
      INSERT INTO evm_wallet_connections (connection_id, chain_id, network_id, address_lower, address_display, data_provider, history_start_at, created_at, updated_at)
      VALUES
        ('connection-base-v41', 8453, 'base-mainnet', '${ADDRESS}', '${ADDRESS}', 'alchemy', '${NOW}', '${NOW}', '${NOW}'),
        ('connection-arb-v41', 42161, 'arb-mainnet', '${ADDRESS}', '${ADDRESS}', 'alchemy', '${NOW}', '${NOW}', '${NOW}');
    `);
    expect(
      rows(
        context,
        "SELECT chain_id AS chainId, address_lower AS addressLower FROM evm_wallet_connections ORDER BY chain_id",
      ),
    ).toEqual([
      { chainId: 8453, addressLower: ADDRESS },
      { chainId: 42161, addressLower: ADDRESS },
    ]);
    expect(() =>
      context.sqlite.exec(`
        INSERT INTO evm_wallet_connections (connection_id, chain_id, network_id, address_lower, address_display, data_provider, history_start_at, created_at, updated_at)
        VALUES ('connection-base-duplicate-v41', 8453, 'base-mainnet', '${ADDRESS}', '${ADDRESS}', 'alchemy', '${NOW}', '${NOW}', '${NOW}')
      `),
    ).toThrow();
    expect(() =>
      context.sqlite.exec(`
        INSERT INTO evm_wallet_connections (connection_id, chain_id, network_id, address_lower, address_display, data_provider, history_start_at, created_at, updated_at)
        VALUES ('connection-base-duplicate-v41', 8453, 'arb-mainnet', '0x2222222222222222222222222222222222222222', '0x2222222222222222222222222222222222222222', 'alchemy', '${NOW}', '${NOW}', '${NOW}')
      `),
    ).toThrow();
    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
