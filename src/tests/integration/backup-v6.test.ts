import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { insertAccount, readBackupData } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import type { CsvImportConfig } from "../../domain/file-import";
import { BackupValidationError, type BackupPayload } from "../../domain/backup";
import { BackupService } from "../../services/backup-service";
import { ExternalImportService } from "../../services/external-import-service";
import { FileImportService } from "../../services/file-import-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import {
  createTestDatabase,
  deterministicRuntime,
  type TestDatabase,
} from "./test-database";

const CSV_CONFIG: CsvImportConfig = {
  hasHeader: true,
  encoding: "utf-8",
  delimiter: ",",
  dateColumn: "Date",
  dateFormat: "YYYY-MM-DD",
  timeColumn: null,
  timeFormat: null,
  amountMode: { kind: "signed", amountColumn: "Amount" },
  decimalSeparator: ".",
  thousandsSeparator: null,
  invertSign: false,
  idColumn: "ID",
  payeeColumn: "Payee",
  memoColumn: "Memo",
  currencyColumn: "Currency",
  timezone: "Asia/Shanghai",
};

function fileCandidateRecords(
  payload: BackupPayload,
  stableKey = "file:csv:id:backup-match",
) {
  const candidate = payload.data.externalTransactionCandidates.find(
    (row) => row.stableKey === stableKey,
  )!;
  const sourceLink = payload.data.externalCandidateSourceObjects.find(
    (row) => row.candidateId === candidate.id && row.relation === "primary",
  )!;
  const source = payload.data.externalSourceObjects.find(
    (row) => row.id === sourceLink.sourceObjectId,
  )!;
  const leg = payload.data.externalTransactionLegs.find(
    (row) => row.candidateId === candidate.id,
  )!;
  return { candidate, source, leg };
}

function rehashFileSourceBinding(
  candidate: BackupPayload["data"]["externalTransactionCandidates"][number],
  source: BackupPayload["data"]["externalSourceObjects"][number],
): void {
  source.payloadHash = createHash("sha256")
    .update(source.payloadJson)
    .digest("hex");
  candidate.sourceFingerprint = createHash("sha256")
    .update(`file_transaction:${source.externalId}:${source.payloadHash}`)
    .digest("hex");
}

describe("Backup schemaVersion 6 file-import provenance", () => {
  const databases: TestDatabase[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  async function sourceFixture() {
    const database = createTestDatabase();
    databases.push(database);
    seedDatabase(database.context);
    const now = "2026-08-13T12:00:00.000Z";
    insertAccount(database.context.db, {
      id: "backup-v6-usd",
      bookId: "seed-book-default",
      assetId: "seed-asset-usd",
      name: "Backup statement account",
      accountType: "bank",
      institutionName: "Example Bank",
      note: null,
      isArchived: false,
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    });
    const runtime = deterministicRuntime(now);
    const files = new FileImportService(database.context, runtime);
    const csvConnection = await files.createProfile({
      bookId: "seed-book-default",
      targetAccountId: "backup-v6-usd",
      name: "Backup CSV",
      format: "csv",
      parserConfig: CSV_CONFIG,
      confirmed: true,
    });
    const csv = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-10,-35.00,backup-match,Starbucks,Store 123,USD",
    ].join("\n");
    await files.commit({
      connectionId: csvConnection,
      bytes: new TextEncoder().encode(csv),
      filename: "statement.csv",
      confirmed: true,
    });
    const eventId = await new LedgerCommandService(
      database.context,
      runtime,
    ).createExpense({
      accountId: "backup-v6-usd",
      amount: "35.00",
      occurredAt: "2026-08-10T04:00:00.000Z",
      payee: "Manual Starbucks",
    });
    const candidateId = (
      database.context.sqlite
        .prepare(
          "select id from external_transaction_candidates where stable_key = 'file:csv:id:backup-match'",
        )
        .get() as { id: string }
    ).id;
    await files.matchExisting({
      candidateId,
      ledgerEventId: eventId,
      confirmed: true,
    });

    const ofxConnection = await files.createProfile({
      bookId: "seed-book-default",
      targetAccountId: "backup-v6-usd",
      name: "Backup OFX",
      format: "ofx",
      parserConfig: { timezoneForDateOnly: "America/New_York" },
      confirmed: true,
    });
    const fixture = readFileSync(
      join(
        process.cwd(),
        "docs/v5-financial-file-import/fixtures/sample_bank_ofx1.ofx",
      ),
    );
    await files.commit({
      connectionId: ofxConnection,
      bytes: fixture,
      filename: "sample_bank_ofx1.ofx",
      confirmed: true,
      confirmedStatementIdentity: true,
    });
    return database;
  }

  it("exports and restores all file/match facts without raw file or full account number", async () => {
    const source = await sourceFixture();
    const payload = new BackupService(
      source.context,
      deterministicRuntime("2026-08-14T00:00:00.000Z"),
    ).exportBackup();
    const json = JSON.stringify(payload);
    expect(payload.schemaVersion).toBe(8);
    expect(payload.data.fileImportProfiles).toHaveLength(2);
    expect(payload.data.fileImportBatches).toHaveLength(2);
    expect(payload.data.fileImportSourceDetails).toHaveLength(3);
    expect(payload.data.fileImportCandidateDetails).toHaveLength(3);
    expect(payload.data.externalCandidateMatchLinks).toHaveLength(1);
    expect(payload.data.fileImportBalanceObservationDetails).toHaveLength(1);
    expect(json).not.toContain("123456789");
    expect(json).not.toContain("OFXHEADER:100");
    expect(json).not.toContain("rawFile");

    const target = createTestDatabase();
    databases.push(target);
    new BackupService(target.context).restore(payload);
    expect(readBackupData(target.context.db)).toEqual(
      readBackupData(source.context.db),
    );
    expect(target.context.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("rejects a candidate leg amount that differs from its valid source payload", async () => {
    const source = await sourceFixture();
    const tampered = structuredClone(
      new BackupService(source.context).exportBackup(),
    );
    const { leg } = fileCandidateRecords(tampered);
    leg.amountText = "-36.00";
    leg.amountAtomic = "-3600";
    const target = createTestDatabase();
    databases.push(target);
    expect(() =>
      new BackupService(target.context).previewRestore(tampered),
    ).toThrow(BackupValidationError);
  });

  it("rejects a rehashed source signed amount when its candidate leg remains unchanged", async () => {
    const source = await sourceFixture();
    const tampered = structuredClone(
      new BackupService(source.context).exportBackup(),
    );
    const { candidate, source: sourceObject } = fileCandidateRecords(tampered);
    const sourcePayload = JSON.parse(sourceObject.payloadJson) as {
      signedAmountText: string;
    };
    sourcePayload.signedAmountText = "-36.00";
    sourceObject.payloadJson = JSON.stringify(sourcePayload);
    rehashFileSourceBinding(candidate, sourceObject);
    const target = createTestDatabase();
    databases.push(target);
    expect(() =>
      new BackupService(target.context).previewRestore(tampered),
    ).toThrow(BackupValidationError);
  });

  it("rejects a rehashed selected amount that differs from the top-level source amount", async () => {
    const source = await sourceFixture();
    const tampered = structuredClone(
      new BackupService(source.context).exportBackup(),
    );
    const { candidate, source: sourceObject } = fileCandidateRecords(tampered);
    const sourcePayload = JSON.parse(sourceObject.payloadJson) as {
      selectedFields: { amount: string };
    };
    sourcePayload.selectedFields.amount = "-36.00";
    sourceObject.payloadJson = JSON.stringify(sourcePayload);
    rehashFileSourceBinding(candidate, sourceObject);
    const target = createTestDatabase();
    databases.push(target);
    expect(() =>
      new BackupService(target.context).previewRestore(tampered),
    ).toThrow(BackupValidationError);
  });

  it("upgrades a schemaVersion 5 backup through empty V6 and V7 arrays", () => {
    const source = createTestDatabase();
    databases.push(source);
    seedDatabase(source.context);
    const v6 = new BackupService(source.context).exportBackup();
    const {
      fileImportProfiles: _profiles,
      fileImportBatches: _batches,
      fileImportSourceDetails: _sources,
      fileImportBatchSourceObjects: _batchSources,
      fileImportCandidateDetails: _candidates,
      externalCandidateMatchLinks: _matches,
      fileImportBalanceObservationDetails: _balances,
      automationRules: _rules,
      automationRuleConditions: _ruleConditions,
      automationRuleActions: _ruleActions,
      recurringItems: _recurringItems,
      recurringItemTags: _recurringTags,
      recurringOccurrenceLinks: _recurringLinks,
      recurringOccurrenceSkips: _recurringSkips,
      historicalManualQuotes: _historicalManualQuotes,
      ...v5Data
    } = v6.data;
    expect([
      _profiles,
      _batches,
      _sources,
      _batchSources,
      _candidates,
      _matches,
      _balances,
      _rules,
      _ruleConditions,
      _ruleActions,
      _recurringItems,
      _recurringTags,
      _recurringLinks,
      _recurringSkips,
      _historicalManualQuotes,
    ]).toEqual([[], [], [], [], [], [], [], [], [], [], [], [], [], [], []]);
    const target = createTestDatabase();
    databases.push(target);
    const preview = new BackupService(target.context).previewRestore({
      ...v6,
      schemaVersion: 5,
      data: v5Data,
    });
    expect(preview.schemaVersion).toBe(8);
    const parsed = new BackupService(target.context).parseJson(
      JSON.stringify({ ...v6, schemaVersion: 5, data: v5Data }),
    );
    expect(parsed.data.fileImportProfiles).toEqual([]);
    expect(parsed.data.externalCandidateMatchLinks).toEqual([]);
    expect(parsed.data.automationRules).toEqual([]);
    expect(parsed.data.recurringItems).toEqual([]);
  });

  it("rejects injected account fields and broken profile relations before restore", async () => {
    const source = await sourceFixture();
    const payload = new BackupService(source.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    const sourceRow = payload.data.externalSourceObjects.find(
      (row) => row.objectType === "file_transaction",
    )!;
    const withFullAccount = {
      ...payload,
      data: {
        ...payload.data,
        externalSourceObjects: payload.data.externalSourceObjects.map((row) => {
          if (row.id !== sourceRow.id) return row;
          const payloadJson = JSON.stringify({
            ...JSON.parse(row.payloadJson),
            accountNumber: "123456789",
          });
          return {
            ...row,
            payloadJson,
            payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
          };
        }),
      },
    };
    expect(() =>
      new BackupService(target.context).restore(withFullAccount),
    ).toThrow(BackupValidationError);
    const brokenProfile = {
      ...payload,
      data: {
        ...payload.data,
        fileImportProfiles: payload.data.fileImportProfiles.map(
          (profile, index) =>
            index === 0
              ? { ...profile, targetAccountId: "missing-account" }
              : profile,
        ),
      },
    };
    expect(() =>
      new BackupService(target.context).restore(brokenProfile),
    ).toThrow(BackupValidationError);
    expect(readBackupData(target.context.db).books).toEqual([]);
  });

  it("rejects batch counts not explained by linked sources and duplicates", async () => {
    const source = await sourceFixture();
    const csvConnectionId = (
      source.context.sqlite
        .prepare(
          "select connection_id as id from file_import_profiles where format = 'csv'",
        )
        .get() as { id: string }
    ).id;
    const duplicateStrongRows = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-11,-1.00,repeated-strong,Same,Same,USD",
      "2026-08-11,-1.00,repeated-strong,Same,Same,USD",
    ].join("\n");
    const duplicateResult = await new FileImportService(source.context).commit({
      connectionId: csvConnectionId,
      bytes: new TextEncoder().encode(duplicateStrongRows),
      filename: "repeated-strong.csv",
      confirmed: true,
    });
    expect(duplicateResult).toMatchObject({ sourceRows: 2, duplicates: 1 });
    const payload = new BackupService(source.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    const brokenCounts = {
      ...payload,
      data: {
        ...payload.data,
        fileImportBatches: payload.data.fileImportBatches.map((batch, index) =>
          index === 0
            ? { ...batch, sourceRowCount: batch.sourceRowCount + 1 }
            : batch,
        ),
      },
    };
    expect(() =>
      new BackupService(target.context).previewRestore(brokenCounts),
    ).toThrow(BackupValidationError);
  });

  it("keeps imported provenance exportable after a normal Ledger edit", async () => {
    const source = await sourceFixture();
    const csvConnectionId = (
      source.context.sqlite
        .prepare(
          "select connection_id as id from file_import_profiles where format = 'csv'",
        )
        .get() as { id: string }
    ).id;
    const candidateId = (
      source.context.sqlite
        .prepare(
          "select id from external_transaction_candidates where stable_key = 'file:csv:id:backup-match'",
        )
        .get() as { id: string }
    ).id;
    await new FileImportService(source.context).unlinkMatch({
      candidateId,
      confirmed: true,
    });
    const imported = await new ExternalImportService(
      source.context,
    ).importCandidate({
      candidateId,
      chosenEventType: "expense",
      mainAccountId: "backup-v6-usd",
      confirmed: true,
    });
    await new LedgerCommandService(source.context).updateEvent(
      imported.ledgerEventId,
      {
        eventType: "expense",
        input: {
          accountId: "backup-v6-usd",
          amount: "36.00",
          occurredAt: "2026-08-10T04:00:00.000Z",
          payee: "Edited after import",
        },
      },
    );
    const longStrongId = "issuer-id-" + "x".repeat(300);
    await new FileImportService(source.context).commit({
      connectionId: csvConnectionId,
      bytes: new TextEncoder().encode(
        `Date,Amount,ID,Payee,Memo,Currency\n2026-08-11,-1.00,${longStrongId},Long ID,,USD\n`,
      ),
      filename: "long-strong-id.csv",
      confirmed: true,
    });
    const payload = new BackupService(source.context).exportBackup();
    expect(
      payload.data.externalImportLinks.some(
        (link) => link.ledgerEventId === imported.ledgerEventId,
      ),
    ).toBe(true);
    expect(
      payload.data.externalSourceObjects.some((row) =>
        row.externalId.endsWith(longStrongId),
      ),
    ).toBe(true);
  });

  it("roundtrips valid matched, imported, and source-changed file provenance", async () => {
    const source = await sourceFixture();
    const files = new FileImportService(source.context);
    const csvConnectionId = (
      source.context.sqlite
        .prepare(
          "select connection_id as id from file_import_profiles where format = 'csv'",
        )
        .get() as { id: string }
    ).id;
    const matchedCandidateId = (
      source.context.sqlite
        .prepare(
          "select id from external_transaction_candidates where stable_key = 'file:csv:id:backup-match'",
        )
        .get() as { id: string }
    ).id;
    await files.unlinkMatch({
      candidateId: matchedCandidateId,
      confirmed: true,
    });
    await new ExternalImportService(source.context).importCandidate({
      candidateId: matchedCandidateId,
      chosenEventType: "expense",
      mainAccountId: "backup-v6-usd",
      confirmed: true,
    });
    await files.commit({
      connectionId: csvConnectionId,
      bytes: new TextEncoder().encode(
        "Date,Amount,ID,Payee,Memo,Currency\n2026-08-10,-36.00,backup-match,Starbucks,Store 123,USD\n",
      ),
      filename: "statement-corrected.csv",
      confirmed: true,
    });
    await files.commit({
      connectionId: csvConnectionId,
      bytes: new TextEncoder().encode(
        "Date,Amount,ID,Payee,Memo,Currency\n2026-08-12,-10.00,backup-imported,Cafe,Lunch,USD\n",
      ),
      filename: "statement-imported.csv",
      confirmed: true,
    });
    const importedCandidateId = (
      source.context.sqlite
        .prepare(
          "select id from external_transaction_candidates where stable_key = 'file:csv:id:backup-imported'",
        )
        .get() as { id: string }
    ).id;
    await new ExternalImportService(source.context).importCandidate({
      candidateId: importedCandidateId,
      chosenEventType: "expense",
      mainAccountId: "backup-v6-usd",
      confirmed: true,
    });

    const payload = new BackupService(source.context).exportBackup();
    expect(
      payload.data.externalTransactionCandidates.find(
        (candidate) => candidate.id === matchedCandidateId,
      )?.status,
    ).toBe("source_changed");
    expect(
      payload.data.externalTransactionCandidates.find(
        (candidate) => candidate.id === importedCandidateId,
      )?.status,
    ).toBe("imported");
    const target = createTestDatabase();
    databases.push(target);
    new BackupService(target.context).restore(payload);
    expect(readBackupData(target.context.db)).toEqual(
      readBackupData(source.context.db),
    );
  });

  it("rolls back every V1-V6 row when the final V6 insert fails", async () => {
    const source = await sourceFixture();
    const payload = new BackupService(source.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    const beforeData = readBackupData(target.context.db);
    const beforeMeta = target.context.sqlite
      .prepare("select key, value from app_meta order by key")
      .all();
    target.context.sqlite.exec(`
      CREATE TRIGGER force_final_v6_restore_failure
      BEFORE INSERT ON file_import_balance_observation_details
      BEGIN
        SELECT RAISE(ABORT, 'forced final V6 restore failure');
      END;
    `);
    expect(() => new BackupService(target.context).restore(payload)).toThrow();
    expect(readBackupData(target.context.db)).toEqual(beforeData);
    expect(
      target.context.sqlite
        .prepare("select key, value from app_meta order by key")
        .all(),
    ).toEqual(beforeMeta);
  });
});
