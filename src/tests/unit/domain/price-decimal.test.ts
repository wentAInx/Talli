import { describe, expect, it } from "vitest";

import {
  divideDecimalTexts,
  multiplyDecimalTexts,
  normalizePositiveDecimalText,
} from "../../../domain/price-decimal";

describe("price decimal text", () => {
  it.each([
    ["1", "1"],
    ["0.9998", "0.9998"],
    ["68123.456789", "68123.456789"],
    ["0.000000000000000001", "0.000000000000000001"],
    ["0001.2300", "1.23"],
  ])("P-001 accepts and normalizes %s", (input, expected) => {
    expect(normalizePositiveDecimalText(input)).toBe(expected);
  });

  it.each(["0", "-1", "1e-8", "NaN", "Infinity", "", "1,000"])(
    "P-001 rejects %j",
    (input) => {
      expect(() => normalizePositiveDecimalText(input)).toThrowError(
        expect.objectContaining({ code: "INVALID_PRICE_DECIMAL" }),
      );
    },
  );

  it("P-002 composes high-precision text without JS number arithmetic", () => {
    expect(
      multiplyDecimalTexts(
        "1000000000000000000.000000000000000001",
        "0.000000000000000001",
      ),
    ).toBe("1.000000000000000000000000000000000001");
    expect(divideDecimalTexts("7.70", "1.10")).toBe("7");
  });
});
