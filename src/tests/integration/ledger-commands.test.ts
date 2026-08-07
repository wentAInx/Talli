import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { atomicFromDb, PersistenceIntegrityError } from "../../db/atomic";
import {
  findAccountById,
  findEntriesForEvent,
  findLedgerEventById,
  findTagIdsForEvent,
  insertLedgerEntries,
  insertSnapshot,
} from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import {
  SEED_BOOK_ID,
  SEED_CATEGORIES,
  SEED_TIMESTAMP,
  seedAssetId,
} from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ReconciliationService } from "../../services/reconciliation-service";
import type { ServiceRuntime } from "../../services/runtime";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("ledger command services", () => {
  let database: TestDatabase;
  let runtime: ServiceRuntime;
  let accounts: AccountService;
  let ledger: LedgerCommandService;
  let reconciliation: ReconciliationService;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
    runtime = deterministicRuntime();
    accounts = new AccountService(database.context, runtime);
    ledger = new LedgerCommandService(database.context, runtime);
    reconciliation = new ReconciliationService(database.context, runtime);
  });

  afterEach(() => {
    database.close();
  });

  async function createAccount(
    name: string,
    assetCode: string,
    initialBalance?: string,
  ): Promise<string> {
    return accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId(assetCode),
      name,
      accountType: "other",
      initialBalance,
    });
  }

  it("stores initial balance as a snapshot and never as income", async () => {
    const accountId = await createAccount(
      "Long precision ETH",
      "ETH",
      "1.000000000000000001",
    );

    const snapshot = database.context.sqlite
      .prepare(
        "select balance_atomic, as_of, note from balance_snapshots where account_id = ?",
      )
      .get(accountId);
    expect(snapshot).toEqual({
      balance_atomic: "1000000000000000001",
      as_of: "2026-08-01T00:00:00.000Z",
      note: "Initial balance",
    });
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from ledger_events")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rolls account creation back if the initial snapshot cannot be written", async () => {
    database.context.sqlite.exec(`
      create trigger fail_initial_snapshot
      before insert on balance_snapshots
      begin
        select raise(abort, 'forced initial snapshot failure');
      end;
    `);

    await expect(createAccount("Atomic account", "CNY", "100")).rejects.toThrow(
      "forced initial snapshot failure",
    );
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from accounts")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from balance_snapshots")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("changes an account asset only while the account has no history", async () => {
    const emptyAccount = await createAccount("Empty account", "CNY");
    await accounts.updateAccount(emptyAccount, {
      assetId: seedAssetId("USD"),
      name: "Empty account",
      accountType: "other",
    });
    expect(findAccountById(database.context.db, emptyAccount)?.assetId).toBe(
      seedAssetId("USD"),
    );

    const anchoredAccount = await createAccount(
      "Anchored account",
      "CNY",
      "0.00",
    );
    await expect(
      accounts.updateAccount(anchoredAccount, {
        assetId: seedAssetId("USD"),
        name: "Anchored account",
        accountType: "other",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_ASSET_LOCKED" });
    expect(findAccountById(database.context.db, anchoredAccount)?.assetId).toBe(
      seedAssetId("CNY"),
    );
  });

  it("persists expense, income, transfer fee, and exchange fee exactly", async () => {
    const cny = await createAccount("CNY cash", "CNY", "1000.00");
    const usd = await createAccount("USD cash", "USD", "200.00");
    const usdtA = await createAccount("USDT source", "USDT", "500.000000");
    const usdtB = await createAccount("USDT destination", "USDT", "0");
    const eth = await createAccount("ETH fees", "ETH", "1");
    const expenseCategory = SEED_CATEGORIES.find(
      (category) => category.name === "餐饮",
    )!.id;

    const expenseId = await ledger.createExpense({
      accountId: cny,
      amount: "35.80",
      occurredAt: "2026-08-02T10:00:00.000Z",
      categoryId: expenseCategory,
    });
    const incomeId = await ledger.createIncome({
      accountId: usd,
      amount: "100.00",
      occurredAt: "2026-08-02T11:00:00.000Z",
    });
    const transferId = await ledger.createTransfer({
      sourceAccountId: usdtA,
      destinationAccountId: usdtB,
      amount: "100",
      fee: { accountId: usdtA, amount: "0.5" },
      occurredAt: "2026-08-02T12:00:00.000Z",
    });
    const exchangeId = await ledger.createExchange({
      sourceAccountId: usdtB,
      sourceAmount: "100",
      destinationAccountId: usd,
      destinationAmount: "99.50",
      fee: { accountId: eth, amount: "0.01" },
      occurredAt: "2026-08-02T13:00:00.000Z",
    });

    expect(findEntriesForEvent(database.context.db, expenseId)).toMatchObject([
      { accountId: cny, entryRole: "main", amountAtomic: "-3580" },
    ]);
    expect(findEntriesForEvent(database.context.db, incomeId)).toMatchObject([
      { accountId: usd, entryRole: "main", amountAtomic: "10000" },
    ]);
    expect(findEntriesForEvent(database.context.db, transferId)).toMatchObject([
      {
        accountId: usdtA,
        entryRole: "source",
        amountAtomic: "-100000000",
      },
      {
        accountId: usdtB,
        entryRole: "destination",
        amountAtomic: "100000000",
      },
      { accountId: usdtA, entryRole: "fee", amountAtomic: "-500000" },
    ]);
    expect(findEntriesForEvent(database.context.db, exchangeId)).toMatchObject([
      {
        accountId: usdtB,
        entryRole: "source",
        amountAtomic: "-100000000",
      },
      { accountId: usd, entryRole: "destination", amountAtomic: "9950" },
      {
        accountId: eth,
        entryRole: "fee",
        amountAtomic: "-10000000000000000",
      },
    ]);
    expect(
      findEntriesForEvent(database.context.db, exchangeId).map((entry) =>
        atomicFromDb(entry.amountAtomic),
      ),
    ).toEqual([-100000000n, 9950n, -10000000000000000n]);
  });

  it("E-008 rolls event, entries, and tags back after a relation write fails", async () => {
    const source = await createAccount("Source", "USD", "100");
    const destination = await createAccount("Destination", "USD", "0");
    database.context.sqlite
      .prepare(
        `insert into tags (id, book_id, name, is_archived, created_at, updated_at)
         values ('tag-test', ?, 'test', 0, ?, ?)`,
      )
      .run(SEED_BOOK_ID, SEED_TIMESTAMP, SEED_TIMESTAMP);
    database.context.sqlite.exec(`
      create trigger fail_destination
      before insert on ledger_entries
      when new.entry_role = 'destination'
      begin
        select raise(abort, 'forced destination failure');
      end;
    `);

    await expect(
      ledger.createTransfer({
        sourceAccountId: source,
        destinationAccountId: destination,
        amount: "10",
        occurredAt: "2026-08-02T00:00:00.000Z",
        tagIds: ["tag-test"],
      }),
    ).rejects.toThrow("forced destination failure");

    expect(
      database.context.sqlite
        .prepare("select count(*) as count from ledger_events")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from ledger_entries")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from event_tags")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rejects invalid transfer and exchange account combinations at the service boundary", async () => {
    const usdA = await createAccount("USD A", "USD", "100");
    const usdB = await createAccount("USD B", "USD", "0");
    const usdt = await createAccount("USDT", "USDT", "100");

    await expect(
      ledger.createTransfer({
        sourceAccountId: usdA,
        destinationAccountId: usdt,
        amount: "10",
        occurredAt: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow();
    await expect(
      ledger.createExchange({
        sourceAccountId: usdA,
        sourceAmount: "10",
        destinationAccountId: usdB,
        destinationAmount: "9",
        occurredAt: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow();
    await expect(
      ledger.createTransfer({
        sourceAccountId: usdA,
        destinationAccountId: usdA,
        amount: "10",
        occurredAt: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow();
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from ledger_events")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rejects archived assets for new facts and missing accounts for balance reads", async () => {
    const account = await createAccount("Archived asset account", "CNY", "0");
    database.context.sqlite
      .prepare("update assets set is_archived = 1 where id = ?")
      .run(seedAssetId("CNY"));

    await expect(
      ledger.createExpense({
        accountId: account,
        amount: "1",
        occurredAt: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow("Archived assets");
    await expect(
      reconciliation.reconcile({
        accountId: account,
        actualBalance: "0",
        asOf: "2026-08-02T00:00:00.000Z",
      }),
    ).rejects.toThrow("Archived asset");
    await expect(
      reconciliation.balanceAt("missing-account", "2026-08-02T00:00:00.000Z"),
    ).rejects.toThrow("Account was not found");
  });

  it("guards every query-level atomic TEXT write", async () => {
    const account = await createAccount("Guarded account", "CNY", "0");
    const eventId = await ledger.createExpense({
      accountId: account,
      amount: "1",
      occurredAt: "2026-08-02T00:00:00.000Z",
    });

    expect(() =>
      insertLedgerEntries(database.context.db, [
        {
          id: "invalid-entry",
          eventId,
          accountId: account,
          entryRole: "main",
          amountAtomic: "1e2",
          createdAt: SEED_TIMESTAMP,
        },
      ]),
    ).toThrow(PersistenceIntegrityError);
    expect(() =>
      insertSnapshot(database.context.db, {
        id: "invalid-snapshot",
        accountId: account,
        asOf: "2026-08-03T00:00:00.000Z",
        balanceAtomic: "12.34",
        note: null,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      }),
    ).toThrow(PersistenceIntegrityError);
  });

  it("keeps the event id and original facts when an update fails", async () => {
    const source = await createAccount("Source", "USD", "100");
    const destination = await createAccount("Destination", "USD", "0");
    const eventId = await ledger.createExpense({
      accountId: source,
      amount: "5",
      occurredAt: "2026-08-02T00:00:00.000Z",
      note: "original",
    });
    database.context.sqlite.exec(`
      create trigger fail_destination_on_update
      before insert on ledger_entries
      when new.entry_role = 'destination'
      begin
        select raise(abort, 'forced update failure');
      end;
    `);

    await expect(
      ledger.updateEvent(eventId, {
        eventType: "transfer",
        input: {
          sourceAccountId: source,
          destinationAccountId: destination,
          amount: "10",
          occurredAt: "2026-08-03T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("forced update failure");

    expect(findLedgerEventById(database.context.db, eventId)).toMatchObject({
      id: eventId,
      eventType: "expense",
      occurredAt: "2026-08-02T00:00:00.000Z",
      note: "original",
    });
    expect(findEntriesForEvent(database.context.db, eventId)).toMatchObject([
      { accountId: source, entryRole: "main", amountAtomic: "-500" },
    ]);
    expect(findTagIdsForEvent(database.context.db, eventId)).toEqual([]);
  });

  it("deletes an event and its dependent rows by cascade", async () => {
    const account = await createAccount("Cash", "CNY", "100");
    database.context.sqlite
      .prepare(
        `insert into tags (id, book_id, name, is_archived, created_at, updated_at)
         values ('tag-delete', ?, 'delete', 0, ?, ?)`,
      )
      .run(SEED_BOOK_ID, SEED_TIMESTAMP, SEED_TIMESTAMP);
    const eventId = await ledger.createExpense({
      accountId: account,
      amount: "1",
      occurredAt: "2026-08-02T00:00:00.000Z",
      tagIds: ["tag-delete"],
    });

    await ledger.deleteEvent(eventId);

    expect(findLedgerEventById(database.context.db, eventId)).toBeUndefined();
    expect(findEntriesForEvent(database.context.db, eventId)).toEqual([]);
    expect(findTagIdsForEvent(database.context.db, eventId)).toEqual([]);
  });

  it("recomputes balances when snapshots are inserted or deleted", async () => {
    const account = await createAccount("Snapshot cash", "CNY", "100");
    await ledger.createExpense({
      accountId: account,
      amount: "20",
      occurredAt: "2026-08-02T00:00:00.000Z",
    });
    const snapshotId = await reconciliation.reconcile({
      accountId: account,
      actualBalance: "90",
      asOf: "2026-08-03T00:00:00.000Z",
    });
    await ledger.createExpense({
      accountId: account,
      amount: "10",
      occurredAt: "2026-08-04T00:00:00.000Z",
    });

    await expect(
      reconciliation.balanceAt(account, "2026-08-02T23:59:59.999Z"),
    ).resolves.toBe(8000n);
    await expect(
      reconciliation.balanceAt(account, "2026-08-04T23:59:59.999Z"),
    ).resolves.toBe(8000n);

    await reconciliation.delete(snapshotId);
    await expect(
      reconciliation.balanceAt(account, "2026-08-04T23:59:59.999Z"),
    ).resolves.toBe(7000n);
  });

  it("allows an existing snapshot to be corrected after its account is archived", async () => {
    const account = await createAccount("Archived history", "USD");
    const snapshotId = await reconciliation.reconcile({
      accountId: account,
      actualBalance: "10.00",
      asOf: "2026-08-02T10:00:00.000Z",
    });
    await accounts.setArchived(account, true);

    await expect(
      reconciliation.update(snapshotId, {
        actualBalance: "12.34",
        asOf: "2026-08-02T10:01:00.000Z",
        note: "Corrected archived history",
      }),
    ).resolves.toBeUndefined();
    expect(
      database.context.sqlite
        .prepare(
          "select balance_atomic, as_of, note from balance_snapshots where id = ?",
        )
        .get(snapshotId),
    ).toEqual({
      balance_atomic: "1234",
      as_of: "2026-08-02T10:01:00.000Z",
      note: "Corrected archived history",
    });
  });

  it("recomputes a balance when an event crosses a snapshot boundary", async () => {
    const account = await createAccount("Editable cash", "CNY", "100");
    await reconciliation.reconcile({
      accountId: account,
      actualBalance: "90",
      asOf: "2026-08-03T00:00:00.000Z",
    });
    const eventId = await ledger.createExpense({
      accountId: account,
      amount: "20",
      occurredAt: "2026-08-04T00:00:00.000Z",
    });
    await expect(
      reconciliation.balanceAt(account, "2026-08-05T00:00:00.000Z"),
    ).resolves.toBe(7000n);

    await ledger.updateEvent(eventId, {
      eventType: "expense",
      input: {
        accountId: account,
        amount: "20",
        occurredAt: "2026-08-02T00:00:00.000Z",
      },
    });

    await expect(
      reconciliation.balanceAt(account, "2026-08-05T00:00:00.000Z"),
    ).resolves.toBe(9000n);
  });
});
