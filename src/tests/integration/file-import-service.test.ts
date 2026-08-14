import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { insertAccount, insertBook } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import type { CsvImportConfig } from "../../domain/file-import";
import { ExternalImportService } from "../../services/external-import-service";
import { ExternalMappingService } from "../../services/external-mapping-service";
import { ExternalReconciliationService } from "../../services/external-reconciliation-service";
import { FileImportService } from "../../services/file-import-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ServiceError } from "../../services/errors";
import {
  createTestDatabase,
  deterministicRuntime,
  type TestDatabase,
} from "./test-database";

const FIXTURES = join(process.cwd(), "docs/v5-financial-file-import/fixtures");

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

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function tableCount(database: TestDatabase, table: string): number {
  return (
    database.context.sqlite
      .prepare(`select count(*) as count from ${table}`)
      .get() as { count: number }
  ).count;
}

function scalarText(
  database: TestDatabase,
  sql: string,
  ...parameters: unknown[]
): string {
  return (
    database.context.sqlite.prepare(sql).get(...parameters) as {
      value: string;
    }
  ).value;
}

describe("V5 financial file import service", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  function setup() {
    database = createTestDatabase();
    seedDatabase(database.context);
    const now = "2026-08-13T10:00:00.000Z";
    insertAccount(database.context.db, {
      id: "account-usd-target",
      bookId: "seed-book-default",
      assetId: "seed-asset-usd",
      name: "Statement checking",
      accountType: "bank",
      institutionName: "Example Bank",
      note: null,
      isArchived: false,
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    });
    insertAccount(database.context.db, {
      id: "account-usd-other",
      bookId: "seed-book-default",
      assetId: "seed-asset-usd",
      name: "USD cash",
      accountType: "cash",
      institutionName: null,
      note: null,
      isArchived: false,
      sortOrder: 20,
      createdAt: now,
      updatedAt: now,
    });
    const runtime = deterministicRuntime(now);
    const service = new FileImportService(database.context, runtime);
    return { service, runtime };
  }

  async function csvProfile(service: FileImportService): Promise<string> {
    return service.createProfile({
      bookId: "seed-book-default",
      targetAccountId: "account-usd-target",
      name: "USD CSV",
      format: "csv",
      parserConfig: CSV_CONFIG,
      confirmed: true,
    });
  }

  it("keeps preview read-only and makes weak dedupe stable across ten different files", async () => {
    const { service } = setup();
    const connectionId = await csvProfile(service);
    const ledger = new LedgerCommandService(
      database!.context,
      deterministicRuntime("2026-08-13T10:05:00.000Z"),
    );
    const existingEventId = await ledger.createExpense({
      accountId: "account-usd-target",
      amount: "35.00",
      occurredAt: "2026-08-10T04:00:00.000Z",
      payee: "Starbucks",
      note: "Store 123",
    });
    const baseFile = [
      "Date,Amount,ID,Payee,Memo,Currency,Ignored",
      "2026-08-10,-35.00,,Starbucks,Store 123,USD,base",
      "2026-08-10,-35.00,,Starbucks,Store 123,USD,base",
    ].join("\n");
    const before = {
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      events: tableCount(database!, "ledger_events"),
      snapshots: tableCount(database!, "balance_snapshots"),
    };
    const preview = await service.preview({
      connectionId,
      bytes: bytes(baseFile),
      filename: "../../bank.csv\u0000",
    });
    expect(preview.fatalErrors).toEqual([]);
    expect(preview.parsed?.sanitizedFilename).toBe("bank.csv");
    expect(preview.parsed?.transactions).toHaveLength(2);
    expect(preview.parsed?.transactions[0]?.sourceExternalId).not.toBe(
      preview.parsed?.transactions[1]?.sourceExternalId,
    );
    expect(
      Object.values(preview.matchSuggestions)
        .flat()
        .some((suggestion) => suggestion.ledgerEventId === existingEventId),
    ).toBe(true);
    expect({
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      events: tableCount(database!, "ledger_events"),
      snapshots: tableCount(database!, "balance_snapshots"),
    }).toEqual(before);

    const first = await service.commit({
      connectionId,
      bytes: bytes(baseFile),
      filename: "../../bank.csv\u0000",
      confirmed: true,
    });
    expect(first).toMatchObject({
      sourceRows: 2,
      candidatesCreated: 2,
      duplicates: 0,
      unsupported: 0,
      balanceObservationId: null,
    });
    expect(tableCount(database!, "external_source_objects")).toBe(2);
    expect(tableCount(database!, "external_transaction_candidates")).toBe(2);
    expect(tableCount(database!, "ledger_events")).toBe(before.events);
    expect(tableCount(database!, "balance_snapshots")).toBe(0);

    const exactAgain = await service.commit({
      connectionId,
      bytes: bytes(baseFile),
      filename: "bank.csv",
      confirmed: true,
    });
    expect(exactAgain.batchId).toBe(first.batchId);
    expect(tableCount(database!, "file_import_batches")).toBe(1);

    for (let iteration = 1; iteration <= 10; iteration += 1) {
      const changedUnselectedColumn = baseFile.replaceAll(
        ",base",
        `,iteration-${iteration}`,
      );
      const result = await service.commit({
        connectionId,
        bytes: bytes(changedUnselectedColumn),
        filename: `bank-${iteration}.csv`,
        confirmed: true,
      });
      expect(result.candidatesCreated).toBe(0);
      expect(result.duplicates).toBe(2);
    }
    expect(tableCount(database!, "external_source_objects")).toBe(2);
    expect(tableCount(database!, "external_transaction_candidates")).toBe(2);
    expect(tableCount(database!, "ledger_events")).toBe(before.events);
    expect(tableCount(database!, "file_import_batches")).toBe(11);
    const payloads = database!.context.sqlite
      .prepare(
        "select payload_json as payload from external_source_objects order by id",
      )
      .all() as { payload: string }[];
    expect(
      payloads.every(({ payload }) => !payload.includes("iteration-")),
    ).toBe(true);
  });

  it("accepts identical same-batch strong duplicates and rejects contradictory CSV IDs before writes", async () => {
    const { service } = setup();
    const connectionId = await csvProfile(service);
    const identical = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-10,-35.00,same-strong,Shop,Receipt,USD",
      "2026-08-10,-35.00,same-strong,Shop,Receipt,USD",
    ].join("\n");
    const accepted = await service.commit({
      connectionId,
      bytes: bytes(identical),
      filename: "same-strong.csv",
      confirmed: true,
    });
    expect(accepted).toMatchObject({
      sourceRows: 2,
      candidatesCreated: 1,
      duplicates: 1,
    });
    expect(tableCount(database!, "external_source_objects")).toBe(1);
    expect(tableCount(database!, "external_transaction_candidates")).toBe(1);
    expect(tableCount(database!, "file_import_batch_source_objects")).toBe(1);

    const beforeConflict = {
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      observations: tableCount(database!, "external_balance_observations"),
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
    };
    const contradiction = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-11,-35.00,conflicting-strong,Shop,Receipt,USD",
      "2026-08-11,-3500.00,conflicting-strong,Shop,Receipt,USD",
    ].join("\n");
    await expect(
      service.commit({
        connectionId,
        bytes: bytes(contradiction),
        filename: "conflicting-strong.csv",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FILE_IMPORT_SOURCE_ID_CONFLICT" });
    expect({
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      observations: tableCount(database!, "external_balance_observations"),
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
    }).toEqual(beforeConflict);
  });

  it("rejects contradictory same-batch OFX FITIDs before writes", async () => {
    const { service } = setup();
    const connectionId = await service.createProfile({
      bookId: "seed-book-default",
      targetAccountId: "account-usd-target",
      name: "Conflicting OFX",
      format: "ofx",
      parserConfig: { timezoneForDateOnly: "America/New_York" },
      confirmed: true,
    });
    const fixture = readFileSync(
      join(FIXTURES, "sample_bank_ofx1.ofx"),
      "utf8",
    );
    const contradictoryRow = [
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260812120000.000[-5:EST]",
      "<TRNAMT>-3500.00",
      "<FITID>OFX-1001",
      "<NAME>DIFFERENT PAYEE",
      "<MEMO>CONTRADICTORY ROW",
      "</STMTTRN>",
    ].join("\n");
    const contradiction = fixture.replace(
      "</BANKTRANLIST>",
      `${contradictoryRow}\n</BANKTRANLIST>`,
    );
    const before = {
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      observations: tableCount(database!, "external_balance_observations"),
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
    };
    await expect(
      service.commit({
        connectionId,
        bytes: bytes(contradiction),
        filename: "conflicting-fitid.ofx",
        confirmed: true,
        confirmedStatementIdentity: true,
      }),
    ).rejects.toMatchObject({ code: "FILE_IMPORT_SOURCE_ID_CONFLICT" });
    expect({
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      observations: tableCount(database!, "external_balance_observations"),
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
    }).toEqual(before);
  });

  it("keeps malformed CSV and OFX commits at zero writes", async () => {
    const { service } = setup();
    const csvConnection = await csvProfile(service);
    const ofxConnection = await service.createProfile({
      bookId: "seed-book-default",
      targetAccountId: "account-usd-target",
      name: "Malformed OFX",
      format: "ofx",
      parserConfig: { timezoneForDateOnly: "America/New_York" },
      confirmed: true,
    });
    const before = {
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      events: tableCount(database!, "ledger_events"),
      snapshots: tableCount(database!, "balance_snapshots"),
    };
    await expect(
      service.commit({
        connectionId: csvConnection,
        bytes: bytes(
          "Date,Amount,ID,Currency\n2026-08-14,-1.00,row-1,USD,extra\n",
        ),
        filename: "malformed.csv",
        confirmed: true,
      }),
    ).rejects.toBeTruthy();
    const malformedOfx = new TextDecoder()
      .decode(readFileSync(join(FIXTURES, "sample_bank_ofx2.xml")))
      .replace("</STMTTRN>", "</Bogus>");
    await expect(
      service.commit({
        connectionId: ofxConnection,
        bytes: bytes(malformedOfx),
        filename: "malformed.ofx",
        confirmed: true,
        confirmedStatementIdentity: true,
      }),
    ).rejects.toBeTruthy();
    expect({
      batches: tableCount(database!, "file_import_batches"),
      sources: tableCount(database!, "external_source_objects"),
      candidates: tableCount(database!, "external_transaction_candidates"),
      events: tableCount(database!, "ledger_events"),
      snapshots: tableCount(database!, "balance_snapshots"),
    }).toEqual(before);
  });

  it("keeps the explicit profile target immutable across mapping and import writes", async () => {
    const { service, runtime } = setup();
    const connectionId = await csvProfile(service);
    await service.commit({
      connectionId,
      bytes: bytes(
        "Date,Amount,ID,Payee,Memo,Currency\n2026-08-14,-1.00,target-lock,,,USD\n",
      ),
      filename: "target-lock.csv",
      confirmed: true,
    });
    const providerAssetKey = `file:${connectionId}:target`;
    await expect(
      new ExternalMappingService(database!.context, runtime).updateMapping({
        connectionId,
        providerAssetKey,
        mappingStatus: "mapped",
        talliAssetId: "seed-asset-usd",
        talliAccountId: "account-usd-other",
      }),
    ).rejects.toMatchObject({
      code: "FILE_IMPORT_PROFILE_MAPPING_IMMUTABLE",
    });

    database!.context.sqlite
      .prepare(
        "update external_account_mappings set talli_account_id = ? where connection_id = ? and provider_asset_key = ?",
      )
      .run("account-usd-other", connectionId, providerAssetKey);
    const candidateId = scalarText(
      database!,
      "select id as value from external_transaction_candidates where stable_key = 'file:csv:id:target-lock'",
    );
    await expect(
      new ExternalImportService(database!.context, runtime).importCandidate({
        candidateId,
        chosenEventType: "expense",
        mainAccountId: "account-usd-other",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FILE_IMPORT_TARGET_ACCOUNT_MISMATCH" });
    expect(tableCount(database!, "ledger_events")).toBe(0);
    expect(tableCount(database!, "external_import_links")).toBe(0);
  });

  it("matches without editing Ledger, requires unlink before edits, and imports only explicitly", async () => {
    const { service } = setup();
    const connectionId = await csvProfile(service);
    const ledgerRuntime = deterministicRuntime("2026-08-13T10:10:00.000Z");
    const ledger = new LedgerCommandService(database!.context, ledgerRuntime);
    const existingEventId = await ledger.createExpense({
      accountId: "account-usd-target",
      amount: "35.00",
      occurredAt: "2026-08-10T04:00:00.000Z",
      payee: "Manual Starbucks",
      note: "kept exactly",
    });
    const statement = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-10,-35.00,match-1,STARBUCKS,bank memo,USD",
      "2026-08-11,200.00,income-1,Employer,Payroll,USD",
    ].join("\n");
    await service.commit({
      connectionId,
      bytes: bytes(statement),
      filename: "statement.csv",
      confirmed: true,
    });
    const candidateId = scalarText(
      database!,
      "select id as value from external_transaction_candidates where stable_key = 'file:csv:id:match-1'",
    );
    const incomeCandidateId = scalarText(
      database!,
      "select id as value from external_transaction_candidates where stable_key = 'file:csv:id:income-1'",
    );
    const eventCount = tableCount(database!, "ledger_events");
    await service.matchExisting({
      candidateId,
      ledgerEventId: existingEventId,
      confirmed: true,
    });
    expect(tableCount(database!, "ledger_events")).toBe(eventCount);
    expect(
      scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        candidateId,
      ),
    ).toBe("matched");
    expect(
      scalarText(
        database!,
        "select payee as value from ledger_events where id = ?",
        existingEventId,
      ),
    ).toBe("Manual Starbucks");

    const importer = new ExternalImportService(
      database!.context,
      ledgerRuntime,
    );
    await expect(
      importer.importCandidate({
        candidateId,
        chosenEventType: "expense",
        mainAccountId: "account-usd-target",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_CANDIDATE_ALREADY_MATCHED" });
    await expect(
      ledger.updateEvent(existingEventId, {
        eventType: "expense",
        input: {
          accountId: "account-usd-target",
          amount: "35.00",
          occurredAt: "2026-08-10T04:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ code: "MATCHED_EVENT_EDIT_FORBIDDEN" });
    await expect(ledger.deleteEvent(existingEventId)).rejects.toMatchObject({
      code: "MATCHED_EVENT_DELETE_FORBIDDEN",
    });

    await service.commit({
      connectionId,
      bytes: bytes(statement.replace("-35.00", "-36.00")),
      filename: "statement-corrected.csv",
      confirmed: true,
    });
    expect(
      scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        candidateId,
      ),
    ).toBe("source_changed");
    expect(tableCount(database!, "external_candidate_match_links")).toBe(1);
    expect(
      scalarText(
        database!,
        "select amount_atomic as value from ledger_entries where event_id = ? and account_id = 'account-usd-target'",
        existingEventId,
      ),
    ).toBe("-3500");
    await expect(ledger.deleteEvent(existingEventId)).rejects.toMatchObject({
      code: "MATCHED_EVENT_DELETE_FORBIDDEN",
    });

    await service.unlinkMatch({ candidateId, confirmed: true });
    await ledger.deleteEvent(existingEventId);
    expect(tableCount(database!, "external_candidate_match_links")).toBe(0);
    await importer.importCandidate({
      candidateId: incomeCandidateId,
      chosenEventType: "income",
      mainAccountId: "account-usd-target",
      confirmed: true,
    });
    expect(tableCount(database!, "external_import_links")).toBe(1);
    expect(tableCount(database!, "ledger_events")).toBe(eventCount);
  });

  it("supports explicit outgoing/incoming transfers and source_changed without changing imported Ledger", async () => {
    const { service, runtime } = setup();
    const connectionId = await csvProfile(service);
    const firstFile = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-10,-10.00,out-expense,Cafe,Lunch,USD",
      "2026-08-11,-25.00,out-transfer,ATM,Withdrawal,USD",
      "2026-08-12,50.00,in-transfer,Funding,Top up,USD",
    ].join("\n");
    await service.commit({
      connectionId,
      bytes: bytes(firstFile),
      filename: "first.csv",
      confirmed: true,
    });
    const id = (stableKey: string) =>
      scalarText(
        database!,
        "select id as value from external_transaction_candidates where stable_key = ?",
        stableKey,
      );
    const expenseId = id("file:csv:id:out-expense");
    const outTransferId = id("file:csv:id:out-transfer");
    const inTransferId = id("file:csv:id:in-transfer");
    const importer = new ExternalImportService(database!.context, runtime);
    const expense = await importer.importCandidate({
      candidateId: expenseId,
      chosenEventType: "expense",
      mainAccountId: "account-usd-target",
      confirmed: true,
    });
    await importer.importCandidate({
      candidateId: outTransferId,
      chosenEventType: "transfer",
      sourceAccountId: "account-usd-target",
      destinationAccountId: "account-usd-other",
      confirmed: true,
    });
    await importer.importCandidate({
      candidateId: inTransferId,
      chosenEventType: "transfer",
      sourceAccountId: "account-usd-other",
      destinationAccountId: "account-usd-target",
      confirmed: true,
    });
    expect(tableCount(database!, "external_import_links")).toBe(3);
    const importedAmount = scalarText(
      database!,
      "select amount_atomic as value from ledger_entries where event_id = ? and account_id = 'account-usd-target'",
      expense.ledgerEventId,
    );
    expect(importedAmount).toBe("-1000");

    const changedFile = firstFile.replace("-10.00", "-11.00");
    await service.commit({
      connectionId,
      bytes: bytes(changedFile),
      filename: "changed.csv",
      confirmed: true,
    });
    expect(
      scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        expenseId,
      ),
    ).toBe("source_changed");
    expect(
      scalarText(
        database!,
        "select amount_atomic as value from ledger_entries where event_id = ? and account_id = 'account-usd-target'",
        expense.ledgerEventId,
      ),
    ).toBe("-1000");
    expect(tableCount(database!, "external_import_links")).toBe(3);
    expect(tableCount(database!, "external_candidate_match_links")).toBe(0);
  });

  it("matches exact target-account legs on transfer and exchange events", async () => {
    const { service, runtime } = setup();
    insertAccount(database!.context.db, {
      id: "account-cny-exchange",
      bookId: "seed-book-default",
      assetId: "seed-asset-cny",
      name: "CNY exchange destination",
      accountType: "bank",
      institutionName: null,
      note: null,
      isArchived: false,
      sortOrder: 30,
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    });
    const connectionId = await csvProfile(service);
    await service.commit({
      connectionId,
      bytes: bytes(
        [
          "Date,Amount,ID,Payee,Memo,Currency",
          "2026-08-14,-25.00,match-transfer,,,USD",
          "2026-08-14,-35.00,match-exchange,,,USD",
        ].join("\n"),
      ),
      filename: "account-legs.csv",
      confirmed: true,
    });
    const ledger = new LedgerCommandService(database!.context, runtime);
    const transferId = await ledger.createTransfer({
      sourceAccountId: "account-usd-target",
      destinationAccountId: "account-usd-other",
      amount: "25.00",
      occurredAt: "2026-08-14T04:00:00.000Z",
    });
    const exchangeId = await ledger.createExchange({
      sourceAccountId: "account-usd-target",
      sourceAmount: "35.00",
      destinationAccountId: "account-cny-exchange",
      destinationAmount: "240.00",
      occurredAt: "2026-08-14T04:00:00.000Z",
    });
    const candidate = (stableKey: string) =>
      scalarText(
        database!,
        "select id as value from external_transaction_candidates where stable_key = ?",
        stableKey,
      );
    const eventCount = tableCount(database!, "ledger_events");
    await service.matchExisting({
      candidateId: candidate("file:csv:id:match-transfer"),
      ledgerEventId: transferId,
      confirmed: true,
    });
    await service.matchExisting({
      candidateId: candidate("file:csv:id:match-exchange"),
      ledgerEventId: exchangeId,
      confirmed: true,
    });
    expect(tableCount(database!, "ledger_events")).toBe(eventCount);
    expect(tableCount(database!, "external_candidate_match_links")).toBe(2);
  });

  it("persists closing balance as observation only and reconciles only after confirmation", async () => {
    const { service, runtime } = setup();
    const connectionId = await service.createProfile({
      bookId: "seed-book-default",
      targetAccountId: "account-usd-target",
      name: "USD OFX",
      format: "ofx",
      parserConfig: { timezoneForDateOnly: "America/New_York" },
      confirmed: true,
    });
    const fixture = readFileSync(join(FIXTURES, "sample_bank_ofx1.ofx"));
    const result = await service.commit({
      connectionId,
      bytes: fixture,
      filename: "sample_bank_ofx1.ofx",
      confirmed: true,
      confirmedStatementIdentity: true,
    });
    expect(result.balanceObservationId).not.toBeNull();
    expect(tableCount(database!, "external_balance_observations")).toBe(1);
    expect(
      tableCount(database!, "file_import_balance_observation_details"),
    ).toBe(1);
    expect(tableCount(database!, "balance_snapshots")).toBe(0);
    expect(tableCount(database!, "ledger_events")).toBe(0);
    const storedProfile = database!.context.sqlite
      .prepare(
        "select statement_account_fingerprint as fingerprint, statement_account_last4 as last4 from file_import_profiles where connection_id = ?",
      )
      .get(connectionId) as { fingerprint: string; last4: string };
    expect(storedProfile.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(storedProfile.last4).toBe("6789");
    await expect(
      service.commit({
        connectionId,
        bytes: bytes(
          fixture.toString("utf8").replace("123456789", "987654321"),
        ),
        filename: "different-account.ofx",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FILE_IMPORT_ACCOUNT_MISMATCH" });
    expect(tableCount(database!, "file_import_batches")).toBe(1);

    const reconciler = new ExternalReconciliationService(
      database!.context,
      runtime,
    );
    const providerAssetKey = `file:${connectionId}:target`;
    database!.context.sqlite
      .prepare(
        "update external_account_mappings set talli_account_id = ? where connection_id = ? and provider_asset_key = ?",
      )
      .run("account-usd-other", connectionId, providerAssetKey);
    await expect(
      reconciler.reconcileObservation({
        observationId: result.balanceObservationId!,
        accountId: "account-usd-other",
        confirmed: true,
      }),
    ).rejects.toMatchObject({
      code: "FILE_IMPORT_OBSERVATION_INTEGRITY_ERROR",
    });
    database!.context.sqlite
      .prepare(
        "update external_account_mappings set talli_account_id = ? where connection_id = ? and provider_asset_key = ?",
      )
      .run("account-usd-target", connectionId, providerAssetKey);
    const reconciliation = await reconciler.reconcileObservation({
      observationId: result.balanceObservationId!,
      accountId: "account-usd-target",
      confirmed: true,
    });
    expect(reconciliation.snapshotId).toBeTruthy();
    expect(tableCount(database!, "balance_snapshots")).toBe(1);
    expect(tableCount(database!, "ledger_events")).toBe(0);
  });

  it("rolls back the whole batch on late persistence failure", async () => {
    const { service } = setup();
    const connectionId = await csvProfile(service);
    const collisionRuntime = {
      id: () => "forced-id-collision",
      now: () => "2026-08-13T11:00:00.000Z",
    };
    const commitService = new FileImportService(
      database!.context,
      collisionRuntime,
    );
    const statement = [
      "Date,Amount,ID,Payee,Memo,Currency",
      "2026-08-10,-1.00,id-1,A,A,USD",
      "2026-08-11,-2.00,id-2,B,B,USD",
    ].join("\n");
    await expect(
      commitService.commit({
        connectionId,
        bytes: bytes(statement),
        filename: "collision.csv",
        confirmed: true,
      }),
    ).rejects.toBeTruthy();
    expect(tableCount(database!, "file_import_batches")).toBe(0);
    expect(tableCount(database!, "external_source_objects")).toBe(0);
    expect(tableCount(database!, "external_transaction_candidates")).toBe(0);
    expect(tableCount(database!, "external_balance_observations")).toBe(0);
  });

  it("rolls back an explicit import when provenance insertion fails last", async () => {
    const { service, runtime } = setup();
    const connectionId = await csvProfile(service);
    await service.commit({
      connectionId,
      bytes: bytes(
        "Date,Amount,ID,Payee,Memo,Currency\n2026-08-14,-1.00,late-import,,,USD\n",
      ),
      filename: "late-import.csv",
      confirmed: true,
    });
    const candidateId = scalarText(
      database!,
      "select id as value from external_transaction_candidates where stable_key = 'file:csv:id:late-import'",
    );
    database!.context.sqlite.exec(`
      CREATE TRIGGER force_import_provenance_failure
      BEFORE INSERT ON external_import_links
      BEGIN
        SELECT RAISE(ABORT, 'forced import provenance failure');
      END;
    `);
    const eventCount = tableCount(database!, "ledger_events");
    await expect(
      new ExternalImportService(database!.context, runtime).importCandidate({
        candidateId,
        chosenEventType: "expense",
        mainAccountId: "account-usd-target",
        confirmed: true,
      }),
    ).rejects.toBeTruthy();
    expect(tableCount(database!, "ledger_events")).toBe(eventCount);
    expect(tableCount(database!, "external_import_links")).toBe(0);
    expect(
      scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        candidateId,
      ),
    ).toBe("pending");
  });

  it("rejects DB-corrupted file amounts before explicit import or match writes", async () => {
    const { service, runtime } = setup();
    const connectionId = await csvProfile(service);
    await service.commit({
      connectionId,
      bytes: bytes(
        [
          "Date,Amount,ID,Payee,Memo,Currency",
          "2026-08-14,-35.00,tamper-import,Import source,,USD",
          "2026-08-14,-35.00,tamper-match,Match source,,USD",
        ].join("\n"),
      ),
      filename: "tamper-defense.csv",
      confirmed: true,
    });
    const candidate = (stableKey: string) =>
      scalarText(
        database!,
        "select id as value from external_transaction_candidates where stable_key = ?",
        stableKey,
      );
    const importCandidateId = candidate("file:csv:id:tamper-import");
    const matchCandidateId = candidate("file:csv:id:tamper-match");
    database!.context.sqlite
      .prepare(
        "update external_transaction_legs set amount_text = '-36.00', amount_atomic = '-3600' where candidate_id = ?",
      )
      .run(importCandidateId);
    const beforeImport = {
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
      links: tableCount(database!, "external_import_links"),
      status: scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        importCandidateId,
      ),
    };
    await expect(
      new ExternalImportService(database!.context, runtime).importCandidate({
        candidateId: importCandidateId,
        chosenEventType: "expense",
        mainAccountId: "account-usd-target",
        confirmed: true,
      }),
    ).rejects.toMatchObject({
      code: "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR",
    });
    expect({
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
      links: tableCount(database!, "external_import_links"),
      status: scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        importCandidateId,
      ),
    }).toEqual(beforeImport);

    const ledgerEventId = await new LedgerCommandService(
      database!.context,
      runtime,
    ).createExpense({
      accountId: "account-usd-target",
      amount: "36.00",
      occurredAt: "2026-08-14T04:00:00.000Z",
    });
    database!.context.sqlite
      .prepare(
        "update external_transaction_legs set amount_text = '-36.00', amount_atomic = '-3600' where candidate_id = ?",
      )
      .run(matchCandidateId);
    const beforeMatch = {
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
      links: tableCount(database!, "external_candidate_match_links"),
      status: scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        matchCandidateId,
      ),
    };
    await expect(
      service.matchExisting({
        candidateId: matchCandidateId,
        ledgerEventId,
        confirmed: true,
      }),
    ).rejects.toMatchObject({
      code: "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR",
    });
    expect({
      events: tableCount(database!, "ledger_events"),
      entries: tableCount(database!, "ledger_entries"),
      links: tableCount(database!, "external_candidate_match_links"),
      status: scalarText(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        matchCandidateId,
      ),
    }).toEqual(beforeMatch);
  });

  it("rejects explicit matches with the wrong amount or book", async () => {
    const { service } = setup();
    const connectionId = await csvProfile(service);
    await service.commit({
      connectionId,
      bytes: bytes(
        [
          "Date,Amount,ID,Payee,Memo,Currency",
          "2026-08-10,-35.00,match-wrong,Shop,Memo,USD",
        ].join("\n"),
      ),
      filename: "wrong.csv",
      confirmed: true,
    });
    const ledger = new LedgerCommandService(database!.context);
    const wrongEvent = await ledger.createExpense({
      accountId: "account-usd-target",
      amount: "34.99",
      occurredAt: "2026-08-10T04:00:00.000Z",
    });
    insertBook(database!.context.db, {
      id: "other-book",
      name: "Other book",
      isDefault: false,
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    });
    insertAccount(database!.context.db, {
      id: "other-book-usd",
      bookId: "other-book",
      assetId: "seed-asset-usd",
      name: "Other book USD",
      accountType: "bank",
      institutionName: null,
      note: null,
      isArchived: false,
      sortOrder: 0,
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    });
    const wrongBookEvent = await ledger.createExpense({
      accountId: "other-book-usd",
      amount: "35.00",
      occurredAt: "2026-08-10T04:00:00.000Z",
    });
    const candidateId = scalarText(
      database!,
      "select id as value from external_transaction_candidates where stable_key = 'file:csv:id:match-wrong'",
    );
    await expect(
      service.matchExisting({
        candidateId,
        ledgerEventId: wrongEvent,
        confirmed: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ServiceError &&
        error.code === "FILE_IMPORT_MATCH_LEDGER_MISMATCH",
    );
    await expect(
      service.matchExisting({
        candidateId,
        ledgerEventId: wrongBookEvent,
        confirmed: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ServiceError &&
        error.code === "FILE_IMPORT_MATCH_LEDGER_MISMATCH",
    );
    expect(tableCount(database!, "external_candidate_match_links")).toBe(0);
  });
});
