import { afterEach, describe, expect, it } from "vitest";

import {
  findEvmWalletConnectionState,
  listExternalBalanceObservations,
  listExternalCandidates,
  listExternalSyncRuns,
  readBackupData,
} from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { BackupValidationError } from "../../domain/backup";
import { evmErc20AssetKey, evmNativeAssetKey } from "../../domain/evm";
import type {
  EvmReadOnlyProvider,
  EvmSyncInput,
  EvmSyncSnapshot,
} from "../../providers/evm/types";
import { BackupService } from "../../services/backup-service";
import { EvmWalletService } from "../../services/evm-wallet-service";
import { createTestDatabase, type TestDatabase } from "./test-database";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TX_HASH = `0x${"b".repeat(64)}`;

function baseSnapshot(
  completedAt = "2026-08-13T04:00:00.000Z",
): EvmSyncSnapshot {
  return {
    chainId: 8453,
    balanceObservedAt: completedAt,
    syncCompletedAt: completedAt,
    addressLower: WALLET,
    syncHeadBlockText: "34000100",
    finalizedBlockText: "34000098",
    balanceComplete: true,
    balanceIssues: [],
    balances: [
      {
        providerAssetKey: evmNativeAssetKey(8453),
        assetKind: "native",
        contractAddressLower: null,
        rawAmountAtomicText: "1490000000000000000",
        decimals: 18,
        amountText: "1.49",
        displayCode: "ETH",
        name: "Base",
      },
    ],
    transfers: [
      {
        uniqueId: "base-usdc-out",
        txHash: TX_HASH,
        category: "erc20",
        fromAddressLower: WALLET,
        toAddressLower: OTHER,
        providerAssetKey: evmErc20AssetKey(8453, BASE_USDC),
        contractAddressLower: BASE_USDC,
        rawAmountAtomicText: "100000000",
        decimals: 6,
        amountText: "100",
        displayCode: "USDC",
        blockNumberText: "34000097",
        occurredAt: "2026-08-13T03:55:00.000Z",
        humanValue: 999999999,
      },
    ],
    transactions: [
      {
        transaction: {
          txHash: TX_HASH,
          fromAddressLower: WALLET,
          toAddressLower: OTHER,
          typeHex: "0x2",
          valueHex: "0x0",
          blockNumberText: "34000097",
        },
        receipt: {
          txHash: TX_HASH,
          statusHex: "0x1",
          gasUsedHex: "0x186a0",
          effectiveGasPriceHex: "0x3b9aca00",
          blobGasUsedHex: null,
          blobGasPriceHex: null,
          gasUsedForL1Hex: null,
          blockNumberText: "34000097",
        },
        nativeTrace: {
          status: "exact",
          frames: [
            {
              path: "0",
              type: "CALL",
              fromAddressLower: WALLET,
              toAddressLower: OTHER,
              rawAmountAtomicText: "0",
              reverted: false,
            },
            {
              path: "0.0",
              type: "CALL",
              fromAddressLower: OTHER,
              toAddressLower: WALLET,
              rawAmountAtomicText: "40000000000000000",
              reverted: false,
            },
          ],
        },
        l2GasFee: {
          chainId: 8453,
          feeModel: "base_op_stack",
          status: "exact",
          executionFeeAtomicText: "100000000000000",
          parentDataFeeAtomicText: "30000000000000",
          operatorFeeAtomicText: "5000000000000",
          totalFeeAtomicText: "135000000000000",
          evidenceJson: '{"source":"fixture"}',
        },
      },
    ],
    activityCapability: {
      traceCapability: "trace_available",
      historyCoverage: "discovery_limited",
      activityStatus: "complete",
      activityStartBlockText: "0",
    },
  };
}

class MutableProvider implements EvmReadOnlyProvider {
  readonly calls: EvmSyncInput[] = [];

  constructor(public snapshot: EvmSyncSnapshot) {}

  async fetchSnapshot(input: EvmSyncInput): Promise<EvmSyncSnapshot> {
    this.calls.push(input);
    return this.snapshot;
  }
}

describe("V4.1 L2 wallet sync persistence", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  function setup() {
    database = createTestDatabase();
    seedDatabase(database.context);
    let sequence = 0;
    let now = "2026-08-13T04:00:00.000Z";
    const provider = new MutableProvider(baseSnapshot());
    const service = new EvmWalletService(
      database.context,
      (_connectionId, chainId) => {
        expect(chainId).toBe(8453);
        return provider;
      },
      {
        id: () => `v41-id-${String(++sequence).padStart(4, "0")}`,
        now: () => now,
      },
    );
    return {
      provider,
      service,
      setNow(value: string) {
        now = value;
      },
    };
  }

  async function createBaseWallet(service: EvmWalletService) {
    return service.createWallet({
      bookId: "seed-book-default",
      name: "Base wallet",
      chainId: 8453,
      publicAddress: WALLET,
      historyStartAt: "2025-01-01T00:00:00.000Z",
    });
  }

  it("allows one public address on different chains but rejects same-chain duplicates", async () => {
    const { service } = setup();
    await createBaseWallet(service);
    await expect(
      service.createWallet({
        bookId: "seed-book-default",
        name: "Ethereum wallet",
        chainId: 1,
        publicAddress: WALLET,
        historyStartAt: "2025-01-01T00:00:00.000Z",
      }),
    ).resolves.toMatch(/^v41-id-/);
    await expect(
      service.createWallet({
        bookId: "seed-book-default",
        name: "Arbitrum wallet",
        chainId: 42161,
        publicAddress: WALLET,
        historyStartAt: "2025-01-01T00:00:00.000Z",
      }),
    ).resolves.toMatch(/^v41-id-/);
    await expect(createBaseWallet(service)).rejects.toMatchObject({
      code: "EVM_WALLET_DUPLICATE",
    });
  });

  it("persists traced L2 candidates and exact fee details without Ledger writes", async () => {
    const { provider, service } = setup();
    const connectionId = await createBaseWallet(service);
    const ledgerBefore = database!.context.sqlite
      .prepare("select count(*) as count from ledger_events")
      .get();

    await expect(service.syncNow(connectionId)).resolves.toMatchObject({
      status: "success",
      activityStatus: "complete",
      sourceObjectsSeen: 2,
      candidatesCreated: 2,
    });
    expect(provider.calls[0]).toMatchObject({
      chainId: 8453,
      previousTraceCapability: "unknown",
      lastFinalizedBlockText: null,
    });
    expect(
      listExternalCandidates(database!.context.db, connectionId).map(
        (candidate) => candidate.stableKey,
      ),
    ).toEqual([`evm:8453:gas:${TX_HASH}`, `evm:8453:movement:${TX_HASH}`]);
    expect(
      database!.context.sqlite
        .prepare(
          "select chain_id as chainId, fee_model as feeModel, total_fee_atomic_text as totalFeeAtomicText from evm_l2_gas_fee_details",
        )
        .get(),
    ).toEqual({
      chainId: 8453,
      feeModel: "base_op_stack",
      totalFeeAtomicText: "135000000000000",
    });
    expect(
      database!.context.sqlite
        .prepare(
          "select native_trace_status as nativeTraceStatus from evm_candidate_details where candidate_kind='movement'",
        )
        .get(),
    ).toEqual({ nativeTraceStatus: "exact" });
    expect(
      findEvmWalletConnectionState(database!.context.db, connectionId),
    ).toMatchObject({
      lastFinalizedBlockText: "34000098",
      traceCapabilityStatus: "trace_available",
    });
    expect(
      database!.context.sqlite
        .prepare("select count(*) as count from ledger_events")
        .get(),
    ).toEqual(ledgerBefore);
  });

  it("saves balances but no activity and does not advance the cursor when Debug is unavailable", async () => {
    const { provider, service, setNow } = setup();
    const connectionId = await createBaseWallet(service);
    await service.syncNow(connectionId);
    const beforeState = findEvmWalletConnectionState(
      database!.context.db,
      connectionId,
    )!;
    const beforeCounts = {
      balances: listExternalBalanceObservations(
        database!.context.db,
        connectionId,
      ).length,
      candidates: listExternalCandidates(database!.context.db, connectionId)
        .length,
    };
    setNow("2026-08-13T05:00:00.000Z");
    provider.snapshot = {
      ...baseSnapshot("2026-08-13T05:00:00.000Z"),
      finalizedBlockText: "34000198",
      transfers: [],
      transactions: [],
      activityCapability: {
        traceCapability: "trace_unavailable",
        historyCoverage: "discovery_limited",
        activityStatus: "trace_unavailable",
        activityStartBlockText: "0",
      },
    };

    await expect(service.syncNow(connectionId)).resolves.toMatchObject({
      status: "partial",
      activityStatus: "trace_unavailable",
      sourceObjectsSeen: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
    });
    const afterState = findEvmWalletConnectionState(
      database!.context.db,
      connectionId,
    )!;
    expect(afterState).toMatchObject({
      lastFinalizedBlockText: beforeState.lastFinalizedBlockText,
      lastActivitySyncAt: beforeState.lastActivitySyncAt,
      traceCapabilityStatus: "trace_unavailable",
      traceCheckedAt: "2026-08-13T05:00:00.000Z",
    });
    expect(
      listExternalBalanceObservations(database!.context.db, connectionId),
    ).toHaveLength(beforeCounts.balances + 1);
    expect(
      listExternalCandidates(database!.context.db, connectionId),
    ).toHaveLength(beforeCounts.candidates);
    expect(
      listExternalSyncRuns(database!.context.db, connectionId)[0],
    ).toMatchObject({
      status: "partial",
      errorCode: "EVM_L2_TRACE_UNAVAILABLE",
    });
  });

  it("round-trips V5 fee provenance and rejects a late arithmetic corruption", async () => {
    const { service } = setup();
    const connectionId = await createBaseWallet(service);
    await service.syncNow(connectionId);
    const payload = new BackupService(database!.context).exportBackup();
    expect(payload.schemaVersion).toBe(5);
    expect(payload.data.evmL2GasFeeDetails).toHaveLength(1);

    const target = createTestDatabase();
    try {
      new BackupService(target.context).restore(payload);
      expect(readBackupData(target.context.db)).toEqual(
        readBackupData(database!.context.db),
      );
      expect(target.context.sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      target.close();
    }

    const corrupted = structuredClone(payload);
    corrupted.data.evmL2GasFeeDetails[0]!.totalFeeAtomicText = "1";
    expect(() =>
      new BackupService(database!.context).parseJson(JSON.stringify(corrupted)),
    ).toThrow(BackupValidationError);
  });

  it("rolls every restored layer back when the final V5 fee insert fails", async () => {
    const { service } = setup();
    const connectionId = await createBaseWallet(service);
    await service.syncNow(connectionId);
    const payload = new BackupService(database!.context).exportBackup();
    const target = createTestDatabase();

    try {
      target.context.sqlite.exec(`
        CREATE TRIGGER fail_v5_fee_restore
        BEFORE INSERT ON evm_l2_gas_fee_details
        BEGIN
          SELECT RAISE(ABORT, 'forced late V5 fee restore failure');
        END;
      `);
      expect(() => new BackupService(target.context).restore(payload)).toThrow(
        "forced late V5 fee restore failure",
      );
      const restored = readBackupData(target.context.db);
      expect(restored.books).toEqual([]);
      expect(restored.externalConnections).toEqual([]);
      expect(restored.evmWalletConnections).toEqual([]);
      expect(restored.evmCandidateDetails).toEqual([]);
      expect(restored.evmL2GasFeeDetails).toEqual([]);
    } finally {
      target.close();
    }
  });
});
