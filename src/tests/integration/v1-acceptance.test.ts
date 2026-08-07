import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findLedgerEventById, findTagIdsForEvent } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, SEED_CATEGORIES, seedAssetId } from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { LedgerReadService } from "../../services/ledger-read-service";
import { ReconciliationService } from "../../services/reconciliation-service";
import { ReferenceDataService } from "../../services/reference-data-service";
import { ReportService } from "../../services/report-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("canonical V1 acceptance loop", () => {
  let database: TestDatabase;
  const runtime = deterministicRuntime("2026-08-01T00:00:00.000Z");

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
  });

  afterEach(() => {
    database.close();
  });

  it("connects T1-T4 balances, dashboard, reports, and reconciliation", async () => {
    const accounts = new AccountService(database.context, runtime);
    const ledger = new LedgerCommandService(database.context, runtime);
    const reconciliation = new ReconciliationService(database.context, runtime);
    const createAccount = (
      name: string,
      assetCode: string,
      initialBalance: string,
    ) =>
      accounts.createAccount({
        bookId: SEED_BOOK_ID,
        assetId: seedAssetId(assetCode),
        name,
        accountType: "other",
        initialBalance,
      });

    const alipay = await createAccount("支付宝 CNY", "CNY", "1000.00");
    const wise = await createAccount("Wise USD", "USD", "200.00");
    const usdCash = await createAccount("USD Cash", "USD", "0.00");
    const kraken = await createAccount("Kraken USDT", "USDT", "500.000000");
    await createAccount("Ledger BTC", "BTC", "0.01000000");
    const metamask = await createAccount(
      "MetaMask ETH",
      "ETH",
      "1.000000000000000000",
    );
    const dining = SEED_CATEGORIES.find(
      (category) => category.name === "餐饮",
    )!.id;

    await ledger.createExpense({
      accountId: alipay,
      amount: "35.80",
      categoryId: dining,
      occurredAt: "2026-08-02T10:00:00.000Z",
    });
    await ledger.createIncome({
      accountId: wise,
      amount: "100.00",
      occurredAt: "2026-08-02T11:00:00.000Z",
    });
    await ledger.createTransfer({
      sourceAccountId: wise,
      destinationAccountId: usdCash,
      amount: "50.00",
      occurredAt: "2026-08-02T12:00:00.000Z",
    });
    await ledger.createExchange({
      sourceAccountId: kraken,
      sourceAmount: "100.000000",
      destinationAccountId: wise,
      destinationAmount: "99.50",
      fee: { accountId: metamask, amount: "0.010000000000000000" },
      occurredAt: "2026-08-02T13:00:00.000Z",
    });

    const reads = new LedgerReadService(database.context);
    const dashboard = reads.getDashboard("2026-08-06T23:59:59.999Z");
    const groups = new Map(
      dashboard.assetGroups.map((group) => [group.asset.code, group]),
    );
    expect(groups.get("CNY")?.totalAtomic).toBe("96420");
    expect(groups.get("USD")).toMatchObject({
      totalAtomic: "39950",
      accounts: [
        { name: "USD Cash", balanceAtomic: "5000" },
        { name: "Wise USD", balanceAtomic: "34950" },
      ],
    });
    expect(groups.get("USDT")?.totalAtomic).toBe("400000000");
    expect(groups.get("BTC")?.totalAtomic).toBe("1000000");
    expect(groups.get("ETH")?.totalAtomic).toBe("990000000000000000");

    const report = new ReportService(database.context).monthlyIncomeExpense({
      bookId: SEED_BOOK_ID,
      month: "2026-08",
    });
    const reportByAsset = new Map(
      report.assets.map((bucket) => [bucket.asset.code, bucket]),
    );
    expect(reportByAsset.get("CNY")).toMatchObject({
      incomeAtomic: "0",
      expenseAtomic: "3580",
    });
    expect(reportByAsset.get("USD")).toMatchObject({
      incomeAtomic: "10000",
      expenseAtomic: "0",
    });
    expect(reportByAsset.get("ETH")).toMatchObject({
      incomeAtomic: "0",
      expenseAtomic: "10000000000000000",
    });
    expect(reportByAsset.has("USDT")).toBe(false);

    await reconciliation.reconcile({
      accountId: wise,
      actualBalance: "350.00",
      asOf: "2026-08-07T10:00:00.000Z",
    });
    await ledger.createExpense({
      accountId: wise,
      amount: "20.00",
      occurredAt: "2026-08-01T12:00:00.000Z",
    });
    await expect(
      reconciliation.balanceAt(wise, "2026-08-07T12:00:00.000Z"),
    ).resolves.toBe(35000n);
    await ledger.createExpense({
      accountId: wise,
      amount: "10.00",
      occurredAt: "2026-08-08T12:00:00.000Z",
    });
    await expect(
      reconciliation.balanceAt(wise, "2026-08-08T13:00:00.000Z"),
    ).resolves.toBe(34000n);
  });

  it("preserves only an event's existing archived category and tags", async () => {
    const accounts = new AccountService(database.context, runtime);
    const ledger = new LedgerCommandService(database.context, runtime);
    const references = new ReferenceDataService(database.context, runtime);
    const reads = new LedgerReadService(database.context);
    const accountId = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "Archived reference account",
      accountType: "cash",
    });
    const categoryId = SEED_CATEGORIES.find(
      (category) => category.name === "餐饮",
    )!.id;
    const tagId = await references.createTag(SEED_BOOK_ID, "历史标签");
    const eventId = await ledger.createExpense({
      accountId,
      amount: "1.00",
      occurredAt: "2026-08-02T00:00:00.000Z",
      categoryId,
      tagIds: [tagId],
    });
    await references.setCategoryArchived(categoryId, true);
    await references.setTagArchived(tagId, true);

    const event = reads.getEvent(eventId);
    const editReferences = reads.getReferenceData("2026-08-03T00:00:00.000Z", {
      categoryIds: [categoryId],
      tagIds: [tagId],
    });
    expect(editReferences.categories).toContainEqual(
      expect.objectContaining({ id: categoryId, isArchived: true }),
    );
    expect(editReferences.tags).toContainEqual(
      expect.objectContaining({ id: tagId, isArchived: true }),
    );

    await ledger.updateEvent(eventId, {
      eventType: "expense",
      input: {
        accountId,
        amount: "2.00",
        occurredAt: event.occurredAt,
        categoryId,
        tagIds: [tagId],
      },
    });
    expect(findLedgerEventById(database.context.db, eventId)?.categoryId).toBe(
      categoryId,
    );
    expect(findTagIdsForEvent(database.context.db, eventId)).toEqual([tagId]);

    await expect(
      ledger.createExpense({
        accountId,
        amount: "1.00",
        occurredAt: "2026-08-03T00:00:00.000Z",
        categoryId,
        tagIds: [tagId],
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_ARCHIVED" });
  });
});
