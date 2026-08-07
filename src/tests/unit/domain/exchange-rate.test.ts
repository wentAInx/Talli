import { describe, expect, it } from "vitest";

import { deriveExecutedExchangeRate } from "../../../domain/exchange-rate";

describe("executed exchange rate", () => {
  it("derives a quote-per-base decimal string from executed quantities", () => {
    expect(
      deriveExecutedExchangeRate({
        sourceAmountAtomic: 100000000n,
        sourceScale: 6,
        destinationAmountAtomic: 9972n,
        destinationScale: 2,
      }),
    ).toBe("0.9972");
  });

  it("handles quantities larger than the JavaScript safe integer range", () => {
    expect(
      deriveExecutedExchangeRate({
        sourceAmountAtomic: 1000000000000000001n,
        sourceScale: 18,
        destinationAmountAtomic: 2500000000000000000n,
        destinationScale: 18,
        significantDigits: 30,
      }),
    ).toBe("2.4999999999999999975");
  });

  it("rejects zero source quantity", () => {
    expect(() =>
      deriveExecutedExchangeRate({
        sourceAmountAtomic: 0n,
        sourceScale: 6,
        destinationAmountAtomic: 1n,
        destinationScale: 2,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_EXCHANGE_SOURCE" }),
    );
  });
});
