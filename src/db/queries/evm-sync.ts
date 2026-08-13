import { and, eq } from "drizzle-orm";

import {
  assertEvmChainNetwork,
  evmErc20AssetKey,
  evmNativeAssetKey,
  isEvmChainId,
  normalizeEvmAddress,
  parseEvmAssetKey,
  type EvmChainId,
} from "../../domain/evm";
import { canonicalUtcInstantValue } from "../../domain/time";
import { assertAtomicDbText, PersistenceIntegrityError } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import {
  evmBalanceObservationDetails,
  evmCandidateDetails,
  evmL2GasFeeDetails,
  evmWalletConnections,
  evmWalletConnectionState,
} from "../schema";

const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

function assertUnsignedIntegerText(value: string | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new PersistenceIntegrityError(
      "EVM block or raw amount must be unsigned base-10 integer text.",
    );
  }
  BigInt(value);
}

export function insertEvmWalletConnection(
  executor: DatabaseExecutor,
  value: typeof evmWalletConnections.$inferInsert,
): void {
  if (
    !isEvmChainId(value.chainId) ||
    assertEvmChainNetwork(value.chainId, value.networkId) !== value.networkId ||
    value.dataProvider !== "alchemy" ||
    normalizeEvmAddress(value.addressLower) !== value.addressLower
  ) {
    throw new PersistenceIntegrityError(
      "EVM wallet connection must use a canonical production chain identity.",
    );
  }
  canonicalUtcInstantValue(value.historyStartAt);
  canonicalUtcInstantValue(value.createdAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor.insert(evmWalletConnections).values(value).run();
}

export function findEvmWalletConnection(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(evmWalletConnections)
    .where(eq(evmWalletConnections.connectionId, connectionId))
    .get();
}

export function findEvmWalletConnectionByAddress(
  executor: DatabaseExecutor,
  chainId: EvmChainId,
  addressLower: string,
) {
  return executor
    .select()
    .from(evmWalletConnections)
    .where(
      and(
        eq(evmWalletConnections.chainId, chainId),
        eq(
          evmWalletConnections.addressLower,
          normalizeEvmAddress(addressLower),
        ),
      ),
    )
    .get();
}

export function listEvmWalletConnections(executor: DatabaseExecutor) {
  return executor.select().from(evmWalletConnections).all();
}

export function ensureEvmWalletConnectionState(
  executor: DatabaseExecutor,
  connectionId: string,
  updatedAt: string,
): void {
  canonicalUtcInstantValue(updatedAt);
  executor
    .insert(evmWalletConnectionState)
    .values({ connectionId, updatedAt })
    .onConflictDoNothing({ target: evmWalletConnectionState.connectionId })
    .run();
}

export function findEvmWalletConnectionState(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  return executor
    .select()
    .from(evmWalletConnectionState)
    .where(eq(evmWalletConnectionState.connectionId, connectionId))
    .get();
}

export function updateEvmWalletConnectionState(
  executor: DatabaseExecutor,
  connectionId: string,
  value: Partial<
    Omit<
      typeof evmWalletConnectionState.$inferInsert,
      "connectionId" | "updatedAt"
    >
  > & { updatedAt: string },
): void {
  assertUnsignedIntegerText(value.lastFinalizedBlockText);
  if (value.lastBalanceSyncAt)
    canonicalUtcInstantValue(value.lastBalanceSyncAt);
  if (value.lastActivitySyncAt)
    canonicalUtcInstantValue(value.lastActivitySyncAt);
  if (value.traceCheckedAt) canonicalUtcInstantValue(value.traceCheckedAt);
  canonicalUtcInstantValue(value.updatedAt);
  executor
    .update(evmWalletConnectionState)
    .set(value)
    .where(eq(evmWalletConnectionState.connectionId, connectionId))
    .run();
}

export function insertEvmBalanceObservationDetail(
  executor: DatabaseExecutor,
  value: typeof evmBalanceObservationDetails.$inferInsert,
): void {
  if (!isEvmChainId(value.chainId)) {
    throw new PersistenceIntegrityError(
      "EVM observation chain is unsupported.",
    );
  }
  const asset =
    value.assetKind === "native"
      ? parseEvmAssetKey(evmNativeAssetKey(value.chainId))
      : parseEvmAssetKey(
          evmErc20AssetKey(value.chainId, value.contractAddressLower ?? ""),
        );
  if (
    asset.chainId !== value.chainId ||
    asset.kind !== value.assetKind ||
    asset.contractAddressLower !== (value.contractAddressLower ?? null)
  ) {
    throw new PersistenceIntegrityError(
      "EVM observation detail identity is inconsistent.",
    );
  }
  assertAtomicDbText(value.rawAmountAtomicText);
  if (BigInt(value.rawAmountAtomicText) < 0n) {
    throw new PersistenceIntegrityError(
      "EVM raw balance amount cannot be negative.",
    );
  }
  if (
    value.tokenDecimals !== null &&
    value.tokenDecimals !== undefined &&
    (!Number.isInteger(value.tokenDecimals) ||
      value.tokenDecimals < 0 ||
      value.tokenDecimals > 255)
  ) {
    throw new PersistenceIntegrityError(
      "EVM token decimals must be null or an integer between 0 and 255.",
    );
  }
  if (value.assetKind === "native" && value.tokenDecimals !== 18) {
    throw new PersistenceIntegrityError(
      "Native EVM observations must use 18 decimals.",
    );
  }
  assertUnsignedIntegerText(value.syncHeadBlockText);
  executor.insert(evmBalanceObservationDetails).values(value).run();
}

export function findEvmBalanceObservationDetail(
  executor: DatabaseExecutor,
  observationId: string,
) {
  return executor
    .select()
    .from(evmBalanceObservationDetails)
    .where(eq(evmBalanceObservationDetails.observationId, observationId))
    .get();
}

export function upsertEvmCandidateDetail(
  executor: DatabaseExecutor,
  value: typeof evmCandidateDetails.$inferInsert,
): void {
  if (!isEvmChainId(value.chainId)) {
    throw new PersistenceIntegrityError(
      "EVM candidate must use a supported production chain.",
    );
  }
  if (
    (value.chainId === 1 && value.nativeTraceStatus !== "not_required") ||
    (value.chainId !== 1 &&
      value.candidateKind === "movement" &&
      value.nativeTraceStatus !== "exact")
  ) {
    throw new PersistenceIntegrityError(
      "EVM candidate trace status is inconsistent with its chain and kind.",
    );
  }
  assertUnsignedIntegerText(value.blockNumberText);
  if (value.blockTimestamp) canonicalUtcInstantValue(value.blockTimestamp);
  if (value.gasFeeAtomicText !== null && value.gasFeeAtomicText !== undefined) {
    assertAtomicDbText(value.gasFeeAtomicText);
    if (BigInt(value.gasFeeAtomicText) < 0n) {
      throw new PersistenceIntegrityError(
        "EVM gas fee atomic amount cannot be negative.",
      );
    }
  }
  executor
    .insert(evmCandidateDetails)
    .values(value)
    .onConflictDoUpdate({
      target: evmCandidateDetails.candidateId,
      set: {
        chainId: value.chainId,
        txHash: value.txHash,
        candidateKind: value.candidateKind,
        classification: value.classification,
        txStatus: value.txStatus,
        blockNumberText: value.blockNumberText,
        blockTimestamp: value.blockTimestamp,
        fromAddressLower: value.fromAddressLower,
        toAddressLower: value.toAddressLower,
        gasFeeAtomicText: value.gasFeeAtomicText,
        gasFeeStatus: value.gasFeeStatus,
        nativeTraceStatus: value.nativeTraceStatus,
      },
    })
    .run();
}

function assertOptionalUnsignedAtomicText(
  value: string | null | undefined,
  label: string,
): bigint | null {
  if (value === null || value === undefined) return null;
  assertAtomicDbText(value);
  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new PersistenceIntegrityError(`${label} cannot be negative.`);
  }
  return parsed;
}

export function upsertEvmL2GasFeeDetail(
  executor: DatabaseExecutor,
  value: typeof evmL2GasFeeDetails.$inferInsert,
): void {
  const execution = assertOptionalUnsignedAtomicText(
    value.executionFeeAtomicText,
    "L2 execution fee",
  );
  const parent = assertOptionalUnsignedAtomicText(
    value.parentDataFeeAtomicText,
    "L2 parent data fee",
  );
  const operator = assertOptionalUnsignedAtomicText(
    value.operatorFeeAtomicText,
    "L2 operator fee",
  );
  const total = assertOptionalUnsignedAtomicText(
    value.totalFeeAtomicText,
    "L2 total fee",
  );
  let evidence: unknown;
  try {
    evidence = JSON.parse(value.evidenceJson);
  } catch {
    throw new PersistenceIntegrityError("L2 gas fee evidence must be JSON.");
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new PersistenceIntegrityError(
      "L2 gas fee evidence must be a JSON object.",
    );
  }
  const expectedModel =
    value.chainId === 8453
      ? "base_op_stack"
      : value.chainId === 42161
        ? "arbitrum_nitro"
        : null;
  if (!expectedModel || value.feeModel !== expectedModel) {
    throw new PersistenceIntegrityError(
      "L2 gas fee chain and model are inconsistent.",
    );
  }
  if (value.feeStatus === "exact") {
    if (
      execution === null ||
      parent === null ||
      total === null ||
      (value.chainId === 8453 && operator === null) ||
      (value.chainId === 42161 && operator !== null) ||
      execution + parent + (operator ?? 0n) !== total
    ) {
      throw new PersistenceIntegrityError(
        "Exact L2 gas fee components must sum to total.",
      );
    }
  } else if (total !== null) {
    throw new PersistenceIntegrityError(
      "Unresolved L2 gas fee cannot contain an exact total.",
    );
  }
  executor
    .insert(evmL2GasFeeDetails)
    .values(value)
    .onConflictDoUpdate({
      target: evmL2GasFeeDetails.candidateId,
      set: {
        chainId: value.chainId,
        feeModel: value.feeModel,
        executionFeeAtomicText: value.executionFeeAtomicText,
        parentDataFeeAtomicText: value.parentDataFeeAtomicText,
        operatorFeeAtomicText: value.operatorFeeAtomicText,
        totalFeeAtomicText: value.totalFeeAtomicText,
        feeStatus: value.feeStatus,
        evidenceJson: value.evidenceJson,
      },
    })
    .run();
}

export function findEvmL2GasFeeDetail(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(evmL2GasFeeDetails)
    .where(eq(evmL2GasFeeDetails.candidateId, candidateId))
    .get();
}

export function findEvmCandidateDetail(
  executor: DatabaseExecutor,
  candidateId: string,
) {
  return executor
    .select()
    .from(evmCandidateDetails)
    .where(eq(evmCandidateDetails.candidateId, candidateId))
    .get();
}
