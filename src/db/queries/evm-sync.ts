import { eq } from "drizzle-orm";

import { normalizeEvmAddress, parseEvmAssetKey } from "../../domain/evm";
import { canonicalUtcInstantValue } from "../../domain/time";
import { assertAtomicDbText, PersistenceIntegrityError } from "../atomic";
import type { DatabaseExecutor } from "../connection";
import {
  evmBalanceObservationDetails,
  evmCandidateDetails,
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
    value.chainId !== 1 ||
    value.networkId !== "eth-mainnet" ||
    value.dataProvider !== "alchemy" ||
    normalizeEvmAddress(value.addressLower) !== value.addressLower
  ) {
    throw new PersistenceIntegrityError(
      "EVM wallet connection must use canonical Ethereum Mainnet identity.",
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
  addressLower: string,
) {
  return executor
    .select()
    .from(evmWalletConnections)
    .where(
      eq(evmWalletConnections.addressLower, normalizeEvmAddress(addressLower)),
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
  const asset =
    value.assetKind === "native"
      ? parseEvmAssetKey("eip155:1/native")
      : parseEvmAssetKey(`eip155:1/erc20:${value.contractAddressLower}`);
  if (
    value.chainId !== 1 ||
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
      "Native Ethereum observations must use 18 decimals.",
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
  if (value.chainId !== 1) {
    throw new PersistenceIntegrityError(
      "EVM candidate must use Ethereum Mainnet.",
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
      },
    })
    .run();
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
