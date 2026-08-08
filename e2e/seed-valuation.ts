import { openDatabase } from "../src/db/connection";
import { setupDatabase } from "../src/db/bootstrap";
import {
  upsertLatestPriceQuotes,
  upsertPriceProviderState,
} from "../src/db/queries";
import { seedAssetId } from "../src/db/seed-data";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
  throw new Error("DATABASE_PATH is required for the E2E valuation fixture.");
}

setupDatabase(databasePath);
const context = openDatabase(databasePath);
try {
  const fetchedAt = new Date().toISOString();
  const cooldownUntil = new Date(Date.parse(fetchedAt) + 60_000).toISOString();
  upsertLatestPriceQuotes(context.db, [
    {
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("USD"),
      provider: "coingecko",
      kind: "spot",
      rateText: "68000",
      providerObservedAt: fetchedAt,
      providerObservationDate: null,
      fetchedAt,
      sourceMetadataJson: '{"fixture":true}',
    },
    {
      baseAssetId: seedAssetId("ETH"),
      quoteAssetId: seedAssetId("USD"),
      provider: "coingecko",
      kind: "spot",
      rateText: "3400",
      providerObservedAt: fetchedAt,
      providerObservationDate: null,
      fetchedAt,
      sourceMetadataJson: '{"fixture":true}',
    },
    {
      baseAssetId: seedAssetId("SOL"),
      quoteAssetId: seedAssetId("USD"),
      provider: "coingecko",
      kind: "spot",
      rateText: "150",
      providerObservedAt: fetchedAt,
      providerObservationDate: null,
      fetchedAt,
      sourceMetadataJson: '{"fixture":true}',
    },
    {
      baseAssetId: seedAssetId("USDC"),
      quoteAssetId: seedAssetId("USD"),
      provider: "coingecko",
      kind: "spot",
      rateText: "0.9998",
      providerObservedAt: fetchedAt,
      providerObservationDate: null,
      fetchedAt,
      sourceMetadataJson: '{"fixture":true}',
    },
    {
      baseAssetId: seedAssetId("USDT"),
      quoteAssetId: seedAssetId("USD"),
      provider: "coingecko",
      kind: "spot",
      rateText: "0.9972",
      providerObservedAt: fetchedAt,
      providerObservationDate: null,
      fetchedAt,
      sourceMetadataJson: '{"fixture":true}',
    },
    ...[
      ["CNY", "7.70"],
      ["HKD", "8.50"],
      ["USD", "1.10"],
    ].map(([code, rateText]) => ({
      baseAssetId: seedAssetId("EUR"),
      quoteAssetId: seedAssetId(code),
      provider: "ecb" as const,
      kind: "reference" as const,
      rateText,
      providerObservedAt: null,
      providerObservationDate: fetchedAt.slice(0, 10),
      fetchedAt,
      sourceMetadataJson: '{"fixture":true}',
    })),
  ]);
  for (const provider of ["coingecko", "ecb"] as const) {
    upsertPriceProviderState(context.db, {
      provider,
      lastAttemptAt: fetchedAt,
      lastSuccessAt: fetchedAt,
      lastErrorCode: null,
      lastErrorMessage: null,
      cooldownUntil,
      updatedAt: fetchedAt,
    });
  }
} finally {
  context.close();
}
