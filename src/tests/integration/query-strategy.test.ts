import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import type { TestDatabase } from "./test-database";
import { createTestDatabase } from "./test-database";

describe("500k-event query strategy", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
  });

  afterEach(() => {
    database.close();
  });

  it("uses the stable composite event-order index for bounded pages", () => {
    const plan = database.context.sqlite
      .prepare(
        `explain query plan
         select id, event_type, occurred_at, created_at
         from ledger_events
         where book_id = ?
           and (occurred_at < ?
             or (occurred_at = ? and created_at < ?)
             or (occurred_at = ? and created_at = ? and id < ?))
         order by occurred_at desc, created_at desc, id desc
         limit 51`,
      )
      .all(
        "seed-book-default",
        "2026-08-07T10:00:00.000Z",
        "2026-08-07T10:00:00.000Z",
        "2026-08-07T09:00:00.000Z",
        "2026-08-07T10:00:00.000Z",
        "2026-08-07T09:00:00.000Z",
        "cursor-id",
      ) as { detail: string }[];
    const details = plan.map((row) => row.detail).join("\n");

    expect(details).toContain("idx_events_book_order");
    expect(details).not.toContain("USE TEMP B-TREE FOR ORDER BY");
  });

  it("has supporting indexes for event hydration and relation filters", () => {
    const indexes = database.context.sqlite
      .prepare(
        `select name from sqlite_master
         where type = 'index' and name in (
           'idx_entries_event',
           'idx_entries_account',
           'idx_event_tags_tag',
           'idx_events_book_occurred',
           'idx_events_book_order'
         )
         order by name`,
      )
      .all() as { name: string }[];
    expect(indexes.map((row) => row.name)).toEqual([
      "idx_entries_account",
      "idx_entries_event",
      "idx_event_tags_tag",
      "idx_events_book_occurred",
      "idx_events_book_order",
    ]);
  });

  it("uses the historical observation lookup indexes for bounded pair reads", () => {
    const pricePlan = database.context.sqlite
      .prepare(
        `explain query plan
         select rate_text
         from historical_price_quotes
         where base_asset_id = ?
           and quote_asset_id = ?
           and provider_observed_at >= ?
           and provider_observed_at <= ?
         order by provider_observed_at`,
      )
      .all(
        "asset-btc",
        "asset-usd",
        "2026-08-01T00:00:00.000Z",
        "2026-08-15T00:00:00.000Z",
      ) as { detail: string }[];
    const fxPlan = database.context.sqlite
      .prepare(
        `explain query plan
         select rate_text
         from historical_fx_quotes
         where base_asset_id = ?
           and quote_asset_id = ?
           and provider_observation_date >= ?
           and provider_observation_date <= ?
         order by provider_observation_date`,
      )
      .all("asset-eur", "asset-cny", "2026-08-01", "2026-08-15") as {
      detail: string;
    }[];

    expect(pricePlan.map((row) => row.detail).join("\n")).toContain(
      "historical_price_quotes_lookup_idx",
    );
    expect(fxPlan.map((row) => row.detail).join("\n")).toContain(
      "historical_fx_quotes_lookup_idx",
    );
  });
});
