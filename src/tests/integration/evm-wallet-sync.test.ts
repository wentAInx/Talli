import { afterEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../db/seed";
import {
  findEvmWalletConnection,
  findEvmWalletConnectionState,
  insertAccount,
  readBackupData,
  listExternalBalanceObservations,
  listExternalCandidates,
  listExternalSyncRuns,
} from "../../db/queries";
import { EVM_NATIVE_ASSET_KEY, evmErc20AssetKey } from "../../domain/evm";
import { BackupValidationError } from "../../domain/backup";
import type {
  EvmReadOnlyProvider,
  EvmSyncInput,
  EvmSyncSnapshot,
} from "../../providers/evm/types";
import { EvmProviderError } from "../../providers/evm/errors";
import { EvmWalletService } from "../../services/evm-wallet-service";
import { BackupService } from "../../services/backup-service";
import { ExternalImportService } from "../../services/external-import-service";
import { ExternalMappingService } from "../../services/external-mapping-service";
import { createTestDatabase, type TestDatabase } from "./test-database";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TX_HASH = `0x${"a".repeat(64)}`;
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

function fixtureSnapshot(
  fetchedAt = "2026-08-12T08:00:00.000Z",
): EvmSyncSnapshot {
  return {
    fetchedAt,
    addressLower: ADDRESS,
    syncHeadBlockText: "220",
    finalizedBlockText: "218",
    balances: [
      {
        providerAssetKey: EVM_NATIVE_ASSET_KEY,
        assetKind: "native",
        contractAddressLower: null,
        rawAmountAtomicText: "1234500000000000000",
        decimals: 18,
        amountText: "1.2345",
        displayCode: "ETH",
        name: "Ether",
      },
    ],
    transfers: [
      {
        uniqueId: `${TX_HASH}:external:0`,
        txHash: TX_HASH,
        category: "external",
        fromAddressLower: ADDRESS,
        toAddressLower: OTHER,
        providerAssetKey: EVM_NATIVE_ASSET_KEY,
        contractAddressLower: null,
        rawAmountAtomicText: "250000000000000000",
        decimals: 18,
        amountText: "0.25",
        displayCode: "ETH",
        blockNumberText: "217",
        occurredAt: "2026-08-12T07:55:00.000Z",
        humanValue: 0.25,
      },
    ],
    transactions: [
      {
        transaction: {
          txHash: TX_HASH,
          fromAddressLower: ADDRESS,
          toAddressLower: OTHER,
          typeHex: "0x2",
          valueHex: "0x3782dace9d90000",
          blockNumberText: "217",
        },
        receipt: {
          txHash: TX_HASH,
          statusHex: "0x1",
          gasUsedHex: "0x5208",
          effectiveGasPriceHex: "0x3b9aca00",
          blobGasUsedHex: null,
          blobGasPriceHex: null,
          blockNumberText: "217",
        },
      },
    ],
  };
}

class FixtureProvider implements EvmReadOnlyProvider {
  calls: EvmSyncInput[] = [];
  failure: Error | null = null;

  constructor(
    private readonly database: TestDatabase,
    private current: EvmSyncSnapshot,
  ) {}

  setSnapshot(snapshot: EvmSyncSnapshot): void {
    this.current = snapshot;
  }

  async fetchSnapshot(input: EvmSyncInput): Promise<EvmSyncSnapshot> {
    expect(this.database.context.sqlite.inTransaction).toBe(false);
    this.calls.push(input);
    if (this.failure) throw this.failure;
    return this.current;
  }
}

function count(database: TestDatabase, table: string): number {
  return (
    database.context.sqlite
      .prepare(`select count(*) as count from ${table}`)
      .get() as { count: number }
  ).count;
}

describe("EVM wallet sync persistence", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  function setup() {
    database = createTestDatabase();
    seedDatabase(database.context);
    let id = 0;
    let now = "2026-08-12T08:00:00.000Z";
    const runtime = {
      id: () => `evm-id-${String(++id).padStart(4, "0")}`,
      now: () => now,
    };
    const provider = new FixtureProvider(database, fixtureSnapshot());
    const service = new EvmWalletService(
      database.context,
      () => provider,
      runtime,
    );
    return {
      provider,
      runtime,
      service,
      setNow: (value: string) => {
        now = value;
      },
    };
  }

  async function syncAndMapEth() {
    const initialized = setup();
    const connectionId = await createWallet(initialized.service);
    await initialized.service.syncNow(connectionId);
    const now = "2026-08-12T08:00:00.000Z";
    insertAccount(database!.context.db, {
      id: "account-ethereum-eth",
      bookId: "seed-book-default",
      assetId: "seed-asset-eth",
      name: "Ethereum ETH",
      accountType: "crypto_wallet",
      institutionName: "Ethereum",
      note: null,
      isArchived: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const mappings = new ExternalMappingService(
      database!.context,
      initialized.runtime,
    );
    await mappings.updateMapping({
      connectionId,
      providerAssetKey: EVM_NATIVE_ASSET_KEY,
      mappingStatus: "mapped",
      talliAssetId: "seed-asset-eth",
      talliAccountId: "account-ethereum-eth",
    });
    await initialized.service.syncNow(connectionId);
    return { ...initialized, connectionId };
  }

  async function createWallet(service: EvmWalletService): Promise<string> {
    return service.createWallet({
      bookId: "seed-book-default",
      name: "Cold wallet",
      publicAddress: ADDRESS.toUpperCase().replace("0X", "0x"),
      historyStartAt: "2026-01-01T00:00:00.000Z",
    });
  }

  it("accepts only a unique public address and stores canonical mainnet identity", async () => {
    const { service } = setup();
    const connectionId = await createWallet(service);

    expect(
      findEvmWalletConnection(database!.context.db, connectionId),
    ).toMatchObject({
      addressLower: ADDRESS,
      chainId: 1,
      networkId: "eth-mainnet",
      dataProvider: "alchemy",
    });
    await expect(createWallet(service)).rejects.toMatchObject({
      code: "EVM_WALLET_DUPLICATE",
    });
    await expect(
      service.createWallet({
        bookId: "seed-book-default",
        name: "Secret-shaped input",
        publicAddress:
          "test test test test test test test test test test test junk",
        historyStartAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(/address/i);
  });

  it("persists observations and separate movement/gas candidates without Ledger writes", async () => {
    const { provider, service } = setup();
    const connectionId = await createWallet(service);
    const beforeLedger = count(database!, "ledger_events");
    const beforeSnapshots = count(database!, "balance_snapshots");

    await expect(service.syncNow(connectionId)).resolves.toMatchObject({
      balancesSeen: 1,
      sourceObjectsSeen: 2,
      candidatesCreated: 2,
      candidatesUpdated: 0,
    });

    expect(count(database!, "ledger_events")).toBe(beforeLedger);
    expect(count(database!, "balance_snapshots")).toBe(beforeSnapshots);
    expect(
      listExternalBalanceObservations(database!.context.db, connectionId),
    ).toHaveLength(1);
    expect(
      listExternalCandidates(database!.context.db, connectionId).map(
        (candidate) => candidate.stableKey,
      ),
    ).toEqual([`evm:1:gas:${TX_HASH}`, `evm:1:movement:${TX_HASH}`]);
    expect(
      findEvmWalletConnectionState(database!.context.db, connectionId),
    ).toMatchObject({
      lastFinalizedBlockText: "218",
    });
    expect(provider.calls[0]).toMatchObject({
      address: ADDRESS,
      lastFinalizedBlockText: null,
    });
  });

  it("keeps source and candidate identities stable across ten syncs while observations remain append-only", async () => {
    const { provider, service, setNow } = setup();
    const connectionId = await createWallet(service);

    for (let index = 0; index < 10; index += 1) {
      const stamp = `2026-08-12T08:${String(index).padStart(2, "0")}:00.000Z`;
      setNow(stamp);
      provider.setSnapshot(fixtureSnapshot(stamp));
      await service.syncNow(connectionId);
    }

    expect(count(database!, "external_source_objects")).toBe(2);
    expect(count(database!, "external_transaction_candidates")).toBe(2);
    expect(count(database!, "external_balance_observations")).toBe(10);
    expect(
      listExternalSyncRuns(database!.context.db, connectionId),
    ).toHaveLength(10);
    expect(provider.calls.at(-1)?.lastFinalizedBlockText).toBe("218");
  });

  it("records a safe failed run but commits no partial provider facts or cursor", async () => {
    const { provider, service, setNow } = setup();
    const connectionId = await createWallet(service);
    await service.syncNow(connectionId);
    const facts = {
      observations: count(database!, "external_balance_observations"),
      sources: count(database!, "external_source_objects"),
      candidates: count(database!, "external_transaction_candidates"),
    };

    setNow("2026-08-12T09:00:00.000Z");
    provider.failure = new EvmProviderError(
      "PAGINATION_EXPIRED",
      "Alchemy pagination expired; retry the complete sync.",
    );
    await expect(service.syncNow(connectionId)).rejects.toMatchObject({
      code: "PAGINATION_EXPIRED",
    });

    expect(count(database!, "external_balance_observations")).toBe(
      facts.observations,
    );
    expect(count(database!, "external_source_objects")).toBe(facts.sources);
    expect(count(database!, "external_transaction_candidates")).toBe(
      facts.candidates,
    );
    expect(
      findEvmWalletConnectionState(database!.context.db, connectionId),
    ).toMatchObject({
      lastFinalizedBlockText: "218",
    });
    expect(
      listExternalSyncRuns(database!.context.db, connectionId)[0],
    ).toMatchObject({
      status: "error",
      errorCode: "PAGINATION_EXPIRED",
    });
  });

  it("does not turn a later zero/absent ERC-20 balance into destructive history", async () => {
    const { provider, service } = setup();
    const connectionId = await createWallet(service);
    const withToken = fixtureSnapshot();
    withToken.balances.push({
      providerAssetKey: evmErc20AssetKey(USDC),
      assetKind: "erc20",
      contractAddressLower: USDC,
      rawAmountAtomicText: "1000000",
      decimals: 6,
      amountText: "1",
      displayCode: "USDC",
      name: "USD Coin",
    });
    provider.setSnapshot(withToken);
    await service.syncNow(connectionId);

    provider.setSnapshot(fixtureSnapshot("2026-08-12T09:00:00.000Z"));
    await service.syncNow(connectionId);

    const tokenObservations = listExternalBalanceObservations(
      database!.context.db,
      connectionId,
    ).filter((row) => row.providerAssetKey === evmErc20AssetKey(USDC));
    expect(tokenObservations).toHaveLength(1);
    expect(tokenObservations[0]?.providerAmountText).toBe("1");
  });

  it("imports the separate gas candidate only as an explicit V1 expense", async () => {
    const { connectionId, runtime } = await syncAndMapEth();
    const gas = listExternalCandidates(database!.context.db, connectionId).find(
      (candidate) => candidate.stableKey.includes(":gas:"),
    )!;
    expect(gas.status).toBe("pending");
    const importer = new ExternalImportService(database!.context, runtime);

    await expect(
      importer.importCandidate({
        candidateId: gas.id,
        chosenEventType: "income",
        mainAccountId: "account-ethereum-eth",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EVM_IMPORT_EVENT_TYPE_INVALID" });
    expect(count(database!, "ledger_events")).toBe(0);

    const imported = await importer.importCandidate({
      candidateId: gas.id,
      chosenEventType: "expense",
      mainAccountId: "account-ethereum-eth",
      confirmed: true,
    });
    expect(
      database!.context.sqlite
        .prepare(
          "select event_type as eventType, payee from ledger_events where id = ?",
        )
        .get(imported.ledgerEventId),
    ).toEqual({ eventType: "expense", payee: "Ethereum Network" });
    expect(count(database!, "ledger_entries")).toBe(1);
    expect(count(database!, "external_import_links")).toBe(1);
  });

  it("rolls back an EVM Ledger event when provenance insertion fails late", async () => {
    const { connectionId, runtime } = await syncAndMapEth();
    const gas = listExternalCandidates(database!.context.db, connectionId).find(
      (candidate) => candidate.stableKey.includes(":gas:"),
    )!;
    database!.context.sqlite.exec(`
      CREATE TRIGGER fail_evm_import_link
      BEFORE INSERT ON external_import_links
      BEGIN
        SELECT RAISE(ABORT, 'forced EVM provenance failure');
      END;
    `);

    const importer = new ExternalImportService(database!.context, runtime);
    await expect(
      importer.importCandidate({
        candidateId: gas.id,
        chosenEventType: "expense",
        mainAccountId: "account-ethereum-eth",
        confirmed: true,
      }),
    ).rejects.toThrow("forced EVM provenance failure");
    expect(count(database!, "ledger_events")).toBe(0);
    expect(count(database!, "ledger_entries")).toBe(0);
    expect(count(database!, "external_import_links")).toBe(0);
    expect(
      listExternalCandidates(database!.context.db, connectionId).find(
        (candidate) => candidate.id === gas.id,
      )?.status,
    ).toBe("pending");
  });

  it("never rewrites an imported Ledger event when the indexed EVM source changes", async () => {
    const { connectionId, provider, runtime, service } = await syncAndMapEth();
    const movement = listExternalCandidates(
      database!.context.db,
      connectionId,
    ).find((candidate) => candidate.stableKey.includes(":movement:"))!;
    const importer = new ExternalImportService(database!.context, runtime);
    await importer.importCandidate({
      candidateId: movement.id,
      chosenEventType: "expense",
      mainAccountId: "account-ethereum-eth",
      confirmed: true,
    });
    const ledgerBefore = database!.context.sqlite
      .prepare("select id, occurred_at as occurredAt from ledger_events")
      .all();

    const changed = fixtureSnapshot("2026-08-12T09:00:00.000Z");
    changed.transfers[0] = {
      ...changed.transfers[0]!,
      rawAmountAtomicText: "300000000000000000",
      amountText: "0.3",
      humanValue: "0.3",
    };
    provider.setSnapshot(changed);
    await service.syncNow(connectionId);

    expect(
      database!.context.sqlite
        .prepare("select id, occurred_at as occurredAt from ledger_events")
        .all(),
    ).toEqual(ledgerBefore);
    expect(
      listExternalCandidates(database!.context.db, connectionId).find(
        (candidate) => candidate.id === movement.id,
      )?.status,
    ).toBe("source_changed");
  });

  it("exports and restores V4 user facts while excluding cursors, runs, and secrets", async () => {
    const { connectionId } = await syncAndMapEth();
    const payload = new BackupService(database!.context).exportBackup();
    const json = JSON.stringify(payload);

    expect(payload.schemaVersion).toBe(4);
    expect(payload.data.evmWalletConnections).toHaveLength(1);
    expect(payload.data.evmBalanceObservationDetails).toHaveLength(2);
    expect(payload.data.evmCandidateDetails).toHaveLength(2);
    expect(payload.data.externalConnections[0]).toMatchObject({
      id: connectionId,
      provider: "evm_wallet",
      credentialRef: "env:alchemy.primary",
    });
    expect(json).not.toContain("evmWalletConnectionState");
    expect(json).not.toContain("externalSyncRuns");
    expect(json).not.toContain("lastFinalizedBlockText");
    expect(json).not.toContain("ALCHEMY_API_KEY");

    const target = createTestDatabase();
    try {
      new BackupService(target.context).restore(payload);
      expect(readBackupData(target.context.db)).toEqual(
        readBackupData(database!.context.db),
      );
      expect(target.context.sqlite.pragma("foreign_key_check")).toEqual([]);
      expect(count(target, "evm_wallet_connection_state")).toBe(0);
      expect(count(target, "external_sync_runs")).toBe(0);
    } finally {
      target.close();
    }
  });

  it("rolls every restored version layer back after a late V4 failure", async () => {
    await syncAndMapEth();
    const payload = new BackupService(database!.context).exportBackup();
    const target = createTestDatabase();
    try {
      target.context.sqlite.exec(`
        CREATE TRIGGER fail_v4_candidate_detail_restore
        BEFORE INSERT ON evm_candidate_details
        BEGIN
          SELECT RAISE(ABORT, 'forced late V4 restore failure');
        END;
      `);
      expect(() => new BackupService(target.context).restore(payload)).toThrow(
        "forced late V4 restore failure",
      );
      const restored = readBackupData(target.context.db);
      expect(restored.books).toEqual([]);
      expect(restored.externalConnections).toEqual([]);
      expect(restored.evmWalletConnections).toEqual([]);
      expect(restored.evmCandidateDetails).toEqual([]);
    } finally {
      target.close();
    }
  });

  it("rejects broken EVM backup identities before writing any target row", async () => {
    await syncAndMapEth();
    const payload = new BackupService(database!.context).exportBackup();
    const wrongSourceKey = structuredClone(payload);
    wrongSourceKey.data.externalConnections[0]!.sourceKey = "eip155:1:wrong";
    const missingWallet = structuredClone(payload);
    missingWallet.data.evmWalletConnections = [];
    const providerSourceMismatch = structuredClone(payload);
    providerSourceMismatch.data.externalSourceObjects[0]!.objectType =
      "kraken_ledger";

    const target = createTestDatabase();
    try {
      for (const invalid of [
        wrongSourceKey,
        missingWallet,
        providerSourceMismatch,
      ]) {
        expect(() =>
          new BackupService(target.context).restore(invalid),
        ).toThrow(BackupValidationError);
        expect(readBackupData(target.context.db).books).toEqual([]);
      }
    } finally {
      target.close();
    }
  });

  it("upgrades a schemaVersion 3 Kraken connection to the V4 source identity in memory", async () => {
    const { runtime } = setup();
    await new ExternalMappingService(
      database!.context,
      runtime,
    ).createKrakenConnection({
      bookId: "seed-book-default",
    });
    const current = new BackupService(database!.context).exportBackup();
    const legacyV3 = structuredClone(current) as unknown as {
      schemaVersion: number;
      data: Record<string, unknown> & {
        externalConnections: Array<Record<string, unknown>>;
      };
    };
    legacyV3.schemaVersion = 3;
    delete legacyV3.data.evmWalletConnections;
    delete legacyV3.data.evmBalanceObservationDetails;
    delete legacyV3.data.evmCandidateDetails;
    for (const connection of legacyV3.data.externalConnections) {
      delete connection.sourceKey;
    }

    const target = createTestDatabase();
    try {
      const preview = new BackupService(target.context).restore(legacyV3);
      expect(preview.schemaVersion).toBe(4);
      expect(
        readBackupData(target.context.db).externalConnections,
      ).toMatchObject([{ provider: "kraken", sourceKey: "kraken:primary" }]);
    } finally {
      target.close();
    }
  });
});
