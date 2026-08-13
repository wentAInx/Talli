import { createHash } from "node:crypto";

import {
  calculateEthereumGasFee,
  evmChainIdentity,
  evmGasStableKey,
  evmMovementStableKey,
  evmNativeAssetKey,
  evmRawAtomicToDecimalText,
  evmTransactionStatus,
  type EvmChainId,
} from "../../domain/evm";
import {
  canonicalExternalJson,
  type ExternalCandidateEventType,
  type ExternalCandidateLegDraft,
  type ExternalCandidateStatus,
} from "../../domain/external-sync";
import type {
  EvmEnrichedTransaction,
  EvmL2GasFeeBreakdown,
  EvmTransferRecord,
} from "./types";

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
  chainId: EvmChainId;
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
  nativeTraceStatus: "not_required" | "exact";
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
  l2GasFee: EvmL2GasFeeBreakdown | null;
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
      gasUsedForL1: enriched.receipt.gasUsedForL1Hex,
      blockNumber: enriched.receipt.blockNumberText,
    },
    nativeTrace: enriched.nativeTrace
      ? {
          status: enriched.nativeTrace.status,
          frames: enriched.nativeTrace.frames.map((frame) => ({
            path: frame.path,
            type: frame.type,
            from: frame.fromAddressLower,
            to: frame.toAddressLower,
            valueAtomicText: frame.rawAmountAtomicText,
            reverted: frame.reverted,
          })),
        }
      : null,
    l2GasFee: enriched.l2GasFee
      ? {
          chainId: enriched.l2GasFee.chainId,
          feeModel: enriched.l2GasFee.feeModel,
          status: enriched.l2GasFee.status,
          executionFeeAtomicText: enriched.l2GasFee.executionFeeAtomicText,
          parentDataFeeAtomicText: enriched.l2GasFee.parentDataFeeAtomicText,
          operatorFeeAtomicText: enriched.l2GasFee.operatorFeeAtomicText,
          totalFeeAtomicText: enriched.l2GasFee.totalFeeAtomicText,
          evidence: JSON.parse(enriched.l2GasFee.evidenceJson) as Record<
            string,
            string | number | boolean | null
          >,
        }
      : null,
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
  chainId: EvmChainId,
  enriched: EvmEnrichedTransaction,
): NetMovement[] {
  const net = new Map<string, NetMovement>();
  const authoritativeTransfers =
    chainId === 1
      ? transfers
      : transfers.filter((transfer) => transfer.category === "erc20");
  for (const transfer of authoritativeTransfers) {
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
  if (chainId !== 1 && enriched.nativeTrace?.status === "exact") {
    const providerAssetKey = evmNativeAssetKey(chainId);
    for (const frame of enriched.nativeTrace.frames) {
      if (frame.reverted) continue;
      const rawAtomic = BigInt(frame.rawAmountAtomicText);
      const existing = net.get(providerAssetKey) ?? {
        providerAssetKey,
        rawAtomic: 0n,
        decimals: 18,
        inconsistentDecimals: false,
      };
      if (frame.fromAddressLower === walletAddress)
        existing.rawAtomic -= rawAtomic;
      if (frame.toAddressLower === walletAddress)
        existing.rawAtomic += rawAtomic;
      net.set(providerAssetKey, existing);
    }
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
  chainId: EvmChainId;
  walletAddressLower: string;
  transfers: readonly EvmTransferRecord[];
  transactions: readonly EvmEnrichedTransaction[];
}): NormalizedEvmActivity {
  const chain = evmChainIdentity(input.chainId);
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
    const hasRequiredTrace =
      input.chainId === 1 || enriched.nativeTrace?.status === "exact";
    const movements =
      !hasRequiredTrace || (input.chainId !== 1 && txStatus !== "success")
        ? []
        : netMovements(
            transfers,
            input.walletAddressLower,
            input.chainId,
            enriched,
          );
    if (movements.length > 0) {
      const shape = movementShape(movements);
      const movement = movementLegs(movements, shape.classification);
      const sourceInconsistency = txStatus === "failed";
      const unsupported =
        shape.classification === "complex" ||
        movement.hasUnresolvedDecimals ||
        txStatus !== "success";
      candidates.push({
        stableKey: evmMovementStableKey(input.chainId, txHash),
        suggestedEventType: shape.suggestedEventType,
        initialStatus: unsupported ? "unsupported" : "pending",
        occurredAt,
        title: `${chain.displayName} movement ${txHash.slice(0, 10)}…`,
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
          chainId: input.chainId,
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
          nativeTraceStatus: input.chainId === 1 ? "not_required" : "exact",
        },
        l2GasFee: null,
      });
    }

    const gas =
      input.chainId === 1
        ? calculateEthereumGasFee({
            walletAddress: input.walletAddressLower,
            transactionFrom: enriched.transaction.fromAddressLower,
            transactionType: enriched.transaction.typeHex,
            gasUsed: enriched.receipt.gasUsedHex,
            effectiveGasPrice: enriched.receipt.effectiveGasPriceHex,
            blobGasUsed: enriched.receipt.blobGasUsedHex,
            blobGasPrice: enriched.receipt.blobGasPriceHex,
          })
        : enriched.transaction.fromAddressLower !== input.walletAddressLower ||
            enriched.l2GasFee === null
          ? ({ status: "not_applicable", amountAtomic: null } as const)
          : enriched.l2GasFee.status === "exact"
            ? ({
                status: "exact",
                amountAtomic: BigInt(enriched.l2GasFee.totalFeeAtomicText!),
              } as const)
            : ({ status: "unresolved", amountAtomic: null } as const);
    if (
      gas.status === "exact" &&
      gas.amountAtomic !== null &&
      gas.amountAtomic > 0n
    ) {
      candidates.push({
        stableKey: evmGasStableKey(input.chainId, txHash),
        suggestedEventType: "expense",
        initialStatus: "pending",
        occurredAt,
        title: `${chain.displayName} network fee ${txHash.slice(0, 10)}…`,
        normalizationVersion: 1,
        sourceFingerprint: sourceFingerprint([primary]),
        primarySourceExternalIds: [txHash],
        crossCheckSourceExternalIds: [],
        legs: [
          {
            role: "external_out",
            providerAssetKey: evmNativeAssetKey(input.chainId),
            amountText: `-${evmRawAtomicToDecimalText(gas.amountAtomic, 18)}`,
            note:
              input.chainId === 1
                ? "Ethereum execution and blob fee, when applicable."
                : "Exact L2 execution and parent-chain fee components.",
          },
        ],
        warnings: [],
        detail: {
          chainId: input.chainId,
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
          nativeTraceStatus: input.chainId === 1 ? "not_required" : "exact",
        },
        l2GasFee: enriched.l2GasFee,
      });
    } else if (gas.status === "unresolved") {
      candidates.push({
        stableKey: evmGasStableKey(input.chainId, txHash),
        suggestedEventType: "expense",
        initialStatus: "unsupported",
        occurredAt,
        title: `${chain.displayName} network fee ${txHash.slice(0, 10)}…`,
        normalizationVersion: 1,
        sourceFingerprint: sourceFingerprint([primary]),
        primarySourceExternalIds: [txHash],
        crossCheckSourceExternalIds: [],
        legs: [],
        warnings: [
          "Network fee components are incomplete; import is unavailable.",
        ],
        detail: {
          chainId: input.chainId,
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
          nativeTraceStatus: input.chainId === 1 ? "not_required" : "exact",
        },
        l2GasFee: enriched.l2GasFee,
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
