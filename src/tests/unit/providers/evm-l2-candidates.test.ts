import { describe, expect, it } from "vitest";

import { normalizeEvmActivity } from "../../../providers/evm/candidates";
import type {
  EvmEnrichedTransaction,
  EvmNativeTraceFrame,
  EvmTransferRecord,
} from "../../../providers/evm/types";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TX = `0x${"b".repeat(64)}`;

function transfer(input: {
  uniqueId: string;
  category: "external" | "erc20";
  from: string;
  to: string;
  raw: bigint;
}): EvmTransferRecord {
  const erc20 = input.category === "erc20";
  return {
    uniqueId: input.uniqueId,
    txHash: TX,
    category: input.category,
    fromAddressLower: input.from,
    toAddressLower: input.to,
    providerAssetKey: erc20
      ? `eip155:8453/erc20:${USDC}`
      : "eip155:8453/native",
    contractAddressLower: erc20 ? USDC : null,
    rawAmountAtomicText: input.raw.toString(),
    decimals: erc20 ? 6 : 18,
    amountText: null,
    displayCode: erc20 ? "USDC" : "ETH",
    blockNumberText: "100",
    occurredAt: "2026-08-13T00:00:00.000Z",
    humanValue: 999999999,
  };
}

function transaction(input: {
  frames: EvmNativeTraceFrame[];
  status?: "0x1" | "0x0";
  traceStatus?: "exact" | "missing";
}): EvmEnrichedTransaction {
  return {
    transaction: {
      txHash: TX,
      fromAddressLower: WALLET,
      toAddressLower: OTHER,
      typeHex: "0x2",
      valueHex: "0x0",
      blockNumberText: "100",
    },
    receipt: {
      txHash: TX,
      statusHex: input.status ?? "0x1",
      gasUsedHex: "0x186a0",
      effectiveGasPriceHex: "0x3b9aca00",
      blobGasUsedHex: null,
      blobGasPriceHex: null,
      gasUsedForL1Hex: null,
      blockNumberText: "100",
    },
    nativeTrace:
      input.traceStatus === "missing"
        ? null
        : { status: "exact", frames: input.frames },
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
  };
}

describe("L2 activity normalization", () => {
  it("uses exact trace native value without double-counting external discovery", () => {
    const normalized = normalizeEvmActivity({
      chainId: 8453,
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "external-root",
          category: "external",
          from: WALLET,
          to: OTHER,
          raw: 1_000_000_000_000_000_000n,
        }),
      ],
      transactions: [
        transaction({
          frames: [
            {
              path: "0",
              type: "CALL",
              fromAddressLower: WALLET,
              toAddressLower: OTHER,
              rawAmountAtomicText: "1000000000000000000",
              reverted: false,
            },
          ],
        }),
      ],
    });
    expect(normalized.candidates[0]).toMatchObject({
      stableKey: `evm:8453:movement:${TX}`,
      detail: { nativeTraceStatus: "exact" },
      legs: [{ providerAssetKey: "eip155:8453/native", amountText: "-1" }],
    });
  });

  it("combines traced ETH with raw ERC-20 logs and keeps exact fee provenance", () => {
    const normalized = normalizeEvmActivity({
      chainId: 8453,
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "usdc-out",
          category: "erc20",
          from: WALLET,
          to: OTHER,
          raw: 100_000_000n,
        }),
      ],
      transactions: [
        transaction({
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
        }),
      ],
    });
    expect(normalized.candidates).toHaveLength(2);
    expect(normalized.candidates[0]).toMatchObject({
      initialStatus: "pending",
      detail: { classification: "simple_exchange" },
      legs: [
        { providerAssetKey: `eip155:8453/erc20:${USDC}`, amountText: "-100" },
        { providerAssetKey: "eip155:8453/native", amountText: "0.04" },
      ],
    });
    expect(normalized.candidates[1]).toMatchObject({
      stableKey: `evm:8453:gas:${TX}`,
      detail: { gasFeeAtomicText: "135000000000000" },
      l2GasFee: { status: "exact", operatorFeeAtomicText: "5000000000000" },
    });
  });

  it("drops reverted native frames", () => {
    const normalized = normalizeEvmActivity({
      chainId: 8453,
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "usdc-out",
          category: "erc20",
          from: WALLET,
          to: OTHER,
          raw: 1_000_000n,
        }),
      ],
      transactions: [
        transaction({
          frames: [
            {
              path: "0",
              type: "CALL",
              fromAddressLower: OTHER,
              toAddressLower: WALLET,
              rawAmountAtomicText: "1000000000000000000",
              reverted: true,
            },
          ],
        }),
      ],
    });
    expect(normalized.candidates[0]).toMatchObject({
      detail: { classification: "simple_out" },
      legs: [{ providerAssetKey: `eip155:8453/erc20:${USDC}` }],
    });
  });

  it("creates no movement for a failed L2 receipt while retaining paid exact gas", () => {
    const normalized = normalizeEvmActivity({
      chainId: 8453,
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "failed-external",
          category: "external",
          from: WALLET,
          to: OTHER,
          raw: 1n,
        }),
      ],
      transactions: [
        transaction({
          status: "0x0",
          frames: [
            {
              path: "0",
              type: "CALL",
              fromAddressLower: WALLET,
              toAddressLower: OTHER,
              rawAmountAtomicText: "1",
              reverted: false,
            },
          ],
        }),
      ],
    });
    expect(normalized.candidates).toHaveLength(1);
    expect(normalized.candidates[0]).toMatchObject({
      detail: { candidateKind: "gas", txStatus: "failed" },
    });
  });

  it("never creates an L2 movement candidate without an exact trace", () => {
    const normalized = normalizeEvmActivity({
      chainId: 8453,
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "erc20-without-trace",
          category: "erc20",
          from: WALLET,
          to: OTHER,
          raw: 1_000_000n,
        }),
      ],
      transactions: [transaction({ frames: [], traceStatus: "missing" })],
    });
    expect(
      normalized.candidates.some(
        (candidate) => candidate.detail.candidateKind === "movement",
      ),
    ).toBe(false);
  });
});
