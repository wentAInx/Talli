import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import {
  SEED_BOOK_ID,
  SEED_CATEGORIES,
  SEED_TIMESTAMP,
  seedAssetId,
} from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { LedgerReadService } from "../../services/ledger-read-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("transaction filtering and keyset pagination", () => {
  let database: TestDatabase;
  let accounts: AccountService;
  let ledger: LedgerCommandService;
  let reads: LedgerReadService;
  let cny: string;
  let usd: string;
  let usdtSource: string;
  let usdtDestination: string;
  let eth: string;
  let expenseId: string;
  let incomeId: string;
  let transferId: string;
  let exchangeId: string;

  beforeEach(async () => {
    database = createTestDatabase();
    seedDatabase(database.context);
    const runtime = deterministicRuntime("2026-08-07T08:00:00.000Z");
    accounts = new AccountService(database.context, runtime);
    ledger = new LedgerCommandService(database.context, runtime);
    reads = new LedgerReadService(database.context);

    const createAccount = (name: string, assetCode: string) =>
      accounts.createAccount({
        bookId: SEED_BOOK_ID,
        assetId: seedAssetId(assetCode),
        name,
        accountType: "other",
        initialBalance: "1000",
      });
    cny = await createAccount("现金 % 储备", "CNY");
    usd = await createAccount("Wise USD", "USD");
    usdtSource = await createAccount("Kraken USDT", "USDT");
    usdtDestination = await createAccount("冷钱包 USDT", "USDT");
    eth = await createAccount("MetaMask Gas", "ETH");

    database.context.sqlite
      .prepare(
        `insert into tags (id, book_id, name, is_archived, created_at, updated_at)
         values ('tag-business', ?, '差旅', 0, ?, ?)`,
      )
      .run(SEED_BOOK_ID, SEED_TIMESTAMP, SEED_TIMESTAMP);
    const diningCategory = SEED_CATEGORIES.find(
      (category) => category.name === "餐饮",
    )!.id;

    expenseId = await ledger.createExpense({
      accountId: cny,
      amount: "35.80",
      occurredAt: "2026-08-07T10:00:00.000Z",
      categoryId: diningCategory,
      payee: "便利店",
      note: "早餐",
      tagIds: ["tag-business"],
    });
    incomeId = await ledger.createIncome({
      accountId: usd,
      amount: "100",
      occurredAt: "2026-08-07T10:00:00.000Z",
      payee: "Client Alpha",
    });
    transferId = await ledger.createTransfer({
      sourceAccountId: usdtSource,
      destinationAccountId: usdtDestination,
      amount: "100",
      fee: { accountId: usdtSource, amount: "0.5" },
      occurredAt: "2026-08-07T10:00:00.000Z",
      note: "Treasury move",
    });
    exchangeId = await ledger.createExchange({
      sourceAccountId: usdtDestination,
      sourceAmount: "100",
      destinationAccountId: usd,
      destinationAmount: "99.50",
      fee: { accountId: eth, amount: "0.01" },
      occurredAt: "2026-08-08T00:00:00.000Z",
      note: "Wallet swap",
    });
  });

  afterEach(() => {
    database.close();
  });

  it("paginates timestamp ties without duplicates or omissions", () => {
    const first = reads.listEventPage({ limit: 2 });
    expect(first.events.map((event) => event.id)).toEqual([
      exchangeId,
      transferId,
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = reads.listEventPage({
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.events.map((event) => event.id)).toEqual([
      incomeId,
      expenseId,
    ]);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.events, ...second.events].map((event) => event.id))
        .size,
    ).toBe(4);
  });

  it("filters logical events through every entry, category, tag, and text relation", () => {
    expect(
      reads
        .listEventPage({ assetId: seedAssetId("ETH") })
        .events.map((event) => event.id),
    ).toEqual([exchangeId]);
    expect(
      reads
        .listEventPage({ accountId: usdtSource })
        .events.map((event) => event.id),
    ).toEqual([transferId]);
    expect(
      reads
        .listEventPage({ tagId: "tag-business" })
        .events.map((event) => event.id),
    ).toEqual([expenseId]);
    expect(
      reads
        .listEventPage({
          categoryId: SEED_CATEGORIES.find(
            (category) => category.name === "餐饮",
          )!.id,
        })
        .events.map((event) => event.id),
    ).toEqual([expenseId]);

    for (const query of ["便利店", "早餐", "餐饮", "MetaMask", "ETH", "差旅"]) {
      expect(
        reads.listEventPage({ query }).events.map((event) => event.id),
      ).toContain(
        query === "MetaMask" || query === "ETH" ? exchangeId : expenseId,
      );
    }
    expect(
      reads.listEventPage({ query: "%" }).events.map((event) => event.id),
    ).toEqual([expenseId]);
  });

  it("uses a half-open UTC range and rejects untrusted cursors", () => {
    expect(
      reads
        .listEventPage({
          startInclusive: "2026-08-07T10:00:00.000Z",
          endExclusive: "2026-08-08T00:00:00.000Z",
          eventType: "income",
        })
        .events.map((event) => event.id),
    ).toEqual([incomeId]);
    expect(() => reads.listEventPage({ cursor: "not-a-cursor" })).toThrowError(
      expect.objectContaining({ code: "INVALID_EVENT_CURSOR" }),
    );
  });
});
