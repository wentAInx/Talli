import { afterEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../../db/migrate";
import type { TestDatabase } from "./test-database";
import { createTestDatabase } from "./test-database";

const expectedTables = [
  "books",
  "assets",
  "accounts",
  "categories",
  "tags",
  "ledger_events",
  "ledger_entries",
  "event_tags",
  "balance_snapshots",
  "app_settings",
  "app_meta",
];

describe("SQLite persistence boundary", () => {
  let database: TestDatabase | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("migrates an empty file database idempotently with FK and WAL enabled", () => {
    database = createTestDatabase();
    migrateDatabase(database.context);

    expect(
      database.context.sqlite.pragma("foreign_keys", { simple: true }),
    ).toBe(1);
    expect(
      database.context.sqlite.pragma("journal_mode", { simple: true }),
    ).toBe("wal");

    const tables = database.context.sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' order by name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(expectedTables));
  });

  it("rejects foreign-key violations", () => {
    database = createTestDatabase();

    expect(() =>
      database?.context.sqlite
        .prepare(
          `insert into accounts
           (id, book_id, asset_id, name, account_type, is_archived, sort_order, created_at, updated_at)
           values (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        )
        .run(
          "account-invalid",
          "missing-book",
          "missing-asset",
          "Invalid",
          "other",
          "2026-08-01T00:00:00.000Z",
          "2026-08-01T00:00:00.000Z",
        ),
    ).toThrow();
  });

  it("enforces asset codes case-insensitively", () => {
    database = createTestDatabase();
    const insert = database.context.sqlite.prepare(
      `insert into assets
       (id, code, name, asset_type, scale, is_archived, sort_order, created_at, updated_at)
       values (?, ?, ?, 'fiat', 2, 0, 0, ?, ?)`,
    );
    const timestamp = "2026-08-01T00:00:00.000Z";
    insert.run("asset-upper", "CNY", "Chinese Yuan", timestamp, timestamp);

    expect(() =>
      insert.run("asset-lower", "cny", "Duplicate", timestamp, timestamp),
    ).toThrow();
  });
});
