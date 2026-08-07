import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  readSeedVersion,
  seedDatabase,
  SeedConflictError,
} from "../../db/seed";
import {
  SEED_ASSETS,
  SEED_BOOK_ID,
  SEED_CATEGORIES,
  SEED_SCHEMA_VERSION,
  SEED_TIMESTAMP,
} from "../../db/seed-data";
import type { TestDatabase } from "./test-database";
import { createTestDatabase } from "./test-database";

function countRows(database: TestDatabase, table: string): number {
  const row = database.context.sqlite
    .prepare(`select count(*) as count from ${table}`)
    .get() as { count: number };
  return row.count;
}

describe("canonical seed", () => {
  let database: TestDatabase | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("matches the canonical seed specification exactly", () => {
    const canonical = JSON.parse(
      readFileSync(resolve(process.cwd(), "10_SEED_DATA.json"), "utf8"),
    ) as {
      schemaVersion: number;
      assets: Array<{
        code: string;
        name: string;
        symbol: string;
        type: "fiat" | "crypto" | "custom";
        scale: number;
        sortOrder: number;
      }>;
      categories: Array<{
        name: string;
        type: "expense" | "income" | "both";
      }>;
    };

    expect(SEED_SCHEMA_VERSION).toBe(canonical.schemaVersion);
    expect(
      SEED_ASSETS.map(
        ({ code, name, symbol, assetType: type, scale, sortOrder }) => ({
          code,
          name,
          symbol,
          type,
          scale,
          sortOrder,
        }),
      ),
    ).toEqual(canonical.assets);
    expect(
      SEED_CATEGORIES.map(({ name, categoryType: type }) => ({ name, type })),
    ).toEqual(canonical.categories);
  });

  it("is idempotent and creates no fake user facts", () => {
    database = createTestDatabase();
    seedDatabase(database.context);
    const firstAssetIds = database.context.sqlite
      .prepare("select id from assets order by code")
      .all();
    const firstCategoryIds = database.context.sqlite
      .prepare("select id from categories order by name")
      .all();

    seedDatabase(database.context);

    expect(countRows(database, "books")).toBe(1);
    expect(countRows(database, "assets")).toBe(SEED_ASSETS.length);
    expect(countRows(database, "categories")).toBe(SEED_CATEGORIES.length);
    expect(countRows(database, "accounts")).toBe(0);
    expect(countRows(database, "ledger_events")).toBe(0);
    expect(countRows(database, "ledger_entries")).toBe(0);
    expect(countRows(database, "balance_snapshots")).toBe(0);
    expect(
      database.context.sqlite
        .prepare("select id from books where is_default = 1")
        .get(),
    ).toEqual({ id: SEED_BOOK_ID });
    expect(
      database.context.sqlite
        .prepare("select id from assets order by code")
        .all(),
    ).toEqual(firstAssetIds);
    expect(
      database.context.sqlite
        .prepare("select id from categories order by name")
        .all(),
    ).toEqual(firstCategoryIds);
    expect(readSeedVersion(database.context.db)).toBe(
      String(SEED_SCHEMA_VERSION),
    );
  });

  it("keeps a compatible pre-existing asset without overwriting it", () => {
    database = createTestDatabase();
    database.context.sqlite
      .prepare(
        `insert into assets
         (id, code, name, symbol, asset_type, scale, is_archived, sort_order, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, 1, 999, ?, ?)`,
      )
      .run(
        "user-cny",
        "cny",
        "My Yuan",
        "CN¥",
        "fiat",
        2,
        SEED_TIMESTAMP,
        SEED_TIMESTAMP,
      );

    seedDatabase(database.context);

    expect(countRows(database, "assets")).toBe(SEED_ASSETS.length);
    expect(
      database.context.sqlite
        .prepare(
          "select id, name, symbol, is_archived, sort_order from assets where code = ? collate nocase",
        )
        .get("CNY"),
    ).toEqual({
      id: "user-cny",
      name: "My Yuan",
      symbol: "CN¥",
      is_archived: 1,
      sort_order: 999,
    });
  });

  it("preserves user edits to fixed-id seed records across restarts", () => {
    database = createTestDatabase();
    seedDatabase(database.context);
    database.context.sqlite
      .prepare(
        `update assets
         set code = 'YUAN', name = 'My Yuan', is_archived = 1, sort_order = 999
         where id = 'seed-asset-cny'`,
      )
      .run();
    database.context.sqlite
      .prepare(
        `update categories
         set name = 'Food', category_type = 'both', is_archived = 1, sort_order = 999
         where id = 'seed-category-expense-food'`,
      )
      .run();

    expect(() => seedDatabase(database!.context)).not.toThrow();
    expect(countRows(database, "assets")).toBe(SEED_ASSETS.length);
    expect(countRows(database, "categories")).toBe(SEED_CATEGORIES.length);
    expect(
      database.context.sqlite
        .prepare(
          "select code, name, is_archived, sort_order from assets where id = 'seed-asset-cny'",
        )
        .get(),
    ).toEqual({
      code: "YUAN",
      name: "My Yuan",
      is_archived: 1,
      sort_order: 999,
    });
    expect(
      database.context.sqlite
        .prepare(
          "select name, category_type, is_archived, sort_order from categories where id = 'seed-category-expense-food'",
        )
        .get(),
    ).toEqual({
      name: "Food",
      category_type: "both",
      is_archived: 1,
      sort_order: 999,
    });
  });

  it("rolls the whole seed back when a canonical asset conflicts", () => {
    database = createTestDatabase();
    database.context.sqlite
      .prepare(
        `insert into assets
         (id, code, name, asset_type, scale, is_archived, sort_order, created_at, updated_at)
         values (?, 'CNY', 'Wrong Yuan', 'fiat', 3, 0, 0, ?, ?)`,
      )
      .run("bad-cny", SEED_TIMESTAMP, SEED_TIMESTAMP);

    expect(() => seedDatabase(database!.context)).toThrow(SeedConflictError);
    expect(countRows(database, "books")).toBe(0);
    expect(countRows(database, "assets")).toBe(1);
    expect(countRows(database, "categories")).toBe(0);
    expect(countRows(database, "app_meta")).toBe(0);
  });
});
