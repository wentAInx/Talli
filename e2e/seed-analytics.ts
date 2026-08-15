import { openDatabase } from "../src/db/connection";
import { setupDatabase } from "../src/db/bootstrap";
import { SEED_BOOK_ID, seedAssetId } from "../src/db/seed-data";
import { AccountService } from "../src/services/account-service";
import { LedgerCommandService } from "../src/services/ledger-command-service";
import { ReferenceDataService } from "../src/services/reference-data-service";
import type { ServiceRuntime } from "../src/services/runtime";
import { SettingsService } from "../src/services/settings-service";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
  throw new Error("DATABASE_PATH is required for the Analytics E2E fixture.");
}

let sequence = 0;
const runtime: ServiceRuntime = {
  id: () => `analytics-e2e-${String(++sequence).padStart(4, "0")}`,
  now: () => "2026-08-12T00:00:00.000Z",
};

setupDatabase(databasePath);
const context = openDatabase(databasePath);
try {
  await new SettingsService(context, runtime).setTimeZone("Asia/Shanghai");
  const references = new ReferenceDataService(context, runtime);
  const customAssetId = await references.createAsset({
    code: "ART",
    name: "Artwork",
    symbol: "ART",
    assetType: "custom",
    scale: 0,
    sortOrder: 500,
  });
  const accounts = new AccountService(context, runtime);
  const cny = await accounts.createAccount({
    bookId: SEED_BOOK_ID,
    assetId: seedAssetId("CNY"),
    name: "Analytics cash",
    accountType: "cash",
    initialBalance: "1000.00",
  });
  await accounts.createAccount({
    bookId: SEED_BOOK_ID,
    assetId: seedAssetId("USD"),
    name: "Analytics liability",
    accountType: "credit",
    initialBalance: "-10.00",
  });
  const btc = await accounts.createAccount({
    bookId: SEED_BOOK_ID,
    assetId: seedAssetId("BTC"),
    name: "Archived BTC exposure",
    accountType: "crypto_wallet",
    initialBalance: "0.10000000",
  });
  await accounts.createAccount({
    bookId: SEED_BOOK_ID,
    assetId: seedAssetId("USDT"),
    name: "USDT market path",
    accountType: "exchange",
    initialBalance: "100.000000",
  });
  await accounts.createAccount({
    bookId: SEED_BOOK_ID,
    assetId: customAssetId,
    name: "Artwork holding",
    accountType: "other",
    initialBalance: "1",
  });
  const ledger = new LedgerCommandService(context, runtime);
  await ledger.createIncome({
    accountId: cny,
    amount: "100.00",
    occurredAt: "2026-08-14T01:00:00.000Z",
    note: "Analytics income fixture",
  });
  await ledger.createExpense({
    accountId: cny,
    amount: "20.00",
    occurredAt: "2026-08-14T02:00:00.000Z",
    note: "Analytics expense fixture",
  });
  await accounts.setArchived(btc, true);
  await references.setAssetArchived(seedAssetId("BTC"), true);
} finally {
  context.close();
}
