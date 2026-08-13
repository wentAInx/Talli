import { describe, expect, it } from "vitest";

import {
  BASE_ISTHMUS_ACTIVATION_TIMESTAMP,
  calculateArbitrumGasFee,
  calculateBaseGasFee,
} from "../../../providers/evm/fees";
import type {
  EvmReceiptRecord,
  EvmTransactionRecord,
} from "../../../providers/evm/types";

const TX_HASH = `0x${"b".repeat(64)}`;
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function transaction(typeHex = "0x2"): EvmTransactionRecord {
  return {
    txHash: TX_HASH,
    fromAddressLower: WALLET,
    toAddressLower: OTHER,
    typeHex,
    valueHex: "0x0",
    blockNumberText: "123456",
  };
}

function receipt(overrides: Partial<EvmReceiptRecord> = {}): EvmReceiptRecord {
  return {
    txHash: TX_HASH,
    statusHex: "0x1",
    gasUsedHex: "0x186a0",
    effectiveGasPriceHex: "0x3b9aca00",
    blobGasUsedHex: null,
    blobGasPriceHex: null,
    gasUsedForL1Hex: null,
    blockNumberText: "123456",
    ...overrides,
  };
}

function abiWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

describe("Base exact fee adapter", () => {
  it("adds execution, historical L1 data, and post-Isthmus operator fees", async () => {
    const calls: Array<{ data: string; blockNumberText: string }> = [];
    const result = await calculateBaseGasFee({
      transaction: transaction(),
      receipt: receipt(),
      blockTimestampSeconds: BASE_ISTHMUS_ACTIVATION_TIMESTAMP,
      readRawTransaction: async () => "0x02010203",
      historicalGasPriceOracleCall: async (call) => {
        calls.push(call);
        return call.data.startsWith("0x49948e0e")
          ? abiWord(30_000_000_000_000n)
          : abiWord(5_000_000_000_000n);
      },
    });
    expect(result).toMatchObject({
      status: "exact",
      executionFeeAtomicText: "100000000000000",
      parentDataFeeAtomicText: "30000000000000",
      operatorFeeAtomicText: "5000000000000",
      totalFeeAtomicText: "135000000000000",
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.blockNumberText === "123456")).toBe(true);
  });

  it("uses exact zero before Isthmus and never calls the operator method", async () => {
    const calls: string[] = [];
    const result = await calculateBaseGasFee({
      transaction: transaction(),
      receipt: receipt(),
      blockTimestampSeconds: BASE_ISTHMUS_ACTIVATION_TIMESTAMP - 1n,
      readRawTransaction: async () => "0x02010203",
      historicalGasPriceOracleCall: async ({ data }) => {
        calls.push(data);
        return abiWord(30n);
      },
    });
    expect(result?.operatorFeeAtomicText).toBe("0");
    expect(calls).toHaveLength(1);
  });

  it("fails closed to unresolved when any exact component is unavailable", async () => {
    const result = await calculateBaseGasFee({
      transaction: transaction(),
      receipt: receipt(),
      blockTimestampSeconds: BASE_ISTHMUS_ACTIVATION_TIMESTAMP,
      readRawTransaction: async () => null,
      historicalGasPriceOracleCall: async () => abiWord(1n),
    });
    expect(result).toMatchObject({
      status: "unresolved",
      totalFeeAtomicText: null,
    });
  });

  it("does not treat a Base deposit as a direct-user gas candidate", async () => {
    const result = await calculateBaseGasFee({
      transaction: transaction("0x7e"),
      receipt: receipt(),
      blockTimestampSeconds: BASE_ISTHMUS_ACTIVATION_TIMESTAMP,
      readRawTransaction: async () => {
        throw new Error("must not run");
      },
      historicalGasPriceOracleCall: async () => {
        throw new Error("must not run");
      },
    });
    expect(result).toBeNull();
  });
});

describe("Arbitrum exact fee decomposition", () => {
  it("splits gasUsedForL1 without adding the parent component twice", () => {
    const result = calculateArbitrumGasFee({
      transaction: transaction(),
      receipt: receipt({
        gasUsedHex: "0x7a120",
        gasUsedForL1Hex: "0x30d40",
        effectiveGasPriceHex: "0x1312d00",
      }),
    });
    expect(result).toMatchObject({
      status: "exact",
      executionFeeAtomicText: "6000000000000",
      parentDataFeeAtomicText: "4000000000000",
      operatorFeeAtomicText: null,
      totalFeeAtomicText: "10000000000000",
    });
  });

  it.each([null, "bad", "0x7a121"])(
    "marks missing or invalid gasUsedForL1 %s unresolved",
    (gasUsedForL1Hex) => {
      const result = calculateArbitrumGasFee({
        transaction: transaction(),
        receipt: receipt({ gasUsedForL1Hex }),
      });
      expect(result).toMatchObject({
        status: "unresolved",
        totalFeeAtomicText: null,
      });
    },
  );

  it.each([100, 101, 102, 104, 105, 106])(
    "excludes Arbitrum L1-origin type %s",
    (type) => {
      expect(
        calculateArbitrumGasFee({
          transaction: transaction(`0x${type.toString(16)}`),
          receipt: receipt({ gasUsedForL1Hex: "0x1" }),
        }),
      ).toBeNull();
    },
  );
});
