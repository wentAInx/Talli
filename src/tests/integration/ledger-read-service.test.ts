import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { LedgerReadService } from "../../services/ledger-read-service";
import type { ServiceRuntime } from "../../services/runtime";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("ledger UI read service", () => {
  let database: TestDatabase;
  let runtime: ServiceRuntime;
  let accounts: AccountService;
  let ledger: LedgerCommandService;
  let reads: LedgerReadService;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
    runtime = deterministicRuntime("2026-08-07T10:00:00.000Z");
    accounts = new AccountService(database.context, runtime);
    ledger = new LedgerCommandService(database.context, runtime);
    reads = new LedgerReadService(database.context);
  });

  afterEach(() => {
    database.close();
  });

  it("groups exact current balances by asset and excludes archived accounts", async () => {
    const cny = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "支付宝",
      accountType: "ewallet",
      initialBalance: "1000.00",
    });
    const archivedUsd = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USD"),
      name: "旧美元账户",
      accountType: "bank",
      initialBalance: "200.00",
    });
    await accounts.setArchived(archivedUsd, true);
    const eventId = await ledger.createExpense({
      accountId: cny,
      amount: "35.80",
      occurredAt: "2026-08-07T10:30:00.000Z",
      payee: "便利店",
    });

    const dashboard = reads.getDashboard("2026-08-07T11:00:00.000Z");
    expect(dashboard.activeAccountCount).toBe(1);
    expect(dashboard.assetCount).toBe(1);
    expect(dashboard.assetGroups).toMatchObject([
      {
        asset: { code: "CNY", scale: 2 },
        totalAtomic: "96420",
        totalDisplay: "¥964.20 CNY",
        accounts: [{ id: cny, balanceAtomic: "96420" }],
      },
    ]);
    expect(dashboard.recentEvents).toMatchObject([
      {
        id: eventId,
        type: "expense",
        title: "便利店",
        entries: [
          {
            role: "main",
            amountAtomic: "-3580",
            amountDisplay: "-¥35.80 CNY",
          },
        ],
      },
    ]);
    expect(reads.listAccounts("2026-08-07T11:00:00.000Z")).toHaveLength(2);
  });

  it("returns logical exchange legs and ordered snapshot history without floats", async () => {
    const usdt = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USDT"),
      name: "Kraken USDT",
      accountType: "exchange",
      initialBalance: "500.000000",
    });
    const usd = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USD"),
      name: "Wise USD",
      accountType: "bank",
      initialBalance: "200.00",
    });
    const exchangeId = await ledger.createExchange({
      sourceAccountId: usdt,
      sourceAmount: "100.000000",
      destinationAccountId: usd,
      destinationAmount: "99.50",
      occurredAt: "2026-08-07T10:30:00.000Z",
    });

    const event = reads.getEvent(exchangeId);
    expect(event.entries).toMatchObject([
      {
        role: "source",
        asset: { code: "USDT" },
        amountInput: "100.000000",
      },
      {
        role: "destination",
        asset: { code: "USD" },
        amountInput: "99.50",
      },
    ]);
    const detail = reads.getAccountDetail(usdt, "2026-08-07T11:00:00.000Z");
    expect(detail.account.balanceAtomic).toBe("400000000");
    expect(detail.snapshots).toMatchObject([
      {
        asOf: "2026-08-07T10:00:00.000Z",
        balanceAtomic: "500000000",
        balanceInput: "500.000000",
      },
    ]);
    expect(detail.recentEvents[0].id).toBe(exchangeId);
  });
});
