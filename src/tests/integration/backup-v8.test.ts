import { afterEach, describe, expect, it } from "vitest";

import {
  insertHistoricalRefreshRun,
  upsertHistoricalPriceObservations,
} from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { BackupValidationError } from "../../domain/backup";
import {
  BackupService,
  RestoreTargetError,
} from "../../services/backup-service";
import { HistoricalManualQuoteService } from "../../services/historical-manual-quote-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

const NOW = "2026-08-15T00:00:00.000Z";

describe("Backup schemaVersion 8 historical manual quotes", () => {
  const databases: TestDatabase[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  async function sourceFixture() {
    const database = createTestDatabase();
    databases.push(database);
    seedDatabase(database.context);
    const manual = new HistoricalManualQuoteService(
      database.context,
      deterministicRuntime(NOW),
    );
    const manualId = await manual.save({
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      valuationDate: "2026-08-14",
      rateText: "476000.25",
      note: "User-authored historical fact",
    });
    upsertHistoricalPriceObservations(
      database.context.db,
      [
        {
          baseAssetId: seedAssetId("BTC"),
          quoteAssetId: seedAssetId("USD"),
          provider: "coingecko",
          granularity: "hourly",
          rateText: "68000",
          providerObservedAt: "2026-08-14T15:00:00.000Z",
          fetchedAt: NOW,
          sourceMetadataJson: '{"fixture":true}',
        },
      ],
      () => "auto-quote",
    );
    insertHistoricalRefreshRun(
      database.context.db,
      {
        id: "refresh-run",
        requestedFromDate: "2026-08-14",
        requestedToDate: "2026-08-14",
        status: "success",
        mappingFingerprint: "a".repeat(64),
        totalUnits: 0,
        completedUnits: 0,
        failedUnits: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        requestedAt: NOW,
        updatedAt: NOW,
        completedAt: NOW,
      },
      [],
    );
    return { database, manual, manualId };
  }

  it("exports and round-trips manual history while excluding provider cache and runs", async () => {
    const { database } = await sourceFixture();
    const payload = new BackupService(
      database.context,
      deterministicRuntime(NOW),
    ).exportBackup();

    expect(payload.schemaVersion).toBe(8);
    expect(payload.data.historicalManualQuotes).toEqual([
      {
        id: "test-id-0001",
        baseAssetId: seedAssetId("BTC"),
        quoteAssetId: seedAssetId("CNY"),
        valuationDate: "2026-08-14",
        rateText: "476000.25",
        note: "User-authored historical fact",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    expect(Object.keys(payload.data)).not.toEqual(
      expect.arrayContaining([
        "historicalPriceQuotes",
        "historicalFxQuotes",
        "historicalRefreshRuns",
        "historicalRefreshUnits",
      ]),
    );

    const target = createTestDatabase();
    databases.push(target);
    new BackupService(target.context).restore(payload);
    expect(new HistoricalManualQuoteService(target.context).list()).toEqual(
      payload.data.historicalManualQuotes,
    );
    expect(
      target.context.sqlite
        .prepare("select count(*) as count from historical_price_quotes")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      target.context.sqlite
        .prepare("select count(*) as count from historical_refresh_runs")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("upgrades an exact V7 payload in memory with empty manual history", async () => {
    const { database } = await sourceFixture();
    const current = new BackupService(database.context).exportBackup();
    const { historicalManualQuotes: _history, ...v7Data } = current.data;
    expect(_history).toHaveLength(1);
    const parsed = new BackupService(database.context).parseJson(
      JSON.stringify({ ...current, schemaVersion: 7, data: v7Data }),
    );
    expect(parsed.schemaVersion).toBe(8);
    expect(parsed.data.historicalManualQuotes).toEqual([]);
  });

  it("rejects corrupt facts before writes and treats manual-only targets as non-empty", async () => {
    const { database } = await sourceFixture();
    const payload = new BackupService(database.context).exportBackup();
    const corrupt = structuredClone(payload);
    corrupt.data.historicalManualQuotes[0]!.rateText = "0476000.250";
    const empty = createTestDatabase();
    databases.push(empty);
    expect(() => new BackupService(empty.context).restore(corrupt)).toThrow(
      BackupValidationError,
    );
    expect(
      empty.context.sqlite.prepare("select count(*) as count from books").get(),
    ).toEqual({ count: 0 });

    const manualOnly = createTestDatabase();
    databases.push(manualOnly);
    seedDatabase(manualOnly.context);
    await new HistoricalManualQuoteService(
      manualOnly.context,
      deterministicRuntime(NOW),
    ).save({
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      valuationDate: "2026-08-13",
      rateText: "470000",
    });
    expect(() =>
      new BackupService(manualOnly.context).restore(payload),
    ).toThrow(RestoreTargetError);
  });

  it("keeps every successful manual mutation immediately exportable", async () => {
    const { database, manual, manualId } = await sourceFixture();
    await manual.save({
      id: manualId,
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      valuationDate: "2026-08-13",
      rateText: "480000",
    });
    expect(
      new BackupService(database.context).exportBackup().data
        .historicalManualQuotes[0],
    ).toMatchObject({
      id: manualId,
      valuationDate: "2026-08-13",
      rateText: "480000",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await manual.delete(manualId);
    expect(
      new BackupService(database.context).exportBackup().data
        .historicalManualQuotes,
    ).toEqual([]);
    expect(
      new BackupService(database.context).exportBackup().data.books[0]?.id,
    ).toBe(SEED_BOOK_ID);
  });

  it("rolls back restored manual history when a later write fails", async () => {
    const { database } = await sourceFixture();
    const payload = new BackupService(database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    target.context.sqlite.exec(`
      create trigger reject_provider_mapping_restore
      before insert on price_provider_mappings
      begin
        select raise(abort, 'fixture late restore failure');
      end;
    `);

    expect(() => new BackupService(target.context).restore(payload)).toThrow(
      "fixture late restore failure",
    );
    expect(
      target.context.sqlite
        .prepare("select count(*) as count from books")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      target.context.sqlite
        .prepare("select count(*) as count from historical_manual_quotes")
        .get(),
    ).toEqual({ count: 0 });
  });
});
