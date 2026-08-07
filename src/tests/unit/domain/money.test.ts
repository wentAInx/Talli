import { describe, expect, it } from "vitest";

import { formatAtomic, parseDecimalToAtomic } from "../../../domain/money";

describe("exact money", () => {
  it("M-001 parses CNY", () => {
    expect(parseDecimalToAtomic("123.45", 2)).toBe(12345n);
  });

  it("M-002 parses BTC", () => {
    expect(parseDecimalToAtomic("0.00428137", 8)).toBe(428137n);
  });

  it("M-003 preserves 18-decimal ETH", () => {
    expect(parseDecimalToAtomic("1.000000000000000001", 18)).toBe(
      1000000000000000001n,
    );
  });

  it("M-004 rejects excess fractional digits without rounding", () => {
    expect(() => parseDecimalToAtomic("1.001", 2)).toThrowError(
      expect.objectContaining({ code: "EXCESS_FRACTIONAL_DIGITS" }),
    );
  });

  it("M-005 rejects scientific notation", () => {
    expect(() => parseDecimalToAtomic("1e-8", 8)).toThrowError(
      expect.objectContaining({ code: "INVALID_DECIMAL" }),
    );
    expect(() => parseDecimalToAtomic("1E-8", 8)).toThrowError(
      expect.objectContaining({ code: "INVALID_DECIMAL" }),
    );
  });

  it.each([
    [0n, 2],
    [1n, 2],
    [-1n, 2],
    [1000n, 2],
    [428137n, 8],
    [1000000000000000001n, 18],
    [999999999999999999999999999999999999n, 30],
  ] as const)("M-006 round-trips %s at scale %s", (amount, scale) => {
    const formatted = formatAtomic(amount, scale);
    expect(parseDecimalToAtomic(formatted, scale)).toBe(amount);
  });

  it("trims display zeros without losing round-trip precision", () => {
    const formatted = formatAtomic(1000n, 2, { trimTrailingZeros: true });
    expect(formatted).toBe("10");
    expect(parseDecimalToAtomic(formatted, 2)).toBe(1000n);
  });

  it.each(["", " ", ".5", "1.", "1,000", "NaN", "Infinity", "--1"])(
    "rejects malformed decimal text %j",
    (input) => {
      expect(() => parseDecimalToAtomic(input, 2)).toThrowError(
        expect.objectContaining({ code: "INVALID_DECIMAL" }),
      );
    },
  );
});
