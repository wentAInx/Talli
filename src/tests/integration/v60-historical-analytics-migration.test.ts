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
const V51_TAGS = [
  "0000_aberrant_abomination",
  "0001_milky_iron_man",
  "0002_amusing_sage",
  "0003_rich_cargill",
  "0004_v4_evm_wallet_sync",
  "0005_quiet_betty_brant",
  "0006_v41_evm_l2_expansion",
  "0007_v5_financial_file_import",
  "0008_v51_rules_recurring",
] as const;

function v51MigrationsFolder(directory: string): string {
  const source = migrationsFolder();
  const target = join(directory, "v51-migrations");
  mkdirSync(join(target, "meta"), { recursive: true });
  for (const tag of V51_TAGS) {
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
          V51_TAGS.includes(entry.tag as (typeof V51_TAGS)[number]),
        ),
      },
      null,
      2,
    ),
  );
  return target;
}

function rows(context: DatabaseContext, table: string): unknown[] {
  return context.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
}

describe("V5.1 to V6 historical analytics migration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("preserves Ledger and current valuation facts while adding empty history", () => {
    const directory = mkdtempSync(join(tmpdir(), "talli-v60-migration-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const context = openDatabase(join(directory, "v51.sqlite"));
    cleanups.push(() => context.close());
    migrateDatabase(context, v51MigrationsFolder(directory));
    context.sqlite.exec(`
      INSERT INTO books (id, name, is_default, created_at, updated_at)
      VALUES ('book-v60', 'V6 migration fixture', 1, '${NOW}', '${NOW}');
      INSERT INTO assets (id, code, name, symbol, asset_type, scale, is_archived, sort_order, created_at, updated_at)
      VALUES
        ('asset-usd', 'USD', 'US Dollar', '$', 'fiat', 2, 0, 1, '${NOW}', '${NOW}'),
        ('asset-btc', 'BTC', 'Bitcoin', NULL, 'crypto', 8, 1, 2, '${NOW}', '${NOW}');
      INSERT INTO accounts (id, book_id, asset_id, name, account_type, is_archived, sort_order, created_at, updated_at)
      VALUES ('account-btc', 'book-v60', 'asset-btc', 'Archived BTC', 'crypto_wallet', 1, 1, '${NOW}', '${NOW}');
      INSERT INTO ledger_events (id, book_id, event_type, occurred_at, category_id, payee, note, created_at, updated_at)
      VALUES ('event-v60', 'book-v60', 'income', '${NOW}', NULL, NULL, 'Frozen Ledger fact', '${NOW}', '${NOW}');
      INSERT INTO ledger_entries (id, event_id, account_id, entry_role, amount_atomic, created_at)
      VALUES ('entry-v60', 'event-v60', 'account-btc', 'main', '100000000', '${NOW}');
      INSERT INTO balance_snapshots (id, account_id, as_of, balance_atomic, note, created_at, updated_at)
      VALUES ('snapshot-v60', 'account-btc', '${NOW}', '100000000', 'Frozen anchor', '${NOW}', '${NOW}');
      INSERT INTO book_valuation_settings (book_id, home_asset_id, created_at, updated_at)
      VALUES ('book-v60', 'asset-usd', '${NOW}', '${NOW}');
      INSERT INTO price_provider_mappings (asset_id, provider, provider_asset_key, is_enabled, priority, created_at, updated_at)
      VALUES ('asset-btc', 'coingecko', 'bitcoin', 1, 1, '${NOW}', '${NOW}');
      INSERT INTO manual_price_quotes (id, base_asset_id, quote_asset_id, rate_text, observed_at, note, is_active, created_at, updated_at)
      VALUES ('manual-current', 'asset-btc', 'asset-usd', '118000', '${NOW}', 'Current only', 1, '${NOW}', '${NOW}');
      INSERT INTO latest_price_quotes (base_asset_id, quote_asset_id, provider, quote_kind, rate_text, provider_observed_at, provider_observation_date, fetched_at, source_metadata_json)
      VALUES ('asset-btc', 'asset-usd', 'coingecko', 'spot', '118000', '${NOW}', NULL, '${NOW}', '{"fixture":true}');
      INSERT INTO price_provider_state (provider, last_attempt_at, last_success_at, last_error_code, last_error_message, cooldown_until, updated_at)
      VALUES ('coingecko', '${NOW}', '${NOW}', NULL, NULL, NULL, '${NOW}');
    `);

    const frozenTables = [
      "ledger_events",
      "ledger_entries",
      "balance_snapshots",
      "book_valuation_settings",
      "price_provider_mappings",
      "manual_price_quotes",
      "latest_price_quotes",
      "price_provider_state",
    ] as const;
    const frozen = new Map(
      frozenTables.map((table) => [table, rows(context, table)]),
    );

    migrateDatabase(context);

    for (const table of frozenTables) {
      expect(rows(context, table)).toEqual(frozen.get(table));
    }
    for (const table of [
      "historical_price_quotes",
      "historical_fx_quotes",
      "historical_manual_quotes",
      "historical_refresh_runs",
      "historical_refresh_units",
    ]) {
      expect(rows(context, table)).toEqual([]);
    }
    expect(context.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(() =>
      context.sqlite.exec(`
        INSERT INTO historical_price_quotes
          (id, base_asset_id, quote_asset_id, provider, quote_kind, granularity, rate_text, provider_observed_at, first_fetched_at, last_fetched_at)
        VALUES ('invalid-provider', 'asset-btc', 'asset-usd', 'ecb', 'market', 'hourly', '1', '${NOW}', '${NOW}', '${NOW}');
      `),
    ).toThrow();
    expect(() =>
      context.sqlite.exec(`
        INSERT INTO historical_manual_quotes
          (id, base_asset_id, quote_asset_id, valuation_date, rate_text, created_at, updated_at)
        VALUES ('invalid-pair', 'asset-usd', 'asset-usd', '2026-08-15', '1', '${NOW}', '${NOW}');
      `),
    ).toThrow();

    const afterFirstMigration = rows(context, "__drizzle_migrations");
    migrateDatabase(context);
    expect(rows(context, "__drizzle_migrations")).toEqual(afterFirstMigration);
  });
});
