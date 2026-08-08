import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { upsertLatestPriceQuotes } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import type { ProviderQuote } from "../../domain/quote-types";
import { AccountService } from "../../services/account-service";
import { PortfolioValuationService } from "../../services/portfolio-valuation-service";
import { ManualPriceService } from "../../services/valuation-config-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

const FETCHED_AT = "2026-08-08T12:00:00.000Z";
const QUERY_TIME = "2026-08-08T12:05:00.000Z";

function quote(
  baseAssetId: string,
  quoteAssetId: string,
  provider: "coingecko" | "ecb",
  rateText: string,
): ProviderQuote {
  return {
    baseAssetId,
    quoteAssetId,
    provider,
    kind: provider === "ecb" ? "reference" : "spot",
    rateText,
    providerObservedAt: provider === "coingecko" ? FETCHED_AT : null,
    providerObservationDate: provider === "ecb" ? "2026-08-08" : null,
    fetchedAt: FETCHED_AT,
    sourceMetadataJson: '{"fixture":true}',
  };
}

describe("PortfolioValuationService", () => {
  let database: TestDatabase;
  let accounts: AccountService;

  beforeEach(async () => {
    database = createTestDatabase();
    seedDatabase(database.context);
    accounts = new AccountService(
      database.context,
      deterministicRuntime("2026-08-08T10:00:00.000Z"),
    );
    await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "CNY",
      accountType: "cash",
      initialBalance: "1000.00",
    });
    await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USD"),
      name: "USD debt",
      accountType: "credit",
      initialBalance: "-10.00",
    });
    await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("BTC"),
      name: "BTC",
      accountType: "crypto_wallet",
      initialBalance: "0.10000000",
    });
    await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USDT"),
      name: "USDT",
      accountType: "exchange",
      initialBalance: "100.000000",
    });
    upsertLatestPriceQuotes(database.context.db, [
      quote(seedAssetId("EUR"), seedAssetId("USD"), "ecb", "1.10"),
      quote(seedAssetId("EUR"), seedAssetId("CNY"), "ecb", "7.70"),
      quote(seedAssetId("BTC"), seedAssetId("USD"), "coingecko", "68000"),
      quote(seedAssetId("USDT"), seedAssetId("USD"), "coingecko", "0.9972"),
    ]);
  });

  afterEach(() => database.close());

  it("values one balance snapshot with Decimal and preserves the USDT market path", () => {
    const valuation = new PortfolioValuationService(database.context).current({
      bookId: SEED_BOOK_ID,
      queryTime: QUERY_TIME,
    });

    expect(valuation).toMatchObject({
      homeAsset: { code: "CNY" },
      totalValueText: "49228.04",
      totalValueDisplay: "49228.04",
      isComplete: true,
      valuedNonZeroAssetCount: 4,
      missingNonZeroAssetCount: 0,
    });
    expect(
      valuation?.lines.find((line) => line.asset.code === "USD"),
    ).toMatchObject({ valueText: "-70", valueDisplay: "-70.00" });
    expect(
      valuation?.lines.find((line) => line.asset.code === "BTC"),
    ).toMatchObject({ valueText: "47600", resolution: { status: "fresh" } });
    expect(
      valuation?.lines.find((line) => line.asset.code === "USDT"),
    ).toMatchObject({
      valueText: "698.04",
      resolution: { rateText: "6.9804" },
    });
  });

  it("uses an active exact-pair manual quote without mutating native balances", async () => {
    const manual = new ManualPriceService(
      database.context,
      deterministicRuntime("2026-08-08T12:01:00.000Z"),
    );
    await manual.create({
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("CNY"),
      rateText: "500000",
      observedAt: "2026-08-08T12:00:00.000Z",
    });

    const valuation = new PortfolioValuationService(database.context).current({
      bookId: SEED_BOOK_ID,
      queryTime: QUERY_TIME,
    });

    expect(
      valuation?.lines.find((line) => line.asset.code === "BTC"),
    ).toMatchObject({
      quantityAtomic: "10000000",
      valueText: "50000",
      resolution: { status: "manual", rateText: "500000" },
    });
    expect(valuation?.totalValueText).toBe("51628.04");
  });

  it("marks a non-zero asset missing instead of silently valuing it as zero", () => {
    database.context.sqlite
      .prepare(
        "delete from latest_price_quotes where base_asset_id=? and provider='coingecko'",
      )
      .run(seedAssetId("BTC"));

    const valuation = new PortfolioValuationService(database.context).current({
      bookId: SEED_BOOK_ID,
      queryTime: QUERY_TIME,
    });

    expect(valuation).toMatchObject({
      isComplete: false,
      valuedNonZeroAssetCount: 3,
      missingNonZeroAssetCount: 1,
      totalValueText: "1628.04",
    });
    expect(
      valuation?.lines.find((line) => line.asset.code === "BTC"),
    ).toMatchObject({
      valueText: null,
      resolution: { ok: false, status: "missing_quote" },
    });
  });

  it("returns null for a book without valuation settings", () => {
    expect(
      new PortfolioValuationService(database.context).current({
        bookId: "missing-book",
        queryTime: QUERY_TIME,
      }),
    ).toBeNull();
  });
});
