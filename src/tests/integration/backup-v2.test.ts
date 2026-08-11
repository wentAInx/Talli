import { afterEach, describe, expect, it } from "vitest";

import {
  readBackupData,
  upsertLatestPriceQuotes,
  upsertPriceProviderState,
} from "../../db/queries";
import { readSeedVersion, seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { BackupValidationError } from "../../domain/backup";
import { AccountService } from "../../services/account-service";
import { BackupService } from "../../services/backup-service";
import { ReconciliationService } from "../../services/reconciliation-service";
import {
  ManualPriceService,
  ProviderMappingService,
  ValuationSettingsService,
} from "../../services/valuation-config-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("Backup v2 valuation compatibility", () => {
  const databases: TestDatabase[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  async function sourceWithFactsAndConfiguration() {
    const database = createTestDatabase();
    databases.push(database);
    seedDatabase(database.context);
    const runtime = deterministicRuntime("2026-08-08T10:00:00.000Z");
    const accountId = await new AccountService(
      database.context,
      runtime,
    ).createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("ETH"),
      name: "ETH exact",
      accountType: "crypto_wallet",
      initialBalance: "1.000000000000000001",
    });
    await new ValuationSettingsService(database.context, runtime).setHomeAsset(
      SEED_BOOK_ID,
      seedAssetId("USD"),
    );
    await new ProviderMappingService(database.context, runtime).update({
      assetId: seedAssetId("BTC"),
      provider: "coingecko",
      providerAssetKey: "bitcoin-custom",
      isEnabled: true,
      priority: 5,
    });
    await new ManualPriceService(database.context, runtime).create({
      baseAssetId: seedAssetId("ETH"),
      quoteAssetId: seedAssetId("USD"),
      rateText: "3456.789",
      observedAt: "2026-08-08T09:30:00.000Z",
      note: "user fact",
    });
    return { database, accountId };
  }

  function asV2Payload(payload: ReturnType<BackupService["exportBackup"]>) {
    return {
      ...payload,
      schemaVersion: 2,
      data: {
        books: payload.data.books,
        assets: payload.data.assets,
        accounts: payload.data.accounts,
        categories: payload.data.categories,
        tags: payload.data.tags,
        ledgerEvents: payload.data.ledgerEvents,
        ledgerEntries: payload.data.ledgerEntries,
        eventTags: payload.data.eventTags,
        balanceSnapshots: payload.data.balanceSnapshots,
        settings: payload.data.settings,
        bookValuationSettings: payload.data.bookValuationSettings,
        priceProviderMappings: payload.data.priceProviderMappings,
        manualPriceQuotes: payload.data.manualPriceQuotes,
      },
    };
  }

  it("B2-001..003 exports user valuation facts but excludes cache and state", async () => {
    const source = await sourceWithFactsAndConfiguration();
    upsertLatestPriceQuotes(source.database.context.db, [
      {
        baseAssetId: seedAssetId("ETH"),
        quoteAssetId: seedAssetId("USD"),
        provider: "coingecko",
        kind: "spot",
        rateText: "3400.01",
        providerObservedAt: "2026-08-08T10:00:00.000Z",
        providerObservationDate: null,
        fetchedAt: "2026-08-08T10:00:00.000Z",
        sourceMetadataJson: '{"secret":"must-not-export"}',
      },
    ]);
    upsertPriceProviderState(source.database.context.db, {
      provider: "coingecko",
      lastAttemptAt: "2026-08-08T10:00:00.000Z",
      lastSuccessAt: "2026-08-08T10:00:00.000Z",
      lastErrorCode: null,
      lastErrorMessage: null,
      cooldownUntil: "2026-08-08T10:01:00.000Z",
      updatedAt: "2026-08-08T10:00:00.000Z",
    });

    const payload = new BackupService(source.database.context).exportBackup();
    const json = JSON.stringify(payload);

    expect(payload.schemaVersion).toBe(3);
    expect(payload.data.bookValuationSettings).toMatchObject([
      { bookId: SEED_BOOK_ID, homeAssetId: seedAssetId("USD") },
    ]);
    expect(payload.data.priceProviderMappings).toContainEqual(
      expect.objectContaining({
        assetId: seedAssetId("BTC"),
        providerAssetKey: "bitcoin-custom",
      }),
    );
    expect(payload.data.manualPriceQuotes).toMatchObject([
      { rateText: "3456.789", isActive: true },
    ]);
    expect(json).not.toContain("latestPriceQuotes");
    expect(json).not.toContain("priceProviderState");
    expect(json).not.toContain("must-not-export");
    expect(json).not.toContain("COINGECKO_API_KEY");
  });

  it("B2-004 upgrades a schemaVersion 1 payload in memory before restoring", async () => {
    const source = await sourceWithFactsAndConfiguration();
    const v2 = new BackupService(source.database.context).exportBackup();
    const v1Data = {
      books: v2.data.books,
      assets: v2.data.assets,
      accounts: v2.data.accounts,
      categories: v2.data.categories,
      tags: v2.data.tags,
      ledgerEvents: v2.data.ledgerEvents,
      ledgerEntries: v2.data.ledgerEntries,
      eventTags: v2.data.eventTags,
      balanceSnapshots: v2.data.balanceSnapshots,
      settings: v2.data.settings,
    };
    const legacy = { ...v2, schemaVersion: 1, data: v1Data };
    const target = createTestDatabase();
    databases.push(target);

    const preview = new BackupService(target.context).restore(legacy);
    const restored = readBackupData(target.context.db);

    expect(preview.schemaVersion).toBe(3);
    expect(restored.accounts).toEqual(v1Data.accounts);
    expect(restored.balanceSnapshots).toEqual(v1Data.balanceSnapshots);
    expect(restored.ledgerEvents).toEqual(v1Data.ledgerEvents);
    expect(restored.bookValuationSettings).toMatchObject([
      { bookId: SEED_BOOK_ID, homeAssetId: seedAssetId("CNY") },
    ]);
    expect(restored.priceProviderMappings).toHaveLength(9);
    expect(restored.manualPriceQuotes).toEqual([]);
    await expect(
      new ReconciliationService(target.context).balanceAt(
        source.accountId,
        "2026-08-09T00:00:00.000Z",
      ),
    ).resolves.toBe(1000000000000000001n);
  });

  it("B2-005 round-trips Home, mappings, and manual quotes exactly", async () => {
    const source = await sourceWithFactsAndConfiguration();
    const payload = asV2Payload(
      new BackupService(source.database.context).exportBackup(),
    );
    const target = createTestDatabase();
    databases.push(target);

    new BackupService(target.context).restore(payload);
    expect(readBackupData(target.context.db)).toEqual(
      readBackupData(source.database.context.db),
    );
  });

  it("canonicalizes manual decimal text before restore persistence", async () => {
    const source = await sourceWithFactsAndConfiguration();
    const payload = new BackupService(source.database.context).exportBackup();
    payload.data.manualPriceQuotes[0]!.rateText = "0003456.7890";
    const target = createTestDatabase();
    databases.push(target);

    new BackupService(target.context).restore(payload);

    expect(
      readBackupData(target.context.db).manualPriceQuotes[0]?.rateText,
    ).toBe("3456.789");
  });

  it("restores internal seed metadata so a seed-only target remains replaceable", () => {
    const source = createTestDatabase();
    databases.push(source);
    seedDatabase(source.context);
    const payload = new BackupService(source.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    const service = new BackupService(target.context);

    service.restore(payload);

    expect(readSeedVersion(target.context.db)).toBe("2");
    expect(service.previewRestore(payload).target).toBe("seed-only");
    expect(() => service.restore(payload)).not.toThrow();
  });

  it("B2-006 rejects corrupt Home, mapping, or manual rate before writes", async () => {
    const source = await sourceWithFactsAndConfiguration();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);

    const invalidHome = structuredClone(payload);
    invalidHome.data.bookValuationSettings[0]!.homeAssetId = seedAssetId("BTC");
    const invalidMapping = structuredClone(payload);
    const btcMapping = invalidMapping.data.priceProviderMappings.find(
      (mapping) => mapping.assetId === seedAssetId("BTC"),
    )!;
    btcMapping.provider = "ecb";
    const invalidEcbKey = structuredClone(payload);
    const cnyMapping = invalidEcbKey.data.priceProviderMappings.find(
      (mapping) => mapping.assetId === seedAssetId("CNY"),
    )!;
    cnyMapping.providerAssetKey = "CN";
    const invalidManual = structuredClone(payload);
    invalidManual.data.manualPriceQuotes[0]!.rateText = "1e-8";

    for (const invalid of [
      invalidHome,
      invalidMapping,
      invalidEcbKey,
      invalidManual,
    ]) {
      expect(() => new BackupService(target.context).restore(invalid)).toThrow(
        BackupValidationError,
      );
      expect(readBackupData(target.context.db).books).toEqual([]);
    }
  });

  it("B2-007 rolls V1 and V2 rows back after a late restore failure", async () => {
    const source = await sourceWithFactsAndConfiguration();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    target.context.sqlite.exec(`
      create trigger fail_manual_restore
      before insert on manual_price_quotes
      begin
        select raise(abort, 'forced V2 restore failure');
      end;
    `);

    expect(() => new BackupService(target.context).restore(payload)).toThrow(
      "forced V2 restore failure",
    );
    const restored = readBackupData(target.context.db);
    expect(restored.books).toEqual([]);
    expect(restored.accounts).toEqual([]);
    expect(restored.bookValuationSettings).toEqual([]);
    expect(restored.priceProviderMappings).toEqual([]);
    expect(restored.manualPriceQuotes).toEqual([]);
    expect(readSeedVersion(target.context.db)).toBeNull();
  });
});
