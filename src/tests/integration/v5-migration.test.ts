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

import { openDatabase } from "../../db/connection";
import { migrateDatabase, migrationsFolder } from "../../db/migrate";

const NOW = "2026-08-13T08:00:00.000Z";
const V4_TAGS = [
  "0000_aberrant_abomination",
  "0001_milky_iron_man",
  "0002_amusing_sage",
  "0003_rich_cargill",
  "0004_v4_evm_wallet_sync",
] as const;

function v4MigrationsFolder(directory: string): string {
  const source = migrationsFolder();
  const target = join(directory, "v4-migrations");
  mkdirSync(join(target, "meta"), { recursive: true });
  for (const tag of V4_TAGS) {
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
          V4_TAGS.includes(entry.tag as (typeof V4_TAGS)[number]),
        ),
      },
      null,
      2,
    ),
  );
  return target;
}

describe("V4 to V5 forward migration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("preserves real zero decimals and makes unknown decimals nullable", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v5-migration-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v4.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context, v4MigrationsFolder(directory));
    context.sqlite.exec(`
      INSERT INTO books (id, name, is_default, created_at, updated_at)
      VALUES ('book-v5-fixture', 'V5 fixture', 1, '${NOW}', '${NOW}');
      INSERT INTO external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at)
      VALUES ('connection-v5-wallet', 'book-v5-fixture', 'evm_wallet', 'eip155:1:0x1111111111111111111111111111111111111111', 'Wallet', 'env:alchemy.primary', 1, '${NOW}', '${NOW}');
      INSERT INTO external_asset_mappings (connection_id, provider_asset_key, provider_display_code, talli_asset_id, mapping_status, provider_metadata_json, created_at, updated_at)
      VALUES ('connection-v5-wallet', 'eip155:1/erc20:0x2222222222222222222222222222222222222222', 'ZERO', NULL, 'unmapped', '{"decimals":0}', '${NOW}', '${NOW}');
      INSERT INTO external_balance_observations (id, connection_id, provider_asset_key, talli_asset_id, provider_amount_text, mapped_amount_atomic, precision_status, observed_at, payload_hash, created_at)
      VALUES ('observation-v5-zero', 'connection-v5-wallet', 'eip155:1/erc20:0x2222222222222222222222222222222222222222', NULL, '42', NULL, 'unmapped', '${NOW}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${NOW}');
      INSERT INTO evm_balance_observation_details (observation_id, chain_id, asset_kind, contract_address_lower, raw_amount_atomic_text, token_decimals, sync_head_block_text)
      VALUES ('observation-v5-zero', 1, 'erc20', '0x2222222222222222222222222222222222222222', '42', 0, '100');
    `);

    migrateDatabase(context);

    expect(
      context.sqlite
        .prepare(
          "select raw_amount_atomic_text as rawAmountAtomicText, token_decimals as tokenDecimals from evm_balance_observation_details where observation_id = 'observation-v5-zero'",
        )
        .get(),
    ).toEqual({ rawAmountAtomicText: "42", tokenDecimals: 0 });
    expect(
      (
        context.sqlite.pragma(
          "table_info('evm_balance_observation_details')",
        ) as Array<{ name: string; notnull: number }>
      ).find((column) => column.name === "token_decimals")?.notnull,
    ).toBe(0);

    context.sqlite.exec(`
      INSERT INTO external_balance_observations (id, connection_id, provider_asset_key, talli_asset_id, provider_amount_text, mapped_amount_atomic, precision_status, observed_at, payload_hash, created_at)
      VALUES ('observation-v5-unknown', 'connection-v5-wallet', 'eip155:1/erc20:0x2222222222222222222222222222222222222222', NULL, '123456789', NULL, 'unmapped', '${NOW}', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '${NOW}');
      INSERT INTO evm_balance_observation_details (observation_id, chain_id, asset_kind, contract_address_lower, raw_amount_atomic_text, token_decimals, sync_head_block_text)
      VALUES ('observation-v5-unknown', 1, 'erc20', '0x2222222222222222222222222222222222222222', '123456789', NULL, '101');
    `);
    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
