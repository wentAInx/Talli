import { createHash } from "node:crypto";

import {
  calculateEthereumGasFee,
  EVM_NATIVE_ASSET_KEY,
  evmGasStableKey,
  evmMovementStableKey,
  evmRawAtomicToDecimalText,
  evmTransactionStatus,
} from "../../domain/evm";
import {
  canonicalExternalJson,
  type ExternalCandidateEventType,
  type ExternalCandidateLegDraft,
  type ExternalCandidateStatus,
} from "../../domain/external-sync";
import type { EvmEnrichedTransaction, EvmTransferRecord } from "./types";

export interface EvmSourceObjectDraft {
  objectType: "evm_transaction" | "evm_transfer";
  externalId: string;
  occurredAt: string;
  payloadJson: string;
  payloadHash: string;
}

export type EvmCandidateClassification =
  | "simple_in"
  | "simple_out"
  | "simple_exchange"
  | "gas_only"
  | "complex"
  | "unsupported";

export interface EvmCandidateDetailDraft {
  chainId: 1;
  txHash: string;
  candidateKind: "movement" | "gas";
  classification: EvmCandidateClassification;
  txStatus: "success" | "failed" | "unknown";
  blockNumberText: string | null;
  blockTimestamp: string | null;
  fromAddressLower: string;
  toAddressLower: string | null;
  gasFeeAtomicText: string | null;
  gasFeeStatus: "exact" | "not_applicable" | "unresolved";
}

export interface EvmCandidateDraft {
  stableKey: string;
  suggestedEventType: ExternalCandidateEventType;
  initialStatus: Extract<
    ExternalCandidateStatus,
    "pending" | "needs_mapping" | "unsupported"
  >;
  occurredAt: string;
  title: string;
  normalizationVersion: number;
  sourceFingerprint: string;
  primarySourceExternalIds: string[];
  crossCheckSourceExternalIds: string[];
  legs: ExternalCandidateLegDraft[];
  warnings: string[];
  detail: EvmCandidateDetailDraft;
}

export interface NormalizedEvmActivity {
  sources: EvmSourceObjectDraft[];
  candidates: EvmCandidateDraft[];
}

function hash(payloadJson: string): string {
  return createHash("sha256").update(payloadJson).digest("hex");
}

function sourceFingerprint(sources: readonly EvmSourceObjectDraft[]): string {
  return createHash("sha256")
    .update(
      sources
        .map(
          (source) =>
            `${source.objectType}:${source.externalId}:${source.payloadHash}`,
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");
}

function transactionSource(
  enriched: EvmEnrichedTransaction,
  occurredAt: string,
): EvmSourceObjectDraft {
  const payloadJson = canonicalExternalJson({
    transaction: {
      hash: enriched.transaction.txHash,
      from: enriched.transaction.fromAddressLower,
      to: enriched.transaction.toAddressLower,
      type: enriched.transaction.typeHex,
      value: enriched.transaction.valueHex,
      blockNumber: enriched.transaction.blockNumberText,
    },
    receipt: {
      transactionHash: enriched.receipt.txHash,
      status: enriched.receipt.statusHex,
      gasUsed: enriched.receipt.gasUsedHex,
      effectiveGasPrice: enriched.receipt.effectiveGasPriceHex,
      blobGasUsed: enriched.receipt.blobGasUsedHex,
      blobGasPrice: enriched.receipt.blobGasPriceHex,
      blockNumber: enriched.receipt.blockNumberText,
    },
  });
  return {
    objectType: "evm_transaction",
    externalId: enriched.transaction.txHash,
    occurredAt,
    payloadJson,
    payloadHash: hash(payloadJson),
  };
}

function transferSource(transfer: EvmTransferRecord): EvmSourceObjectDraft {
  const payloadJson = canonicalExternalJson({
    uniqueId: transfer.uniqueId,
    hash: transfer.txHash,
    category: transfer.category,
    from: transfer.fromAddressLower,
    to: transfer.toAddressLower,
    providerAssetKey: transfer.providerAssetKey,
    contractAddress: transfer.contractAddressLower,
    rawAmountAtomic: transfer.rawAmountAtomicText,
    decimals: transfer.decimals,
    amount: transfer.amountText,
    displayCode: transfer.displayCode,
    blockNumber: transfer.blockNumberText,
    blockTimestamp: transfer.occurredAt,
    providerHumanValue: transfer.humanValue,
  });
  return {
    objectType: "evm_transfer",
    externalId: transfer.uniqueId,
    occurredAt: transfer.occurredAt,
    payloadJson,
    payloadHash: hash(payloadJson),
  };
}

interface NetMovement {
  providerAssetKey: string;
  rawAtomic: bigint;
  decimals: number | null;
  inconsistentDecimals: boolean;
}

function netMovements(
  transfers: readonly EvmTransferRecord[],
  walletAddress: string,
): NetMovement[] {
  const net = new Map<string, NetMovement>();
  for (const transfer of transfers) {
    const existing = net.get(transfer.providerAssetKey) ?? {
      providerAssetKey: transfer.providerAssetKey,
      rawAtomic: 0n,
      decimals: transfer.decimals,
      inconsistentDecimals: false,
    };
    if (existing.decimals !== transfer.decimals) {
      existing.inconsistentDecimals = true;
      existing.decimals = null;
    }
    const rawAtomic = BigInt(transfer.rawAmountAtomicText);
    if (transfer.fromAddressLower === walletAddress) {
      existing.rawAtomic -= rawAtomic;
    }
    if (transfer.toAddressLower === walletAddress) {
      existing.rawAtomic += rawAtomic;
    }
    net.set(transfer.providerAssetKey, existing);
  }
  return [...net.values()]
    .filter((movement) => movement.rawAtomic !== 0n)
    .sort((left, right) =>
      left.providerAssetKey.localeCompare(right.providerAssetKey),
    );
}

function movementShape(movements: readonly NetMovement[]): {
  classification: Exclude<EvmCandidateClassification, "gas_only">;
  suggestedEventType: ExternalCandidateEventType;
} {
  if (movements.length === 1 && movements[0]!.rawAtomic > 0n) {
    return { classification: "simple_in", suggestedEventType: "unknown" };
  }
  if (movements.length === 1 && movements[0]!.rawAtomic < 0n) {
    return { classification: "simple_out", suggestedEventType: "unknown" };
  }
  if (
    movements.length === 2 &&
    movements.filter((movement) => movement.rawAtomic < 0n).length === 1 &&
    movements.filter((movement) => movement.rawAtomic > 0n).length === 1
  ) {
    return {
      classification: "simple_exchange",
      suggestedEventType: "exchange",
    };
  }
  return { classification: "complex", suggestedEventType: "unknown" };
}

function movementLegs(
  movements: readonly NetMovement[],
  classification: EvmCandidateClassification,
): { legs: ExternalCandidateLegDraft[]; hasUnresolvedDecimals: boolean } {
  let hasUnresolvedDecimals = false;
  const legs = movements.map((movement) => {
    const magnitude =
      movement.rawAtomic < 0n ? -movement.rawAtomic : movement.rawAtomic;
    if (movement.decimals === null || movement.inconsistentDecimals) {
      hasUnresolvedDecimals = true;
    }
    const amountText =
      movement.decimals === null
        ? "0"
        : evmRawAtomicToDecimalText(magnitude, movement.decimals);
    let role: ExternalCandidateLegDraft["role"] = "unknown";
    if (classification === "simple_in") role = "external_in";
    else if (classification === "simple_out") role = "external_out";
    else if (classification === "simple_exchange") {
      role = movement.rawAtomic < 0n ? "source" : "destination";
    }
    return {
      role,
      providerAssetKey: movement.providerAssetKey,
      amountText: movement.rawAtomic < 0n ? `-${amountText}` : amountText,
      note:
        movement.decimals === null || movement.inconsistentDecimals
          ? `Raw atomic ${magnitude.toString()} has unresolved token decimals.`
          : null,
    };
  });
  return { legs, hasUnresolvedDecimals };
}

export function normalizeEvmActivity(input: {
  walletAddressLower: string;
  transfers: readonly EvmTransferRecord[];
  transactions: readonly EvmEnrichedTransaction[];
}): NormalizedEvmActivity {
  const transfersByHash = new Map<string, EvmTransferRecord[]>();
  for (const transfer of input.transfers) {
    const group = transfersByHash.get(transfer.txHash) ?? [];
    group.push(transfer);
    transfersByHash.set(transfer.txHash, group);
  }
  const transactions = new Map(
    input.transactions.map((enriched) => [
      enriched.transaction.txHash,
      enriched,
    ]),
  );
  const sources: EvmSourceObjectDraft[] = [];
  const candidates: EvmCandidateDraft[] = [];

  for (const [txHash, transfers] of transfersByHash) {
    const enriched = transactions.get(txHash);
    if (!enriched) continue;
    const occurredAt = transfers
      .map((transfer) => transfer.occurredAt)
      .sort()[0]!;
    const primary = transactionSource(enriched, occurredAt);
    const crossChecks = transfers.map(transferSource);
    sources.push(primary, ...crossChecks);
    const candidateSources = [primary, ...crossChecks];
    const txStatus = evmTransactionStatus(enriched.receipt.statusHex);
    const movements = netMovements(transfers, input.walletAddressLower);
    if (movements.length > 0) {
      const shape = movementShape(movements);
      const movement = movementLegs(movements, shape.classification);
      const sourceInconsistency = txStatus === "failed";
      const unsupported =
        shape.classification === "complex" ||
        movement.hasUnresolvedDecimals ||
        txStatus !== "success";
      candidates.push({
        stableKey: evmMovementStableKey(txHash),
        suggestedEventType: shape.suggestedEventType,
        initialStatus: unsupported ? "unsupported" : "pending",
        occurredAt,
        title: `Ethereum movement ${txHash.slice(0, 10)}…`,
        normalizationVersion: 1,
        sourceFingerprint: sourceFingerprint(candidateSources),
        primarySourceExternalIds: [txHash],
        crossCheckSourceExternalIds: transfers.map(
          (transfer) => transfer.uniqueId,
        ),
        legs: movement.legs,
        warnings: [
          ...(shape.classification === "complex"
            ? ["Automatic import is unavailable for complex movement."]
            : []),
          ...(movement.hasUnresolvedDecimals
            ? ["Token decimals are unresolved or inconsistent."]
            : []),
          ...(sourceInconsistency
            ? ["Indexed movement conflicts with a failed transaction receipt."]
            : []),
          ...(txStatus === "unknown"
            ? ["Transaction receipt status is unresolved."]
            : []),
        ],
        detail: {
          chainId: 1,
          txHash,
          candidateKind: "movement",
          classification: shape.classification,
          txStatus,
          blockNumberText:
            enriched.receipt.blockNumberText ??
            enriched.transaction.blockNumberText,
          blockTimestamp: occurredAt,
          fromAddressLower: enriched.transaction.fromAddressLower,
          toAddressLower: enriched.transaction.toAddressLower,
          gasFeeAtomicText: null,
          gasFeeStatus: "not_applicable",
        },
      });
    }

    const gas = calculateEthereumGasFee({
      walletAddress: input.walletAddressLower,
      transactionFrom: enriched.transaction.fromAddressLower,
      transactionType: enriched.transaction.typeHex,
      gasUsed: enriched.receipt.gasUsedHex,
      effectiveGasPrice: enriched.receipt.effectiveGasPriceHex,
      blobGasUsed: enriched.receipt.blobGasUsedHex,
      blobGasPrice: enriched.receipt.blobGasPriceHex,
    });
    if (
      gas.status === "exact" &&
      gas.amountAtomic !== null &&
      gas.amountAtomic > 0n
    ) {
      candidates.push({
        stableKey: evmGasStableKey(txHash),
        suggestedEventType: "expense",
        initialStatus: "pending",
        occurredAt,
        title: `Ethereum network fee ${txHash.slice(0, 10)}…`,
        normalizationVersion: 1,
        sourceFingerprint: sourceFingerprint([primary]),
        primarySourceExternalIds: [txHash],
        crossCheckSourceExternalIds: [],
        legs: [
          {
            role: "external_out",
            providerAssetKey: EVM_NATIVE_ASSET_KEY,
            amountText: `-${evmRawAtomicToDecimalText(gas.amountAtomic, 18)}`,
            note: "Ethereum execution and blob fee, when applicable.",
          },
        ],
        warnings: [],
        detail: {
          chainId: 1,
          txHash,
          candidateKind: "gas",
          classification: "gas_only",
          txStatus,
          blockNumberText:
            enriched.receipt.blockNumberText ??
            enriched.transaction.blockNumberText,
          blockTimestamp: occurredAt,
          fromAddressLower: enriched.transaction.fromAddressLower,
          toAddressLower: enriched.transaction.toAddressLower,
          gasFeeAtomicText: gas.amountAtomic.toString(),
          gasFeeStatus: "exact",
        },
      });
    } else if (gas.status === "unresolved") {
      candidates.push({
        stableKey: evmGasStableKey(txHash),
        suggestedEventType: "expense",
        initialStatus: "unsupported",
        occurredAt,
        title: `Ethereum network fee ${txHash.slice(0, 10)}…`,
        normalizationVersion: 1,
        sourceFingerprint: sourceFingerprint([primary]),
        primarySourceExternalIds: [txHash],
        crossCheckSourceExternalIds: [],
        legs: [],
        warnings: ["Gas fee fields are incomplete; import is unavailable."],
        detail: {
          chainId: 1,
          txHash,
          candidateKind: "gas",
          classification: "gas_only",
          txStatus,
          blockNumberText:
            enriched.receipt.blockNumberText ??
            enriched.transaction.blockNumberText,
          blockTimestamp: occurredAt,
          fromAddressLower: enriched.transaction.fromAddressLower,
          toAddressLower: enriched.transaction.toAddressLower,
          gasFeeAtomicText: null,
          gasFeeStatus: "unresolved",
        },
      });
    }
  }

  return {
    sources: [
      ...new Map(
        sources.map((source) => [
          `${source.objectType}\u0000${source.externalId}`,
          source,
        ]),
      ).values(),
    ],
    candidates,
  };
}
