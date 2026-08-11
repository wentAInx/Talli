import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../../domain/errors";
import {
  canonicalExternalJson,
  externalBalanceDifference,
  externalDecimalToAtomic,
  externalStableKey,
  validatedExternalDecimalText,
} from "../../../domain/external-sync";

describe("external sync domain primitives", () => {
  it("keeps exact provider decimal text and rejects unsafe formats", () => {
    expect(validatedExternalDecimalText(" 0.50200000 ")).toBe("0.50200000");
    expect(() => validatedExternalDecimalText("5e-3")).toThrow(
      DomainValidationError,
    );
    expect(() => validatedExternalDecimalText("1,000.00")).toThrow(
      DomainValidationError,
    );
  });

  it("converts mapped quantities exactly without rounding", () => {
    expect(externalDecimalToAtomic("0.50200000", 8)).toEqual({
      amountAtomic: 50_200_000n,
      precisionStatus: "exact",
    });
    expect(externalDecimalToAtomic("100.0000", 2)).toEqual({
      amountAtomic: 10_000n,
      precisionStatus: "exact",
    });
    expect(externalDecimalToAtomic("1.001", 2)).toEqual({
      amountAtomic: null,
      precisionStatus: "excess_precision",
    });
    expect(externalDecimalToAtomic("5.00000000", null)).toEqual({
      amountAtomic: null,
      precisionStatus: "unmapped",
    });
  });

  it("computes a native-asset observation difference with bigint", () => {
    expect(externalBalanceDifference(50_200_000n, 50_000_000n)).toBe(200_000n);
  });

  it("derives stable provider keys from external IDs", () => {
    expect(externalStableKey("kraken_trade", "T-1")).toBe("kraken:trade:T-1");
    expect(externalStableKey("kraken_ledger", "L-1")).toBe("kraken:ledger:L-1");
  });

  it("canonicalizes sanitized payloads independent of object key order", () => {
    expect(canonicalExternalJson({ z: "last", a: { y: 2, x: 1 } })).toBe(
      '{"a":{"x":1,"y":2},"z":"last"}',
    );
  });
});
