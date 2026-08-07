import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ReconciliationService } from "../../services/reconciliation-service";
import type { ServiceRuntime } from "../../services/runtime";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("file-backed balance acceptance matrix", () => {
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

  function createCnyAccount(initialBalance?: string): Promise<string> {
    return accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "Balance acceptance",
      accountType: "cash",
      initialBalance,
    });
  }

  it("B-001 sums the full history when no snapshot exists", async () => {
    const accountId = await createCnyAccount();
    await ledger.createIncome({
      accountId,
      amount: "100",
      occurredAt: "2026-08-01T10:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "20",
      occurredAt: "2026-08-02T10:00:00.000Z",
    });
    await ledger.createIncome({
      accountId,
      amount: "50",
      occurredAt: "2026-08-04T10:00:00.000Z",
    });

    await expect(
      reconciliation.balanceAt(accountId, "2026-08-03T00:00:00.000Z"),
    ).resolves.toBe(8000n);
  });

  it("B-002 excludes backfilled history before the snapshot", async () => {
    const accountId = await createCnyAccount();
    await reconciliation.reconcile({
      accountId,
      actualBalance: "5",
      asOf: "2026-08-07T10:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "20",
      occurredAt: "2026-08-01T10:00:00.000Z",
    });

    await expect(
      reconciliation.balanceAt(accountId, "2026-08-07T12:00:00.000Z"),
    ).resolves.toBe(500n);
  });

  it("B-003 includes entries strictly after the snapshot", async () => {
    const accountId = await createCnyAccount();
    await reconciliation.reconcile({
      accountId,
      actualBalance: "5",
      asOf: "2026-08-07T10:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "0.20",
      occurredAt: "2026-08-08T10:00:00.000Z",
    });

    await expect(
      reconciliation.balanceAt(accountId, "2026-08-08T23:59:59.999Z"),
    ).resolves.toBe(480n);
  });

  it("B-004 does not double count an entry at the snapshot instant", async () => {
    const accountId = await createCnyAccount();
    await ledger.createExpense({
      accountId,
      amount: "0.20",
      occurredAt: "2026-08-07T10:00:00.000Z",
    });
    await reconciliation.reconcile({
      accountId,
      actualBalance: "5",
      asOf: "2026-08-07T10:00:00.000Z",
    });

    await expect(
      reconciliation.balanceAt(accountId, "2026-08-07T12:00:00.000Z"),
    ).resolves.toBe(500n);
  });

  it("B-005 selects the latest snapshot at or before each query", async () => {
    const accountId = await createCnyAccount();
    await reconciliation.reconcile({
      accountId,
      actualBalance: "1.00",
      asOf: "2026-08-01T00:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "0.20",
      occurredAt: "2026-08-02T00:00:00.000Z",
    });
    await reconciliation.reconcile({
      accountId,
      actualBalance: "0.90",
      asOf: "2026-08-03T00:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "0.10",
      occurredAt: "2026-08-04T00:00:00.000Z",
    });

    await expect(
      reconciliation.balanceAt(accountId, "2026-08-02T23:59:59.999Z"),
    ).resolves.toBe(80n);
    await expect(
      reconciliation.balanceAt(accountId, "2026-08-03T12:00:00.000Z"),
    ).resolves.toBe(90n);
    await expect(
      reconciliation.balanceAt(accountId, "2026-08-04T23:59:59.999Z"),
    ).resolves.toBe(80n);
  });

  it("B-006 recomputes in both directions when an event crosses a snapshot", async () => {
    const accountId = await createCnyAccount();
    await reconciliation.reconcile({
      accountId,
      actualBalance: "0.90",
      asOf: "2026-08-03T00:00:00.000Z",
    });
    const eventId = await ledger.createExpense({
      accountId,
      amount: "0.20",
      occurredAt: "2026-08-04T00:00:00.000Z",
    });
    const queryTime = "2026-08-05T00:00:00.000Z";
    await expect(reconciliation.balanceAt(accountId, queryTime)).resolves.toBe(
      70n,
    );

    await ledger.updateEvent(eventId, {
      eventType: "expense",
      input: {
        accountId,
        amount: "0.20",
        occurredAt: "2026-08-02T00:00:00.000Z",
      },
    });
    await expect(reconciliation.balanceAt(accountId, queryTime)).resolves.toBe(
      90n,
    );

    await ledger.updateEvent(eventId, {
      eventType: "expense",
      input: {
        accountId,
        amount: "0.20",
        occurredAt: "2026-08-04T00:00:00.000Z",
      },
    });
    await expect(reconciliation.balanceAt(accountId, queryTime)).resolves.toBe(
      70n,
    );
  });

  it("B-007 falls back to the prior snapshot after deleting the latest", async () => {
    const accountId = await createCnyAccount();
    await reconciliation.reconcile({
      accountId,
      actualBalance: "1.00",
      asOf: "2026-08-01T00:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "0.20",
      occurredAt: "2026-08-02T00:00:00.000Z",
    });
    const latestSnapshot = await reconciliation.reconcile({
      accountId,
      actualBalance: "0.90",
      asOf: "2026-08-03T00:00:00.000Z",
    });
    await ledger.createExpense({
      accountId,
      amount: "0.10",
      occurredAt: "2026-08-04T00:00:00.000Z",
    });
    await reconciliation.delete(latestSnapshot);

    await expect(
      reconciliation.balanceAt(accountId, "2026-08-04T23:59:59.999Z"),
    ).resolves.toBe(70n);
  });
});
