import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import {
  insertAccount,
  insertExternalConnection,
  insertSnapshot,
} from "../../db/queries";
import type {
  KrakenPermissionCheck,
  KrakenReadOnlyProvider,
  KrakenSourceObject,
  KrakenSyncSnapshot,
} from "../../providers/kraken/types";
import { ExternalSyncService } from "../../services/external-sync-service";
import { ExternalMappingService } from "../../services/external-mapping-service";
import { ExternalImportService } from "../../services/external-import-service";
import { ExternalReconciliationService } from "../../services/external-reconciliation-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { createTestDatabase, type TestDatabase } from "./test-database";

const permissions: KrakenPermissionCheck = {
  ok: true,
  permissions: ["query-closed-trades", "query-funds", "query-ledger"],
  missingRequired: [],
  forbiddenWritePermissions: [],
  extraReadOnlyPermissions: [],
};

function source(
  objectType: "kraken_trade" | "kraken_ledger",
  externalId: string,
  payload: Record<string, unknown>,
): KrakenSourceObject {
  const payloadJson = JSON.stringify(payload);
  return {
    objectType,
    externalId,
    occurredAt: "2026-08-11T12:00:00.100Z",
    payloadJson,
    payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
  };
}

function snapshot(tradeCost = "100.0000"): KrakenSyncSnapshot {
  return {
    fetchedAt: "2026-08-11T12:05:00.000Z",
    permissions,
    referenceData: {
      assets: {
        BTC: {
          displayCode: "BTC",
          altname: "XBT",
          decimals: 10,
          displayDecimals: 8,
          status: "enabled",
        },
        USD: {
          displayCode: "USD",
          altname: "USD",
          decimals: 4,
          displayDecimals: 2,
          status: "enabled",
        },
        USDT: {
          displayCode: "USDT",
          altname: "USDT",
          decimals: 8,
          displayDecimals: 8,
          status: "enabled",
        },
      },
      assetPairs: {
        "BTC/USD": {
          displayPair: "BTC/USD",
          altname: "XBTUSD",
          wsname: "XBT/USD",
          base: "BTC",
          quote: "USD",
          feeVolumeCurrency: "USD",
          pairDecimals: 4,
          lotDecimals: 8,
        },
      },
    },
    balances: [
      { providerAssetKey: "XXBT", amountText: "0.50200000" },
      { providerAssetKey: "ZUSD", amountText: "1250.1000" },
    ],
    ledgers: [
      source("kraken_ledger", "L-TRADE-1", {
        refid: "T-TRADE-1",
        time: "1786440000.1000",
        type: "trade",
        subtype: "",
        asset: "ZUSD",
        amount: `-${tradeCost}`,
        fee: "0.2500",
        balance: "1150.1000",
      }),
      source("kraken_ledger", "L-DEPOSIT-1", {
        refid: "D-DEPOSIT-1",
        time: "1786430000.0000",
        type: "deposit",
        subtype: "",
        asset: "USDT",
        amount: "50.00000000",
        fee: "0.00000000",
        balance: "100.00000000",
      }),
    ],
    trades: [
      source("kraken_trade", "T-TRADE-1", {
        ordertxid: "O-ORDER-1",
        postxid: "",
        pair: "BTC/USD",
        time: "1786440000.1000",
        type: "buy",
        price: "68965.517241",
        cost: tradeCost,
        fee: "0.2500",
        vol: "0.00145000",
        ledgers: ["L-TRADE-1"],
      }),
    ],
  };
}

class FixtureProvider implements KrakenReadOnlyProvider {
  constructor(private currentSnapshot: KrakenSyncSnapshot) {}

  setSnapshot(value: KrakenSyncSnapshot): void {
    this.currentSnapshot = value;
  }

  async validateCredentials() {
    return permissions;
  }

  async fetchSnapshot() {
    return this.currentSnapshot;
  }
}

function count(
  sqlite: TestDatabase["context"]["sqlite"],
  table: string,
): number {
  return (
    sqlite.prepare(`select count(*) as count from ${table}`).get() as {
      count: number;
    }
  ).count;
}

function rowId(sqlite: TestDatabase["context"]["sqlite"], sql: string): string {
  return (sqlite.prepare(sql).get() as { id: string }).id;
}

describe("external sync persistence", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  function setup() {
    database = createTestDatabase();
    seedDatabase(database.context);
    insertExternalConnection(database.context.db, {
      id: "connection-kraken",
      bookId: "seed-book-default",
      provider: "kraken",
      name: "Kraken",
      credentialRef: "env:kraken.primary",
      isEnabled: true,
      createdAt: "2026-08-11T12:00:00.000Z",
      updatedAt: "2026-08-11T12:00:00.000Z",
    });
    let sequence = 0;
    const runtime = {
      id: () => `v3-id-${String(++sequence).padStart(4, "0")}`,
      now: () => "2026-08-11T12:05:00.000Z",
    };
    const provider = new FixtureProvider(snapshot());
    const service = new ExternalSyncService(
      database.context,
      () => provider,
      runtime,
    );
    return { provider, runtime, service };
  }

  function createAccount(
    id: string,
    assetId: "seed-asset-btc" | "seed-asset-usd" | "seed-asset-usdt",
  ): void {
    const now = "2026-08-11T12:05:00.000Z";
    insertAccount(database!.context.db, {
      id,
      bookId: "seed-book-default",
      assetId,
      name: id,
      accountType: "exchange",
      institutionName: id.startsWith("account-kraken") ? "Kraken" : null,
      note: null,
      isArchived: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async function syncWithMappedAccounts() {
    const initialized = setup();
    await initialized.service.syncNow("connection-kraken");
    createAccount("account-kraken-btc", "seed-asset-btc");
    createAccount("account-kraken-usd", "seed-asset-usd");
    createAccount("account-kraken-usdt", "seed-asset-usdt");
    const mappings = new ExternalMappingService(
      database!.context,
      initialized.runtime,
    );
    await mappings.updateMapping({
      connectionId: "connection-kraken",
      providerAssetKey: "XXBT",
      mappingStatus: "mapped",
      talliAssetId: "seed-asset-btc",
      talliAccountId: "account-kraken-btc",
    });
    await mappings.updateMapping({
      connectionId: "connection-kraken",
      providerAssetKey: "ZUSD",
      mappingStatus: "mapped",
      talliAssetId: "seed-asset-usd",
      talliAccountId: "account-kraken-usd",
    });
    await mappings.updateMapping({
      connectionId: "connection-kraken",
      providerAssetKey: "USDT",
      mappingStatus: "mapped",
      talliAssetId: "seed-asset-usdt",
      talliAccountId: "account-kraken-usdt",
    });
    await initialized.service.syncNow("connection-kraken");
    return initialized;
  }

  it("writes observations and candidates without touching ledger facts", async () => {
    const { service } = setup();
    await expect(service.syncNow("connection-kraken")).resolves.toMatchObject({
      balancesSeen: 2,
      sourceObjectsSeen: 3,
      candidatesCreated: 2,
    });

    const sqlite = database!.context.sqlite;
    expect(count(sqlite, "external_source_objects")).toBe(3);
    expect(count(sqlite, "external_transaction_candidates")).toBe(2);
    expect(count(sqlite, "external_balance_observations")).toBe(2);
    expect(count(sqlite, "ledger_events")).toBe(0);
    expect(count(sqlite, "ledger_entries")).toBe(0);
    expect(count(sqlite, "balance_snapshots")).toBe(0);
  });

  it("is idempotent for source objects and candidates across re-sync", async () => {
    const { service } = setup();
    await service.syncNow("connection-kraken");
    await expect(service.syncNow("connection-kraken")).resolves.toMatchObject({
      candidatesCreated: 0,
      candidatesUpdated: 2,
    });

    const sqlite = database!.context.sqlite;
    expect(count(sqlite, "external_source_objects")).toBe(3);
    expect(count(sqlite, "external_transaction_candidates")).toBe(2);
    expect(count(sqlite, "external_balance_observations")).toBe(4);
    expect(count(sqlite, "ledger_events")).toBe(0);
  });

  it("re-normalizes a changed source before import without duplication", async () => {
    const { provider, service } = setup();
    await service.syncNow("connection-kraken");
    provider.setSnapshot(snapshot("101.0000"));
    await service.syncNow("connection-kraken");

    const sqlite = database!.context.sqlite;
    expect(count(sqlite, "external_source_objects")).toBe(3);
    expect(count(sqlite, "external_transaction_candidates")).toBe(2);
    const sourceLeg = sqlite
      .prepare(
        "select l.amount_text as amountText from external_transaction_legs l join external_transaction_candidates c on c.id = l.candidate_id where c.stable_key = 'kraken:trade:T-TRADE-1' and l.role = 'source'",
      )
      .get();
    expect(sourceLeg).toEqual({ amountText: "-101.0000" });
  });

  it("allows only one provider chain for concurrent sync requests", async () => {
    setup();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let fetches = 0;
    const provider: KrakenReadOnlyProvider = {
      validateCredentials: async () => permissions,
      fetchSnapshot: async () => {
        fetches += 1;
        await wait;
        return snapshot();
      },
    };
    const service = new ExternalSyncService(database!.context, () => provider, {
      id: (() => {
        let sequence = 100;
        return () => `concurrent-${++sequence}`;
      })(),
      now: () => "2026-08-11T12:05:00.000Z",
    });

    const first = service.syncNow("connection-kraken");
    await expect(service.syncNow("connection-kraken")).rejects.toMatchObject({
      code: "EXTERNAL_SYNC_ALREADY_RUNNING",
    });
    release();
    await first;
    expect(fetches).toBe(1);
  });

  it("rejects account/asset mismatch and never rounds excess precision", async () => {
    const { provider, service } = setup();
    await service.syncNow("connection-kraken");
    const now = "2026-08-11T12:05:00.000Z";
    insertAccount(database!.context.db, {
      id: "account-btc",
      bookId: "seed-book-default",
      assetId: "seed-asset-btc",
      name: "Kraken BTC",
      accountType: "exchange",
      institutionName: "Kraken",
      note: null,
      isArchived: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    insertAccount(database!.context.db, {
      id: "account-usd",
      bookId: "seed-book-default",
      assetId: "seed-asset-usd",
      name: "Kraken USD",
      accountType: "exchange",
      institutionName: "Kraken",
      note: null,
      isArchived: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const mappings = new ExternalMappingService(database!.context, {
      id: () => "mapping-id-unused",
      now: () => now,
    });

    await expect(
      mappings.updateMapping({
        connectionId: "connection-kraken",
        providerAssetKey: "XXBT",
        mappingStatus: "mapped",
        talliAssetId: "seed-asset-btc",
        talliAccountId: "account-usd",
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_ACCOUNT_ASSET_MISMATCH" });
    await mappings.updateMapping({
      connectionId: "connection-kraken",
      providerAssetKey: "ZUSD",
      mappingStatus: "ignored",
    });
    await mappings.updateMapping({
      connectionId: "connection-kraken",
      providerAssetKey: "XXBT",
      mappingStatus: "mapped",
      talliAssetId: "seed-asset-btc",
      talliAccountId: "account-btc",
    });

    const excess = snapshot();
    excess.balances[0] = {
      providerAssetKey: "XXBT",
      amountText: "0.502000001",
    };
    provider.setSnapshot(excess);
    await service.syncNow("connection-kraken");
    const observation = database!.context.sqlite
      .prepare(
        "select precision_status as precisionStatus, mapped_amount_atomic as mappedAmountAtomic from external_balance_observations where provider_asset_key = 'XXBT' order by created_at desc, rowid desc limit 1",
      )
      .get();
    expect(observation).toEqual({
      precisionStatus: "excess_precision",
      mappedAmountAtomic: null,
    });
  });

  it("imports one reviewed exchange through the V1 writer with provenance", async () => {
    const { runtime } = await syncWithMappedAccounts();
    const sqlite = database!.context.sqlite;
    const candidateId = rowId(
      sqlite,
      "select id from external_transaction_candidates where stable_key = 'kraken:trade:T-TRADE-1'",
    );
    const importer = new ExternalImportService(database!.context, runtime);

    const result = await importer.importCandidate({
      candidateId,
      chosenEventType: "exchange",
      sourceAccountId: "account-kraken-usd",
      destinationAccountId: "account-kraken-btc",
      feeAccountId: "account-kraken-usd",
      confirmed: true,
    });

    expect(result.candidateId).toBe(candidateId);
    expect(count(sqlite, "ledger_events")).toBe(1);
    expect(count(sqlite, "ledger_entries")).toBe(3);
    expect(count(sqlite, "external_import_links")).toBe(1);
    expect(
      sqlite
        .prepare(
          "select status from external_transaction_candidates where id = ?",
        )
        .get(candidateId),
    ).toEqual({ status: "imported" });

    await expect(
      importer.importCandidate({
        candidateId,
        chosenEventType: "exchange",
        sourceAccountId: "account-kraken-usd",
        destinationAccountId: "account-kraken-btc",
        feeAccountId: "account-kraken-usd",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EXTERNAL_CANDIDATE_ALREADY_IMPORTED" });
    expect(count(sqlite, "ledger_events")).toBe(1);

    const ledger = new LedgerCommandService(database!.context, runtime);
    await expect(
      ledger.deleteEvent(result.ledgerEventId),
    ).rejects.toMatchObject({
      code: "IMPORTED_EVENT_DELETE_FORBIDDEN",
    });
  });

  it("rolls back the V1 event when provenance insertion fails late", async () => {
    const { runtime } = await syncWithMappedAccounts();
    const sqlite = database!.context.sqlite;
    const candidateId = rowId(
      sqlite,
      "select id from external_transaction_candidates where stable_key = 'kraken:trade:T-TRADE-1'",
    );
    sqlite.exec(`
      CREATE TRIGGER fail_external_import_link
      BEFORE INSERT ON external_import_links
      BEGIN
        SELECT RAISE(ABORT, 'forced late import failure');
      END;
    `);

    const importer = new ExternalImportService(database!.context, runtime);
    await expect(
      importer.importCandidate({
        candidateId,
        chosenEventType: "exchange",
        sourceAccountId: "account-kraken-usd",
        destinationAccountId: "account-kraken-btc",
        feeAccountId: "account-kraken-usd",
        confirmed: true,
      }),
    ).rejects.toThrow("forced late import failure");

    expect(count(sqlite, "ledger_events")).toBe(0);
    expect(count(sqlite, "ledger_entries")).toBe(0);
    expect(count(sqlite, "external_import_links")).toBe(0);
    expect(
      sqlite
        .prepare(
          "select status from external_transaction_candidates where id = ?",
        )
        .get(candidateId),
    ).toEqual({ status: "pending" });
  });

  it("keeps an imported ledger event stable across re-sync and source changes", async () => {
    const { provider, runtime, service } = await syncWithMappedAccounts();
    const sqlite = database!.context.sqlite;
    const candidateId = rowId(
      sqlite,
      "select id from external_transaction_candidates where stable_key = 'kraken:trade:T-TRADE-1'",
    );
    const importer = new ExternalImportService(database!.context, runtime);
    await importer.importCandidate({
      candidateId,
      chosenEventType: "exchange",
      sourceAccountId: "account-kraken-usd",
      destinationAccountId: "account-kraken-btc",
      feeAccountId: "account-kraken-usd",
      confirmed: true,
    });

    await service.syncNow("connection-kraken");
    expect(count(sqlite, "ledger_events")).toBe(1);
    expect(
      sqlite
        .prepare(
          "select status from external_transaction_candidates where id = ?",
        )
        .get(candidateId),
    ).toEqual({ status: "imported" });

    provider.setSnapshot(snapshot("101.0000"));
    await service.syncNow("connection-kraken");
    expect(count(sqlite, "ledger_events")).toBe(1);
    expect(count(sqlite, "ledger_entries")).toBe(3);
    expect(
      sqlite
        .prepare(
          "select status from external_transaction_candidates where id = ?",
        )
        .get(candidateId),
    ).toEqual({ status: "source_changed" });
  });

  it("still enforces V1 transfer invariants during explicit import", async () => {
    const { runtime } = await syncWithMappedAccounts();
    const sqlite = database!.context.sqlite;
    const candidateId = rowId(
      sqlite,
      "select id from external_transaction_candidates where stable_key = 'kraken:ledger:L-DEPOSIT-1'",
    );
    const importer = new ExternalImportService(database!.context, runtime);

    await expect(
      importer.importCandidate({
        candidateId,
        chosenEventType: "transfer",
        sourceAccountId: "account-kraken-usdt",
        destinationAccountId: "account-kraken-usdt",
        confirmed: true,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(count(sqlite, "ledger_events")).toBe(0);
    expect(count(sqlite, "external_import_links")).toBe(0);
  });

  it("reconciles an exact observation only after explicit confirmation", async () => {
    const { runtime, service } = setup();
    await service.syncNow("connection-kraken");
    createAccount("account-kraken-btc", "seed-asset-btc");
    const mappings = new ExternalMappingService(database!.context, runtime);
    await mappings.updateMapping({
      connectionId: "connection-kraken",
      providerAssetKey: "XXBT",
      mappingStatus: "mapped",
      talliAssetId: "seed-asset-btc",
      talliAccountId: "account-kraken-btc",
    });
    insertSnapshot(database!.context.db, {
      id: "initial-btc-snapshot",
      accountId: "account-kraken-btc",
      asOf: "2026-08-11T11:00:00.000Z",
      balanceAtomic: "50000000",
      note: null,
      createdAt: "2026-08-11T11:00:00.000Z",
      updatedAt: "2026-08-11T11:00:00.000Z",
    });
    await service.syncNow("connection-kraken");
    const sqlite = database!.context.sqlite;
    const observationId = rowId(
      sqlite,
      "select id from external_balance_observations where provider_asset_key = 'XXBT' and precision_status = 'exact' order by rowid desc limit 1",
    );
    const reconciliation = new ExternalReconciliationService(
      database!.context,
      runtime,
    );

    await expect(
      reconciliation.reconcileObservation({
        observationId,
        accountId: "account-kraken-btc",
        confirmed: false,
      } as unknown as Parameters<
        ExternalReconciliationService["reconcileObservation"]
      >[0]),
    ).rejects.toMatchObject({
      code: "EXTERNAL_RECONCILIATION_CONFIRMATION_REQUIRED",
    });
    expect(count(sqlite, "balance_snapshots")).toBe(1);

    const result = await reconciliation.reconcileObservation({
      observationId,
      accountId: "account-kraken-btc",
      confirmed: true,
    });
    expect(result).toMatchObject({
      ledgerBeforeAtomic: 50000000n,
      externalAtomic: 50200000n,
      differenceAtomic: 200000n,
    });
    expect(count(sqlite, "balance_snapshots")).toBe(2);
    expect(count(sqlite, "ledger_events")).toBe(0);
    expect(count(sqlite, "ledger_entries")).toBe(0);
  });
});
