import { describe, expect, it } from "vitest";

import { normalizeEvmActivity } from "../../../providers/evm/candidates";
import type {
  EvmEnrichedTransaction,
  EvmTransferRecord,
} from "../../../providers/evm/types";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x3333333333333333333333333333333333333333";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
const TX = `0x${"a".repeat(64)}`;

function transfer(input: {
  uniqueId: string;
  from: string;
  to: string;
  key?: string;
  raw: bigint;
  decimals?: number | null;
}): EvmTransferRecord {
  const isNative = input.key === undefined;
  const decimals =
    input.decimals === undefined ? (isNative ? 18 : 6) : input.decimals;
  return {
    uniqueId: input.uniqueId,
    txHash: TX,
    category: isNative ? "internal" : "erc20",
    fromAddressLower: input.from,
    toAddressLower: input.to,
    providerAssetKey: input.key ?? "eip155:1/native",
    contractAddressLower: isNative ? null : input.key!.split(":").at(-1)!,
    rawAmountAtomicText: input.raw.toString(),
    decimals,
    amountText: null,
    displayCode: isNative ? "ETH" : "TOKEN",
    blockNumberText: "100",
    occurredAt: "2026-08-12T13:00:00.000Z",
    humanValue: 999_999_999,
  };
}

function transaction(
  input: {
    from?: string;
    status?: string | null;
    type?: string | null;
    blobGasUsed?: string | null;
    blobGasPrice?: string | null;
  } = {},
): EvmEnrichedTransaction {
  return {
    transaction: {
      txHash: TX,
      fromAddressLower: input.from ?? WALLET,
      toAddressLower: OTHER,
      typeHex: input.type ?? "0x2",
      valueHex: "0x0",
      blockNumberText: "100",
    },
    receipt: {
      txHash: TX,
      statusHex: input.status === undefined ? "0x1" : input.status,
      gasUsedHex: "0x5208",
      effectiveGasPriceHex: "0x3b9aca00",
      blobGasUsedHex: input.blobGasUsed ?? null,
      blobGasPriceHex: input.blobGasPrice ?? null,
      blockNumberText: "100",
    },
  };
}

describe("EVM activity normalization", () => {
  it("splits a simple exchange movement and its gas into two candidates", () => {
    const normalized = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "erc20-out",
          from: WALLET,
          to: OTHER,
          key: `eip155:1/erc20:${USDC}`,
          raw: 100_000_000n,
        }),
        transfer({
          uniqueId: "eth-in",
          from: OTHER,
          to: WALLET,
          raw: 40_000_000_000_000_000n,
        }),
      ],
      transactions: [transaction()],
    });

    expect(normalized.candidates).toHaveLength(2);
    expect(normalized.candidates[0]).toMatchObject({
      stableKey: `evm:1:movement:${TX}`,
      suggestedEventType: "exchange",
      initialStatus: "pending",
      detail: {
        candidateKind: "movement",
        classification: "simple_exchange",
      },
      legs: [
        {
          role: "source",
          providerAssetKey: `eip155:1/erc20:${USDC}`,
          amountText: "-100",
        },
        {
          role: "destination",
          providerAssetKey: "eip155:1/native",
          amountText: "0.04",
        },
      ],
    });
    expect(normalized.candidates[1]).toMatchObject({
      stableKey: `evm:1:gas:${TX}`,
      suggestedEventType: "expense",
      detail: {
        candidateKind: "gas",
        classification: "gas_only",
        gasFeeAtomicText: "21000000000000",
      },
      legs: [{ amountText: "-0.000021" }],
    });
  });

  it("classifies inbound/outbound without guessing income or expense", () => {
    const inbound = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({ uniqueId: "in", from: OTHER, to: WALLET, raw: 1n }),
      ],
      transactions: [transaction({ from: OTHER })],
    });
    expect(inbound.candidates).toHaveLength(1);
    expect(inbound.candidates[0]).toMatchObject({
      suggestedEventType: "unknown",
      detail: { classification: "simple_in" },
    });

    const outbound = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({ uniqueId: "out", from: WALLET, to: OTHER, raw: 1n }),
      ],
      transactions: [transaction()],
    });
    expect(outbound.candidates[0]).toMatchObject({
      suggestedEventType: "unknown",
      detail: { classification: "simple_out" },
    });
    expect(outbound.candidates[1]?.detail.candidateKind).toBe("gas");
  });

  it("does not create movement for self net-zero but keeps paid gas", () => {
    const normalized = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({ uniqueId: "self", from: WALLET, to: WALLET, raw: 10n }),
      ],
      transactions: [transaction()],
    });
    expect(normalized.candidates).toHaveLength(1);
    expect(normalized.candidates[0]?.detail.candidateKind).toBe("gas");
  });

  it("keeps complex, missing-decimal, and failed movement unimportable", () => {
    const complex = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({ uniqueId: "eth-out", from: WALLET, to: OTHER, raw: 1n }),
        transfer({
          uniqueId: "usdc-in",
          from: OTHER,
          to: WALLET,
          key: `eip155:1/erc20:${USDC}`,
          raw: 1n,
        }),
        transfer({
          uniqueId: "dai-in",
          from: OTHER,
          to: WALLET,
          key: `eip155:1/erc20:${DAI}`,
          raw: 1n,
        }),
      ],
      transactions: [transaction()],
    });
    expect(complex.candidates[0]).toMatchObject({
      initialStatus: "unsupported",
      detail: { classification: "complex" },
    });

    const unresolved = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({
          uniqueId: "unknown-decimals",
          from: OTHER,
          to: WALLET,
          key: `eip155:1/erc20:${USDC}`,
          raw: 1n,
          decimals: null,
        }),
      ],
      transactions: [transaction({ from: OTHER })],
    });
    expect(unresolved.candidates[0]).toMatchObject({
      initialStatus: "unsupported",
      detail: { classification: "simple_in" },
    });

    const failed = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({ uniqueId: "failed-out", from: WALLET, to: OTHER, raw: 1n }),
      ],
      transactions: [transaction({ status: "0x0" })],
    });
    expect(failed.candidates[0]).toMatchObject({
      initialStatus: "unsupported",
      detail: { txStatus: "failed" },
    });
    expect(failed.candidates[1]).toMatchObject({
      initialStatus: "pending",
      detail: { candidateKind: "gas", txStatus: "failed" },
    });
  });

  it("marks incomplete blob fee unresolved instead of undercounting", () => {
    const normalized = normalizeEvmActivity({
      walletAddressLower: WALLET,
      transfers: [
        transfer({ uniqueId: "blob-out", from: WALLET, to: OTHER, raw: 1n }),
      ],
      transactions: [transaction({ type: "0x3" })],
    });
    expect(normalized.candidates[1]).toMatchObject({
      initialStatus: "unsupported",
      detail: { candidateKind: "gas", gasFeeStatus: "unresolved" },
      legs: [],
    });
  });
});
