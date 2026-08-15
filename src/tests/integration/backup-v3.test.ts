import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureExternalConnectionState,
  insertExternalBalanceObservation,
  insertExternalCandidate,
  insertExternalConnection,
  insertExternalImportLink,
  insertExternalSourceObject,
  insertExternalSyncRun,
  readBackupData,
  replaceExternalCandidateDetails,
  updateExternalConnectionState,
  upsertExternalAccountMapping,
  upsertExternalAssetMapping,
} from "../../db/queries";
import { readSeedVersion, seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, seedAssetId } from "../../db/seed-data";
import { BackupValidationError } from "../../domain/backup";
import { canonicalExternalJson } from "../../domain/external-sync";
import { AccountService } from "../../services/account-service";
import {
  BackupService,
  RestoreTargetError,
} from "../../services/backup-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

const NOW = "2026-08-11T12:05:00.000Z";

describe("Backup v3 external sync compatibility", () => {
  const databases: TestDatabase[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  async function sourceWithExternalProvenance() {
    const database = createTestDatabase();
    databases.push(database);
    seedDatabase(database.context);
    const runtime = deterministicRuntime(NOW);
    const accountId = await new AccountService(
      database.context,
      runtime,
    ).createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("BTC"),
      name: "Kraken BTC",
      accountType: "exchange",
    });
    const ledgerEventId = await new LedgerCommandService(
      database.context,
      runtime,
    ).createIncome({
      accountId,
      amount: "0.502",
      occurredAt: "2026-08-11T12:00:00.000Z",
      payee: "Kraken",
    });
    const executor = database.context.db;
    insertExternalConnection(executor, {
      id: "external-connection-1",
      bookId: SEED_BOOK_ID,
      provider: "kraken",
      sourceKey: "kraken:primary",
      name: "Kraken",
      credentialRef: "env:kraken.primary",
      isEnabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    upsertExternalAssetMapping(executor, {
      connectionId: "external-connection-1",
      providerAssetKey: "XXBT",
      providerDisplayCode: "BTC",
      talliAssetId: seedAssetId("BTC"),
      mappingStatus: "mapped",
      providerMetadataJson: '{"displayCode":"BTC"}',
      createdAt: NOW,
      updatedAt: NOW,
    });
    upsertExternalAccountMapping(executor, {
      connectionId: "external-connection-1",
      providerAssetKey: "XXBT",
      talliAccountId: accountId,
      isEnabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const payloadJson = canonicalExternalJson({
      amount: "0.50200000",
      asset: "XXBT",
      balance: "0.50200000",
      fee: "0.00000000",
      refid: "D-1",
      subtype: "",
      time: "1786440000.0000",
      type: "deposit",
    });
    const payloadHash = createHash("sha256").update(payloadJson).digest("hex");
    insertExternalSourceObject(executor, {
      id: "external-source-1",
      connectionId: "external-connection-1",
      objectType: "kraken_ledger",
      externalId: "L-DEPOSIT-1",
      occurredAt: "2026-08-11T12:00:00.000Z",
      payloadJson,
      payloadHash,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });
    insertExternalBalanceObservation(executor, {
      id: "external-observation-1",
      connectionId: "external-connection-1",
      providerAssetKey: "XXBT",
      talliAssetId: seedAssetId("BTC"),
      providerAmountText: "0.50200000",
      mappedAmountAtomic: "50200000",
      precisionStatus: "exact",
      observedAt: NOW,
      payloadHash: "a".repeat(64),
      createdAt: NOW,
    });
    const sourceFingerprint = createHash("sha256")
      .update(`kraken_ledger:L-DEPOSIT-1:${payloadHash}`)
      .digest("hex");
    insertExternalCandidate(executor, {
      id: "external-candidate-1",
      connectionId: "external-connection-1",
      stableKey: "kraken:ledger:L-DEPOSIT-1",
      suggestedEventType: "unknown",
      status: "imported",
      occurredAt: "2026-08-11T12:00:00.000Z",
      title: "Kraken deposit",
      normalizationVersion: 1,
      sourceFingerprint,
      createdAt: NOW,
      updatedAt: NOW,
      lastSeenAt: NOW,
    });
    replaceExternalCandidateDetails(
      executor,
      "external-candidate-1",
      [{ sourceObjectId: "external-source-1", relation: "primary" }],
      [
        {
          id: "external-leg-1",
          legIndex: 0,
          role: "external_in",
          providerAssetKey: "XXBT",
          talliAssetId: seedAssetId("BTC"),
          amountText: "0.50200000",
          amountAtomic: "50200000",
          precisionStatus: "exact",
          note: null,
        },
      ],
    );
    insertExternalImportLink(executor, {
      candidateId: "external-candidate-1",
      ledgerEventId,
      importedAt: NOW,
      importFingerprint: "b".repeat(64),
    });

    ensureExternalConnectionState(executor, "external-connection-1", NOW);
    updateExternalConnectionState(executor, "external-connection-1", {
      lastErrorMessage: "OPERATIONAL_STATE_MUST_NOT_EXPORT",
      permissionSummaryJson:
        '{"sentinel":"OPERATIONAL_PERMISSION_MUST_NOT_EXPORT"}',
      updatedAt: NOW,
    });
    insertExternalSyncRun(executor, {
      id: "external-sync-run-1",
      connectionId: "external-connection-1",
      startedAt: NOW,
      finishedAt: NOW,
      status: "error",
      errorMessage: "OPERATIONAL_RUN_MUST_NOT_EXPORT",
    });
    return { database, accountId, ledgerEventId };
  }

  it("B3-001..004 exports and restores V3 provenance without operational state", async () => {
    const source = await sourceWithExternalProvenance();
    const payload = new BackupService(source.database.context).exportBackup();
    const json = JSON.stringify(payload);

    expect(payload.schemaVersion).toBe(8);
    expect(payload.data.externalConnections).toHaveLength(1);
    expect(payload.data.externalBalanceObservations).toHaveLength(1);
    expect(payload.data.externalSourceObjects).toHaveLength(1);
    expect(payload.data.externalTransactionCandidates).toHaveLength(1);
    expect(payload.data.externalImportLinks).toMatchObject([
      {
        candidateId: "external-candidate-1",
        ledgerEventId: source.ledgerEventId,
      },
    ]);
    expect(json).not.toContain("externalConnectionState");
    expect(json).not.toContain("externalSyncRuns");
    expect(json).not.toContain("lastNonceText");
    expect(json).not.toContain("OPERATIONAL_STATE_MUST_NOT_EXPORT");
    expect(json).not.toContain("OPERATIONAL_PERMISSION_MUST_NOT_EXPORT");
    expect(json).not.toContain("OPERATIONAL_RUN_MUST_NOT_EXPORT");
    expect(json).not.toContain("KRAKEN_API_SECRET");
    expect(json).not.toContain("KRAKEN_API_KEY");

    const target = createTestDatabase();
    databases.push(target);
    new BackupService(target.context).restore(payload);
    expect(readBackupData(target.context.db)).toEqual(
      readBackupData(source.database.context.db),
    );
    expect(
      target.context.sqlite
        .prepare("select count(*) as count from external_connection_state")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      target.context.sqlite
        .prepare("select count(*) as count from external_sync_runs")
        .get(),
    ).toEqual({ count: 0 });
    expect(target.context.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("B3-005 rejects broken V3 relations before writing", async () => {
    const source = await sourceWithExternalProvenance();
    const payload = new BackupService(source.database.context).exportBackup();
    const invalidPayloads = [];

    const missingBook = structuredClone(payload);
    missingBook.data.externalConnections[0]!.bookId = "missing-book";
    invalidPayloads.push(missingBook);
    const mismatchedAccount = structuredClone(payload);
    mismatchedAccount.data.externalAccountMappings[0]!.talliAccountId =
      "missing-account";
    invalidPayloads.push(mismatchedAccount);
    const brokenSource = structuredClone(payload);
    brokenSource.data.externalCandidateSourceObjects[0]!.sourceObjectId =
      "missing-source";
    invalidPayloads.push(brokenSource);
    const badAtomic = structuredClone(payload);
    badAtomic.data.externalTransactionLegs[0]!.amountAtomic = "1";
    invalidPayloads.push(badAtomic);
    const missingEvent = structuredClone(payload);
    missingEvent.data.externalImportLinks[0]!.ledgerEventId = "missing-event";
    invalidPayloads.push(missingEvent);
    const duplicateCandidate = structuredClone(payload);
    duplicateCandidate.data.externalTransactionCandidates.push({
      ...duplicateCandidate.data.externalTransactionCandidates[0]!,
      id: "external-candidate-duplicate",
    });
    invalidPayloads.push(duplicateCandidate);

    const target = createTestDatabase();
    databases.push(target);
    for (const invalid of invalidPayloads) {
      expect(() => new BackupService(target.context).restore(invalid)).toThrow(
        BackupValidationError,
      );
      expect(readBackupData(target.context.db).books).toEqual([]);
    }
  });

  it("B3-006 rolls V1, V2, and V3 rows back after a late V3 failure", async () => {
    const source = await sourceWithExternalProvenance();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    target.context.sqlite.exec(`
      create trigger fail_external_import_restore
      before insert on external_import_links
      begin
        select raise(abort, 'forced V3 restore failure');
      end;
    `);

    expect(() => new BackupService(target.context).restore(payload)).toThrow(
      "forced V3 restore failure",
    );
    const restored = readBackupData(target.context.db);
    expect(restored.books).toEqual([]);
    expect(restored.accounts).toEqual([]);
    expect(restored.externalConnections).toEqual([]);
    expect(restored.externalTransactionCandidates).toEqual([]);
    expect(restored.externalImportLinks).toEqual([]);
    expect(readSeedVersion(target.context.db)).toBeNull();
  });

  it("B3-007 treats external configuration as non-seed user data", async () => {
    const source = await sourceWithExternalProvenance();
    const payload = new BackupService(source.database.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    seedDatabase(target.context);
    insertExternalConnection(target.context.db, {
      id: "existing-external-connection",
      bookId: SEED_BOOK_ID,
      provider: "kraken",
      sourceKey: "kraken:primary",
      name: "Existing Kraken",
      credentialRef: "env:kraken.primary",
      isEnabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(() =>
      new BackupService(target.context).previewRestore(payload),
    ).toThrow(RestoreTargetError);
    expect(readBackupData(target.context.db).externalConnections).toHaveLength(
      1,
    );
  });
});
