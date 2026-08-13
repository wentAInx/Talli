import { createHash } from "node:crypto";

import { parseEvmHexQuantity } from "../../domain/evm";
import { canonicalExternalJson } from "../../domain/external-sync";
import {
  decodeAbiUint256,
  encodeGetL1FeeCall,
  encodeGetOperatorFeeCall,
} from "./abi";
import type {
  EvmL2GasFeeBreakdown,
  EvmReceiptRecord,
  EvmTransactionRecord,
} from "./types";

export const BASE_GAS_PRICE_ORACLE =
  "0x420000000000000000000000000000000000000f" as const;
export const BASE_ISTHMUS_ACTIVATION_TIMESTAMP = 1_746_806_401n;

type FeeEvidence = Record<string, string | number | boolean | null>;

function unresolved(
  chainId: 8453 | 42161,
  feeModel: "base_op_stack" | "arbitrum_nitro",
  evidence: FeeEvidence,
): EvmL2GasFeeBreakdown {
  return {
    chainId,
    feeModel,
    status: "unresolved",
    executionFeeAtomicText: null,
    parentDataFeeAtomicText: null,
    operatorFeeAtomicText: null,
    totalFeeAtomicText: null,
    evidenceJson: canonicalExternalJson(evidence),
  };
}

function parseFeeQuantity(value: string | null, label: string): bigint {
  if (value === null) throw new Error(`${label} missing`);
  return parseEvmHexQuantity(value, label);
}

function normalizedType(typeHex: string | null): bigint | null {
  if (typeHex === null) return 0n;
  try {
    return parseEvmHexQuantity(typeHex, "Transaction type");
  } catch {
    return null;
  }
}

export function isBaseDepositTransaction(typeHex: string | null): boolean {
  return normalizedType(typeHex) === 126n;
}

const ARBITRUM_L1_ORIGIN_TYPES = new Set([100n, 101n, 102n, 104n, 105n, 106n]);

export function isArbitrumL1OriginTransaction(typeHex: string | null): boolean {
  const type = normalizedType(typeHex);
  return type !== null && ARBITRUM_L1_ORIGIN_TYPES.has(type);
}

export function calculateArbitrumGasFee(input: {
  transaction: EvmTransactionRecord;
  receipt: EvmReceiptRecord;
}): EvmL2GasFeeBreakdown | null {
  if (isArbitrumL1OriginTransaction(input.transaction.typeHex)) return null;
  const evidence = {
    txHash: input.transaction.txHash,
    blockNumber:
      input.receipt.blockNumberText ?? input.transaction.blockNumberText,
    txType: input.transaction.typeHex,
    gasUsedHex: input.receipt.gasUsedHex,
    gasUsedForL1Hex: input.receipt.gasUsedForL1Hex,
    effectiveGasPriceHex: input.receipt.effectiveGasPriceHex,
  };
  try {
    const gasUsed = parseFeeQuantity(
      input.receipt.gasUsedHex,
      "Arbitrum gasUsed",
    );
    const gasUsedForL1 = parseFeeQuantity(
      input.receipt.gasUsedForL1Hex,
      "Arbitrum gasUsedForL1",
    );
    const price = parseFeeQuantity(
      input.receipt.effectiveGasPriceHex,
      "Arbitrum effectiveGasPrice",
    );
    if (gasUsedForL1 > gasUsed) throw new Error("gasUsedForL1 exceeds gasUsed");
    const parentData = gasUsedForL1 * price;
    const execution = (gasUsed - gasUsedForL1) * price;
    const total = gasUsed * price;
    if (execution + parentData !== total) throw new Error("component mismatch");
    return {
      chainId: 42161,
      feeModel: "arbitrum_nitro",
      status: "exact",
      executionFeeAtomicText: execution.toString(),
      parentDataFeeAtomicText: parentData.toString(),
      operatorFeeAtomicText: null,
      totalFeeAtomicText: total.toString(),
      evidenceJson: canonicalExternalJson(evidence),
    };
  } catch {
    return unresolved(42161, "arbitrum_nitro", evidence);
  }
}

export async function calculateBaseGasFee(input: {
  transaction: EvmTransactionRecord;
  receipt: EvmReceiptRecord;
  blockTimestampSeconds: bigint;
  readRawTransaction: (txHash: string) => Promise<string | null>;
  historicalGasPriceOracleCall: (input: {
    data: string;
    blockNumberText: string;
  }) => Promise<string>;
}): Promise<EvmL2GasFeeBreakdown | null> {
  if (isBaseDepositTransaction(input.transaction.typeHex)) return null;
  const blockNumber =
    input.receipt.blockNumberText ?? input.transaction.blockNumberText;
  const evidence: FeeEvidence = {
    txHash: input.transaction.txHash,
    blockNumber,
    txType: input.transaction.typeHex,
    gasUsedHex: input.receipt.gasUsedHex,
    effectiveGasPriceHex: input.receipt.effectiveGasPriceHex,
    gasPriceOracle: BASE_GAS_PRICE_ORACLE,
  };
  try {
    if (blockNumber === null) throw new Error("block number missing");
    const gasUsed = parseFeeQuantity(input.receipt.gasUsedHex, "Base gasUsed");
    const price = parseFeeQuantity(
      input.receipt.effectiveGasPriceHex,
      "Base effectiveGasPrice",
    );
    const execution = gasUsed * price;
    const rawTransaction = await input.readRawTransaction(
      input.transaction.txHash,
    );
    if (rawTransaction === null) throw new Error("raw transaction missing");
    const rawBytes = /^0x([0-9a-fA-F]+)$/.exec(rawTransaction)?.[1];
    if (!rawBytes || rawBytes.length % 2 !== 0)
      throw new Error("raw transaction invalid");
    evidence.rawTxSha256 = createHash("sha256")
      .update(Buffer.from(rawBytes, "hex"))
      .digest("hex");
    evidence.rawTxByteLength = rawBytes.length / 2;

    const getL1FeeResultHex = await input.historicalGasPriceOracleCall({
      data: encodeGetL1FeeCall(rawTransaction),
      blockNumberText: blockNumber,
    });
    evidence.getL1FeeResultHex = getL1FeeResultHex;
    const parentData = decodeAbiUint256(getL1FeeResultHex);

    let operator = 0n;
    if (input.blockTimestampSeconds < BASE_ISTHMUS_ACTIVATION_TIMESTAMP) {
      evidence.operatorFeeEvidence = "preIsthmusZero";
    } else {
      const getOperatorFeeResultHex = await input.historicalGasPriceOracleCall({
        data: encodeGetOperatorFeeCall(gasUsed),
        blockNumberText: blockNumber,
      });
      evidence.getOperatorFeeResultHex = getOperatorFeeResultHex;
      operator = decodeAbiUint256(getOperatorFeeResultHex);
    }
    const total = execution + parentData + operator;
    return {
      chainId: 8453,
      feeModel: "base_op_stack",
      status: "exact",
      executionFeeAtomicText: execution.toString(),
      parentDataFeeAtomicText: parentData.toString(),
      operatorFeeAtomicText: operator.toString(),
      totalFeeAtomicText: total.toString(),
      evidenceJson: canonicalExternalJson(evidence),
    };
  } catch {
    return unresolved(8453, "base_op_stack", evidence);
  }
}
