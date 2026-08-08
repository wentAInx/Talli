import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseContext } from "../../db/connection";
import { migrateDatabase } from "../../db/migrate";
import { queryBalanceAt } from "../../db/queries";

describe("V1 to V2 additive migration", () => {
  let context: DatabaseContext | undefined;
  let directory: string | undefined;

  afterEach(() => {
    context?.close();
    context = undefined;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("preserves V1 facts and balances while adding only V2 tables", () => {
    directory = mkdtempSync(join(tmpdir(), "talli-v2-migration-"));
    const v1Migrations = join(directory, "v1-migrations");
    const v1Meta = join(v1Migrations, "meta");
    mkdirSync(v1Meta, { recursive: true });
    const repositoryMigrations = resolve(process.cwd(), "src/db/migrations");
    for (const file of [
      "0000_aberrant_abomination.sql",
      "0001_milky_iron_man.sql",
    ]) {
      copyFileSync(join(repositoryMigrations, file), join(v1Migrations, file));
    }
    const journal = JSON.parse(
      readFileSync(join(repositoryMigrations, "meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    writeFileSync(
      join(v1Meta, "_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
    );

    context = openDatabase(join(directory, "ledger.sqlite"));
    migrateDatabase(context, v1Migrations);
    const at = "2026-08-01T00:00:00.000Z";
    context.sqlite
      .prepare(
        "insert into books (id,name,is_default,created_at,updated_at) values ('book','Book',1,?,?)",
      )
      .run(at, at);
    context.sqlite
      .prepare(
        "insert into assets (id,code,name,asset_type,scale,is_archived,sort_order,created_at,updated_at) values ('cny','CNY','Yuan','fiat',2,0,0,?,?)",
      )
      .run(at, at);
    context.sqlite
      .prepare(
        "insert into accounts (id,book_id,asset_id,name,account_type,is_archived,sort_order,created_at,updated_at) values ('cash','book','cny','Cash','cash',0,0,?,?)",
      )
      .run(at, at);
    context.sqlite
      .prepare(
        "insert into balance_snapshots (id,account_id,as_of,balance_atomic,note,created_at,updated_at) values ('snapshot','cash',?,'10000',null,?,?)",
      )
      .run(at, at, at);
    context.sqlite
      .prepare(
        "insert into ledger_events (id,book_id,event_type,occurred_at,created_at,updated_at) values ('expense','book','expense','2026-08-02T00:00:00.000Z',?,?)",
      )
      .run(at, at);
    context.sqlite
      .prepare(
        "insert into ledger_entries (id,event_id,account_id,entry_role,amount_atomic,created_at) values ('entry','expense','cash','main','-2000',?)",
      )
      .run(at);

    const queryTime = "2026-08-03T00:00:00.000Z";
    expect(queryBalanceAt(context.db, "cash", queryTime)).toBe(8000n);
    const before = context.sqlite
      .prepare(
        "select id,event_id,account_id,entry_role,amount_atomic,created_at from ledger_entries order by id",
      )
      .all();

    migrateDatabase(context, repositoryMigrations);
    migrateDatabase(context, repositoryMigrations);

    expect(
      context.sqlite
        .prepare(
          "select id,event_id,account_id,entry_role,amount_atomic,created_at from ledger_entries order by id",
        )
        .all(),
    ).toEqual(before);
    expect(queryBalanceAt(context.db, "cash", queryTime)).toBe(8000n);
    const tables = context.sqlite
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "book_valuation_settings",
        "price_provider_mappings",
        "manual_price_quotes",
        "latest_price_quotes",
        "price_provider_state",
      ]),
    );
    expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(context.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
  });
});
