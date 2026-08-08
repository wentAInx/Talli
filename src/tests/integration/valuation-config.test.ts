import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import {
  listLatestPriceQuotes,
  upsertLatestPriceQuotes,
} from "../../db/queries";
import {
  ManualPriceService,
  ProviderMappingService,
  ValuationSettingsService,
} from "../../services/valuation-config-service";
import { ReferenceDataService } from "../../services/reference-data-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("valuation configuration services", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
  });

  afterEach(() => database.close());

  it("stores only a non-archived fiat Home Asset", async () => {
    const service = new ValuationSettingsService(database.context);
    await service.setHomeAsset(SEED_BOOK_ID, seedAssetId("USD"));
    expect(service.getHomeAsset(SEED_BOOK_ID)?.asset.code).toBe("USD");

    await expect(
      service.setHomeAsset(SEED_BOOK_ID, seedAssetId("BTC")),
    ).rejects.toMatchObject({ code: "HOME_ASSET_INVALID" });
    database.context.sqlite
      .prepare("update assets set is_archived=1 where id=?")
      .run(seedAssetId("EUR"));
    await expect(
      service.setHomeAsset(SEED_BOOK_ID, seedAssetId("EUR")),
    ).rejects.toMatchObject({ code: "HOME_ASSET_INVALID" });
  });

  it("validates provider mappings against asset type", async () => {
    const service = new ProviderMappingService(database.context);
    const fetchedAt = "2026-08-08T12:00:00.000Z";
    upsertLatestPriceQuotes(database.context.db, [
      {
        baseAssetId: seedAssetId("BTC"),
        quoteAssetId: seedAssetId("USD"),
        provider: "coingecko",
        kind: "spot",
        rateText: "68000",
        providerObservedAt: fetchedAt,
        providerObservationDate: null,
        fetchedAt,
        sourceMetadataJson: '{"providerAssetKey":"bitcoin"}',
      },
    ]);
    await service.update({
      assetId: seedAssetId("BTC"),
      provider: "coingecko",
      providerAssetKey: "bitcoin-v2",
      isEnabled: false,
      priority: 5,
    });
    expect(listLatestPriceQuotes(database.context.db)).toEqual([]);
    expect(
      service
        .list()
        .find(
          (mapping) =>
            mapping.assetId === seedAssetId("BTC") &&
            mapping.provider === "coingecko",
        ),
    ).toMatchObject({
      providerAssetKey: "bitcoin-v2",
      isEnabled: false,
      priority: 5,
    });
    upsertLatestPriceQuotes(database.context.db, [
      {
        baseAssetId: seedAssetId("BTC"),
        quoteAssetId: seedAssetId("USD"),
        provider: "coingecko",
        kind: "spot",
        rateText: "68000",
        providerObservedAt: fetchedAt,
        providerObservationDate: null,
        fetchedAt,
        sourceMetadataJson: '{"providerAssetKey":"bitcoin-v2"}',
      },
    ]);
    await service.update({
      assetId: seedAssetId("BTC"),
      provider: "coingecko",
      providerAssetKey: "bitcoin-v2",
      isEnabled: true,
      priority: 5,
    });
    expect(listLatestPriceQuotes(database.context.db)).toHaveLength(1);
    await expect(
      service.update({
        assetId: seedAssetId("CNY"),
        provider: "coingecko",
        providerAssetKey: "yuan",
        isEnabled: true,
        priority: 100,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_ASSET_TYPE_INVALID" });

    await expect(
      service.update({
        assetId: seedAssetId("USD"),
        provider: "ecb",
        providerAssetKey: "US",
        isEnabled: true,
        priority: 100,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_KEY_INVALID" });
    await service.update({
      assetId: seedAssetId("USD"),
      provider: "ecb",
      providerAssetKey: " usd ",
      isEnabled: true,
      priority: 100,
    });
    expect(
      service
        .list()
        .find(
          (mapping) =>
            mapping.assetId === seedAssetId("USD") &&
            mapping.provider === "ecb",
        )?.providerAssetKey,
    ).toBe("USD");
  });

  it("keeps Home and provider-mapped asset types compatible with valuation config", async () => {
    const references = new ReferenceDataService(database.context);
    await expect(
      references.setAssetArchived(seedAssetId("CNY"), true),
    ).rejects.toMatchObject({ code: "HOME_ASSET_ARCHIVE_BLOCKED" });
    await expect(
      references.updateAsset(seedAssetId("CNY"), {
        code: "CNY",
        name: "Chinese Yuan",
        symbol: "¥",
        assetType: "crypto",
        scale: 2,
        sortOrder: 10,
      }),
    ).rejects.toMatchObject({ code: "HOME_ASSET_TYPE_LOCKED" });
    await expect(
      references.updateAsset(seedAssetId("BTC"), {
        code: "BTC",
        name: "Bitcoin",
        symbol: "BTC",
        assetType: "fiat",
        scale: 8,
        sortOrder: 120,
      }),
    ).rejects.toMatchObject({ code: "ASSET_PROVIDER_MAPPING_LOCKED" });

    await new ValuationSettingsService(database.context).setHomeAsset(
      SEED_BOOK_ID,
      seedAssetId("USD"),
    );
    upsertLatestPriceQuotes(database.context.db, [
      {
        baseAssetId: seedAssetId("EUR"),
        quoteAssetId: seedAssetId("CNY"),
        provider: "ecb",
        kind: "reference",
        rateText: "7.7",
        providerObservedAt: null,
        providerObservationDate: "2026-08-08",
        fetchedAt: "2026-08-08T12:00:00.000Z",
        sourceMetadataJson: '{"providerAssetKey":"CNY"}',
      },
    ]);
    await expect(
      references.setAssetArchived(seedAssetId("CNY"), true),
    ).resolves.toBeUndefined();
    expect(listLatestPriceQuotes(database.context.db)).toEqual([]);
  });

  it("atomically replaces an active manual exact-pair quote", async () => {
    const runtime = deterministicRuntime("2026-08-08T12:00:00.000Z");
    const service = new ManualPriceService(database.context, runtime);
    const first = await service.create({
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      rateText: "476000.000",
      observedAt: "2026-08-08T10:00:00.000Z",
      note: "first",
    });
    const second = await service.create({
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      rateText: "480000",
      observedAt: "2026-08-08T11:00:00.000Z",
    });
    expect(service.list()).toMatchObject([
      { id: second, rateText: "480000", isActive: true },
      { id: first, rateText: "476000", isActive: false },
    ]);
    await service.deactivate(second);
    expect(service.activeForPair(seedAssetId("BTC"), seedAssetId("CNY"))).toBe(
      undefined,
    );
  });

  it("rolls manual replacement back if the new insert fails", async () => {
    const service = new ManualPriceService(database.context);
    const first = await service.create({
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      rateText: "476000",
      observedAt: "2026-08-08T10:00:00.000Z",
    });
    database.context.sqlite.exec(`
      create trigger fail_manual_quote_insert
      before insert on manual_price_quotes
      begin
        select raise(abort, 'forced manual insert failure');
      end;
    `);
    await expect(
      service.create({
        baseAssetId: seedAssetId("BTC"),
        quoteAssetId: seedAssetId("CNY"),
        rateText: "480000",
        observedAt: "2026-08-08T11:00:00.000Z",
      }),
    ).rejects.toThrow("forced manual insert failure");
    expect(
      service.activeForPair(seedAssetId("BTC"), seedAssetId("CNY")),
    ).toMatchObject({ id: first, isActive: true });
  });
});
