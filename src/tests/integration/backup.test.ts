import { afterEach, describe, expect, it } from "vitest";

import { readBackupData } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { BackupValidationError } from "../../domain/backup";
import { AccountService } from "../../services/account-service";
import {
  BackupService,
  RestoreTargetError,
} from "../../services/backup-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ReconciliationService } from "../../services/reconciliation-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("lossless backup and guarded restore", () => {
  const databases: TestDatabase[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.close();
    }
  });

  async function sourceFixture() {
    const database = createTestDatabase();
    databases.push(database);
    seedDatabase(database.context);
    const runtime = deterministicRuntime("2026-08-07T10:00:00.000Z");
    const accounts = new AccountService(database.context, runtime);
    const ledger = new LedgerCommandService(database.context, runtime);
    const eth = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("ETH"),
      name: "Exact ETH",
      accountType: "crypto_wallet",
      initialBalance: "2.000000000000000001",
    });
    const cny = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "CNY cash",
      accountType: "cash",
      initialBalance: "100.00",
    });
    await ledger.createIncome({
      accountId: eth,
      amount: "1.000000000000000001",
      occurredAt: "2026-08-08T00:00:00.000Z",
      note: "exact bigint",
    });
    await ledger.createExpense({
      accountId: cny,
      amount: "35.80",
      occurredAt: "2026-08-08T01:00:00.000Z",
    });
    return { database, eth, cny };
  }

  it("D-001 exports IDs, timestamps, and atomic values as exact strings", async () => {
    const source = await sourceFixture();
    const service = new BackupService(
      source.database.context,
      deterministicRuntime("2026-08-09T00:00:00.000Z"),
    );
    const payload = service.exportBackup();
    const json = JSON.stringify(payload);

    expect(payload.schemaVersion).toBe(4);
    expect(json).toContain('"amountAtomic":"1000000000000000001"');
    expect(json).toContain('"balanceAtomic":"2000000000000000001"');
    expect(json).toContain('"occurredAt":"2026-08-08T00:00:00.000Z"');
    expect(json).not.toContain('"amount":1');
    const csv = service.exportCsv();
    expect(csv).toContain("1000000000000000001");
    expect(csv).toContain("1.000000000000000001");
  });

  it.each([false, true])(
    "D-002 restores exactly into an %s target",
    async (seedTarget) => {
      const source = await sourceFixture();
      const payload = new BackupService(source.database.context).exportBackup();
      const target = createTestDatabase();
      databases.push(target);
      if (seedTarget) {
        seedDatabase(target.context);
      }

      const preview = new BackupService(target.context).previewRestore(payload);
      expect(preview.target).toBe(seedTarget ? "seed-only" : "empty");
      new BackupService(target.context).restore(payload);

      expect(readBackupData(target.context.db)).toEqual(
        readBackupData(source.database.context.db),
      );
      const balance = await new ReconciliationService(target.context).balanceAt(
        source.eth,
        "2026-08-10T00:00:00.000Z",
      );
      expect(balance).toBe(3000000000000000002n);
      expect(target.context.sqlite.pragma("foreign_key_check")).toEqual([]);
    },
  );

  it("D-003 rejects a non-empty target without changing it", async () => {
    const source = await sourceFixture();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    seedDatabase(target.context);
    await new AccountService(
      target.context,
      deterministicRuntime(),
    ).createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("USD"),
      name: "Existing user account",
      accountType: "bank",
    });
    const before = readBackupData(target.context.db);

    expect(() => new BackupService(target.context).restore(payload)).toThrow(
      RestoreTargetError,
    );
    expect(readBackupData(target.context.db)).toEqual(before);
  });

  it("D-004 rejects a wrong schema version before writing any row", async () => {
    const source = await sourceFixture();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    const invalid = { ...payload, schemaVersion: 5 };

    expect(() => new BackupService(target.context).restore(invalid)).toThrow(
      BackupValidationError,
    );
    const invalidTimeZone = {
      ...payload,
      data: {
        ...payload.data,
        settings: [
          {
            key: "app_timezone",
            valueJson: JSON.stringify("Mars/Olympus_Mons"),
            updatedAt: "2026-08-09T00:00:00.000Z",
          },
        ],
      },
    };
    expect(() =>
      new BackupService(target.context).restore(invalidTimeZone),
    ).toThrow(BackupValidationError);
    expect(readBackupData(target.context.db).books).toEqual([]);
  });

  it("rolls the entire restore back after a mid-transaction database failure", async () => {
    const source = await sourceFixture();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    target.context.sqlite.exec(`
      create trigger fail_restore_account
      before insert on accounts
      begin
        select raise(abort, 'forced restore failure');
      end;
    `);

    expect(() => new BackupService(target.context).restore(payload)).toThrow(
      "forced restore failure",
    );
    const restored = readBackupData(target.context.db);
    expect(restored.books).toEqual([]);
    expect(restored.assets).toEqual([]);
    expect(restored.accounts).toEqual([]);
  });
});
