import { afterEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "./test-database";

const V3_TABLES = [
  "external_account_mappings",
  "external_asset_mappings",
  "external_balance_observations",
  "external_candidate_source_objects",
  "external_connection_state",
  "external_connections",
  "external_import_links",
  "external_source_objects",
  "external_sync_runs",
  "external_transaction_candidates",
  "external_transaction_legs",
] as const;

describe("V3 additive migration", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("adds all external-sync tables without changing ledger fact rows", () => {
    database = createTestDatabase();
    const tableNames = database.context.sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name like 'external_%' order by name",
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .filter((name) => V3_TABLES.includes(name as (typeof V3_TABLES)[number]));

    expect(tableNames).toEqual([...V3_TABLES]);
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from ledger_events")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from balance_snapshots")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("stores only unsigned decimal nonce text in operational state", () => {
    database = createTestDatabase();
    const sqlite = database.context.sqlite;
    sqlite
      .prepare(
        "insert into books (id, name, is_default, created_at, updated_at) values (?, ?, 1, ?, ?)",
      )
      .run(
        "book-v3",
        "V3",
        "2026-08-11T00:00:00.000Z",
        "2026-08-11T00:00:00.000Z",
      );
    sqlite
      .prepare(
        "insert into external_connections (id, book_id, provider, source_key, name, credential_ref, is_enabled, created_at, updated_at) values (?, ?, 'kraken', 'kraken:primary', ?, 'env:kraken.primary', 1, ?, ?)",
      )
      .run(
        "connection-v3",
        "book-v3",
        "Kraken",
        "2026-08-11T00:00:00.000Z",
        "2026-08-11T00:00:00.000Z",
      );

    expect(() =>
      sqlite
        .prepare(
          "insert into external_connection_state (connection_id, last_nonce_text, updated_at) values (?, ?, ?)",
        )
        .run("connection-v3", "1abc", "2026-08-11T00:00:00.000Z"),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "insert into external_connection_state (connection_id, last_nonce_text, updated_at) values (?, ?, ?)",
        )
        .run("connection-v3", "1786440000100", "2026-08-11T00:00:00.000Z"),
    ).not.toThrow();
  });
});
