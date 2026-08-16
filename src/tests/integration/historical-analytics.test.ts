import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { HistoricalAnalyticsService } from "../../services/historical-analytics-service";
import { HistoricalManualQuoteService } from "../../services/historical-manual-quote-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ReferenceDataService } from "../../services/reference-data-service";
import { SettingsService } from "../../services/settings-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("HistoricalAnalyticsService", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
  });

  afterEach(() => database.close());

  it("reads archived exposure, event-time flows, and exact bridge math in one derived layer", async () => {
    const factRuntime = deterministicRuntime("2026-08-12T00:00:00.000Z");
    await new SettingsService(database.context, factRuntime).setTimeZone(
      "Asia/Shanghai",
    );
    const accounts = new AccountService(database.context, factRuntime);
    const cnyAccount = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "Cash",
      accountType: "cash",
      initialBalance: "1000.00",
    });
    const usdAccount = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USD"),
      name: "USD liability",
      accountType: "credit",
      initialBalance: "-10.00",
    });
    const btcAccount = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("BTC"),
      name: "Archived BTC wallet",
      accountType: "crypto_wallet",
      initialBalance: "0.10000000",
    });
    await new LedgerCommandService(database.context, factRuntime).createIncome({
      accountId: usdAccount,
      amount: "10.00",
      occurredAt: "2026-08-14T02:00:00.000Z",
      note: "Historical income",
    });
    await accounts.setArchived(btcAccount, true);
    await new ReferenceDataService(
      database.context,
      factRuntime,
    ).setAssetArchived(seedAssetId("BTC"), true);

    const manual = new HistoricalManualQuoteService(
      database.context,
      deterministicRuntime("2026-08-15T00:00:00.000Z"),
    );
    for (const valuationDate of ["2026-08-13", "2026-08-14"]) {
      await manual.save({
        baseAssetId: seedAssetId("BTC"),
        quoteAssetId: seedAssetId("CNY"),
        valuationDate,
        rateText: "476000",
      });
      await manual.save({
        baseAssetId: seedAssetId("USD"),
        quoteAssetId: seedAssetId("CNY"),
        valuationDate,
        rateText: "7",
      });
    }

    const analytics = new HistoricalAnalyticsService(database.context);
    const series = analytics.netWorthSeries({
      bookId: SEED_BOOK_ID,
      fromDate: "2026-08-13",
      toDate: "2026-08-14",
    });
    expect(series).toMatchObject({
      homeAssetId: seedAssetId("CNY"),
      timeZone: "Asia/Shanghai",
      points: [
        {
          localDate: "2026-08-13",
          completeValueText: "48530",
          grossAssetsKnownText: "48600",
          grossLiabilitiesKnownText: "-70",
          isComplete: true,
        },
        {
          localDate: "2026-08-14",
          completeValueText: "48600",
          grossAssetsKnownText: "48600",
          grossLiabilitiesKnownText: "0",
          isComplete: true,
        },
      ],
    });
    expect(cnyAccount).toBeTruthy();

    expect(
      analytics.allocation({
        bookId: SEED_BOOK_ID,
        localDate: "2026-08-13",
      }).liabilitiesByAsset,
    ).toEqual([
      {
        key: seedAssetId("USD"),
        label: "USD",
        valueText: "-70",
        shareText: null,
      },
    ]);

    expect(
      analytics.allocation({
        bookId: SEED_BOOK_ID,
        localDate: "2026-08-14",
      }),
    ).toMatchObject({
      grossAssetsText: "48600",
      grossLiabilitiesText: "0",
      netWorthText: "48600",
      byAsset: expect.arrayContaining([
        expect.objectContaining({
          key: seedAssetId("BTC"),
          valueText: "47600",
        }),
      ]),
    });

    expect(
      analytics.cashFlowTrend({
        bookId: SEED_BOOK_ID,
        fromDate: "2026-08-14",
        toDate: "2026-08-14",
        bucket: "month",
      }),
    ).toEqual({
      buckets: [
        {
          period: "2026-08",
          incomeText: "70",
          expenseText: "0",
          feesText: "0",
          netFlowText: "70",
          isComplete: true,
          missingCount: 0,
        },
      ],
    });

    expect(
      analytics.decomposition({
        bookId: SEED_BOOK_ID,
        fromDate: "2026-08-14",
        toDate: "2026-08-14",
      }),
    ).toEqual({
      points: [
        {
          localDate: "2026-08-14",
          startValueText: "48530",
          endValueText: "48600",
          deltaText: "70",
          marketAndFxText: "0",
          incomeText: "70",
          expenseText: "0",
          feesText: "0",
          internalTransferText: "0",
          tradeRebalanceText: "0",
          reconciliationText: "0",
          isComplete: true,
          missingAssetIds: [],
        },
      ],
    });
  });

  it("marks a nonzero unsupported asset incomplete without treating it as zero", async () => {
    const runtime = deterministicRuntime("2026-08-12T00:00:00.000Z");
    const references = new ReferenceDataService(database.context, runtime);
    const customId = await references.createAsset({
      code: "ART",
      name: "Artwork",
      assetType: "custom",
      scale: 0,
    });
    await new AccountService(database.context, runtime).createAccount({
      bookId: SEED_BOOK_ID,
      assetId: customId,
      name: "Artwork",
      accountType: "other",
      initialBalance: "1",
    });
    const point = new HistoricalAnalyticsService(
      database.context,
    ).netWorthSeries({
      bookId: SEED_BOOK_ID,
      fromDate: "2026-08-13",
      toDate: "2026-08-13",
    }).points[0]!;
    expect(point).toMatchObject({
      knownValueText: "0",
      completeValueText: null,
      isComplete: false,
      missingAssetIds: [customId],
    });
  });

  it("does not require a mapping for a zero historical balance", async () => {
    const runtime = deterministicRuntime("2026-08-12T00:00:00.000Z");
    const references = new ReferenceDataService(database.context, runtime);
    const customId = await references.createAsset({
      code: "ZERO",
      name: "Zero custom holding",
      assetType: "custom",
      scale: 0,
    });
    await new AccountService(database.context, runtime).createAccount({
      bookId: SEED_BOOK_ID,
      assetId: customId,
      name: "Zero custom account",
      accountType: "other",
      initialBalance: "0",
    });
    expect(
      new HistoricalAnalyticsService(database.context).netWorthSeries({
        bookId: SEED_BOOK_ID,
        fromDate: "2026-08-13",
        toDate: "2026-08-13",
      }).points[0],
    ).toMatchObject({
      knownValueText: "0",
      completeValueText: "0",
      isComplete: true,
      missingAssetIds: [],
    });
  });

  it("keeps decomposition complete when Q0 is zero and only P1 exists", async () => {
    const runtime = deterministicRuntime("2026-08-12T00:00:00.000Z");
    const references = new ReferenceDataService(database.context, runtime);
    const customId = await references.createAsset({
      code: "NEW",
      name: "New custom holding",
      assetType: "custom",
      scale: 0,
    });
    const accountId = await new AccountService(
      database.context,
      runtime,
    ).createAccount({
      bookId: SEED_BOOK_ID,
      assetId: customId,
      name: "New holding",
      accountType: "other",
      initialBalance: "0",
    });
    await new LedgerCommandService(database.context, runtime).createIncome({
      accountId,
      amount: "1",
      occurredAt: "2026-08-14T02:00:00.000Z",
      note: "Acquired from zero",
    });
    await new HistoricalManualQuoteService(
      database.context,
      deterministicRuntime("2026-08-15T00:00:00.000Z"),
    ).save({
      baseAssetId: customId,
      quoteAssetId: seedAssetId("CNY"),
      valuationDate: "2026-08-14",
      rateText: "5000",
    });

    expect(
      new HistoricalAnalyticsService(database.context).decomposition({
        bookId: SEED_BOOK_ID,
        fromDate: "2026-08-14",
        toDate: "2026-08-14",
      }),
    ).toEqual({
      points: [
        {
          localDate: "2026-08-14",
          startValueText: "0",
          endValueText: "5000",
          deltaText: "5000",
          marketAndFxText: "0",
          incomeText: "5000",
          expenseText: "0",
          feesText: "0",
          internalTransferText: "0",
          tradeRebalanceText: "0",
          reconciliationText: "0",
          isComplete: true,
          missingAssetIds: [],
        },
      ],
    });
  });
});
