import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, SEED_CATEGORIES, seedAssetId } from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ReportService } from "../../services/report-service";
import { SettingsService } from "../../services/settings-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("monthly native-asset reports", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
  });

  afterEach(() => {
    database.close();
  });

  it("uses app-timezone month bounds and excludes transfer/exchange principal", async () => {
    const runtime = deterministicRuntime("2026-07-01T00:00:00.000Z");
    const accounts = new AccountService(database.context, runtime);
    const ledger = new LedgerCommandService(database.context, runtime);
    await new SettingsService(database.context, runtime).setTimeZone(
      "Asia/Shanghai",
    );
    const createAccount = (name: string, assetCode: string) =>
      accounts.createAccount({
        bookId: SEED_BOOK_ID,
        assetId: seedAssetId(assetCode),
        name,
        accountType: "other",
        initialBalance: "1000",
      });
    const cny = await createAccount("CNY", "CNY");
    const usd = await createAccount("USD", "USD");
    const usdtA = await createAccount("USDT A", "USDT");
    const usdtB = await createAccount("USDT B", "USDT");
    const eth = await createAccount("ETH gas", "ETH");
    const diningCategory = SEED_CATEGORIES.find(
      (category) => category.name === "餐饮",
    )!.id;

    await ledger.createExpense({
      accountId: cny,
      amount: "1",
      occurredAt: "2026-07-31T15:59:59.999Z",
      categoryId: diningCategory,
    });
    await ledger.createExpense({
      accountId: cny,
      amount: "10",
      occurredAt: "2026-07-31T16:00:00.000Z",
      categoryId: diningCategory,
    });
    await ledger.createIncome({
      accountId: usd,
      amount: "100",
      occurredAt: "2026-08-31T15:59:59.999Z",
    });
    await ledger.createExpense({
      accountId: cny,
      amount: "2",
      occurredAt: "2026-08-31T16:00:00.000Z",
      categoryId: diningCategory,
    });
    await ledger.createTransfer({
      sourceAccountId: usdtA,
      destinationAccountId: usdtB,
      amount: "100",
      fee: { accountId: usdtA, amount: "0.5" },
      occurredAt: "2026-08-10T12:00:00.000Z",
    });
    await ledger.createExchange({
      sourceAccountId: usdtB,
      sourceAmount: "100",
      destinationAccountId: usd,
      destinationAmount: "99.50",
      fee: { accountId: eth, amount: "0.01" },
      occurredAt: "2026-08-11T12:00:00.000Z",
    });

    const report = new ReportService(database.context).monthlyIncomeExpense({
      bookId: SEED_BOOK_ID,
      month: "2026-08",
    });
    expect(report).toMatchObject({
      timeZone: "Asia/Shanghai",
      startInclusive: "2026-07-31T16:00:00.000Z",
      endExclusive: "2026-08-31T16:00:00.000Z",
    });
    const buckets = new Map(
      report.assets.map((asset) => [asset.asset.code, asset]),
    );
    expect(buckets.get("CNY")).toMatchObject({
      incomeAtomic: "0",
      expenseAtomic: "1000",
      categories: [
        {
          name: "餐饮",
          incomeAtomic: "0",
          expenseAtomic: "1000",
        },
      ],
    });
    expect(buckets.get("USD")).toMatchObject({
      incomeAtomic: "10000",
      expenseAtomic: "0",
    });
    expect(buckets.get("USDT")).toMatchObject({
      incomeAtomic: "0",
      expenseAtomic: "500000",
      categories: [{ name: "手续费", expenseAtomic: "500000" }],
    });
    expect(buckets.get("ETH")).toMatchObject({
      incomeAtomic: "0",
      expenseAtomic: "10000000000000000",
      categories: [{ name: "手续费", expenseAtomic: "10000000000000000" }],
    });
    expect(report.assets).toHaveLength(4);
  });
});
