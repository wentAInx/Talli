import { describe, expect, it } from "vitest";

import { calculatePortfolioValuation } from "../../../domain/valuation";
import type {
  QuoteResolution,
  ValuationAsset,
} from "../../../domain/quote-types";

function asset(
  id: string,
  code: string,
  assetType: ValuationAsset["assetType"],
  scale: number,
  sortOrder = 0,
): ValuationAsset {
  return {
    id,
    code,
    name: code,
    symbol: null,
    assetType,
    scale,
    isArchived: false,
    sortOrder,
  };
}

const cny = asset("cny", "CNY", "fiat", 2);

function resolved(baseAssetId: string, rateText: string): QuoteResolution {
  return {
    ok: true,
    status: "fresh",
    baseAssetId,
    quoteAssetId: "cny",
    rateText,
    legs: [],
  };
}

function missing(baseAssetId: string): QuoteResolution {
  return {
    ok: false,
    status: "missing_quote",
    baseAssetId,
    quoteAssetId: "cny",
    message: "missing",
  };
}

describe("current portfolio valuation", () => {
  it("V-001 values the Home Asset by identity", () => {
    const result = calculatePortfolioValuation({
      queryTime: "2026-08-08T12:00:00.000Z",
      homeAsset: cny,
      quantities: [{ asset: cny, quantityAtomic: 100000n }],
      resolve: () => ({
        ok: true,
        status: "identity",
        baseAssetId: "cny",
        quoteAssetId: "cny",
        rateText: "1",
        legs: [],
      }),
    });
    expect(result.totalValueText).toBe("1000");
    expect(result.totalValueDisplay).toBe("1000.00");
  });

  it("V-002 converts BTC atomic quantity without number", () => {
    const btc = asset("btc", "BTC", "crypto", 8);
    const result = calculatePortfolioValuation({
      queryTime: "2026-08-08T12:00:00.000Z",
      homeAsset: cny,
      quantities: [{ asset: btc, quantityAtomic: 428137n }],
      resolve: () => resolved("btc", "476000"),
    });
    expect(result.lines[0].valueText).toBe("2037.93212");
  });

  it("V-003 lets a negative balance reduce the total", () => {
    const usd = asset("usd", "USD", "fiat", 2);
    const result = calculatePortfolioValuation({
      queryTime: "2026-08-08T12:00:00.000Z",
      homeAsset: cny,
      quantities: [
        { asset: cny, quantityAtomic: 100000n },
        { asset: usd, quantityAtomic: -10000n },
      ],
      resolve: (id) => resolved(id, id === "cny" ? "1" : "7"),
    });
    expect(result.totalValueText).toBe("300");
  });

  it("V-004 ignores a zero missing line for completeness", () => {
    const zero = asset("zero", "ZERO", "custom", 2);
    const result = calculatePortfolioValuation({
      queryTime: "2026-08-08T12:00:00.000Z",
      homeAsset: cny,
      quantities: [{ asset: zero, quantityAtomic: 0n }],
      resolve: () => missing("zero"),
    });
    expect(result.isComplete).toBe(true);
    expect(result.missingNonZeroAssetCount).toBe(0);
  });

  it("V-005 marks a nonzero missing line incomplete", () => {
    const unknown = asset("unknown", "XYZ", "custom", 2);
    const result = calculatePortfolioValuation({
      queryTime: "2026-08-08T12:00:00.000Z",
      homeAsset: cny,
      quantities: [{ asset: unknown, quantityAtomic: 1n }],
      resolve: () => missing("unknown"),
    });
    expect(result.isComplete).toBe(false);
    expect(result.missingNonZeroAssetCount).toBe(1);
  });

  it("V-006 sums exact lines before final Home Asset rounding", () => {
    const first = asset("first", "A", "custom", 3, 1);
    const second = asset("second", "B", "custom", 3, 2);
    const result = calculatePortfolioValuation({
      queryTime: "2026-08-08T12:00:00.000Z",
      homeAsset: cny,
      quantities: [
        { asset: first, quantityAtomic: 1n },
        { asset: second, quantityAtomic: 1n },
      ],
      resolve: (id) => resolved(id, "5"),
    });
    expect(result.lines.map((line) => line.valueDisplay)).toEqual([
      "0.01",
      "0.01",
    ]);
    expect(result.totalValueText).toBe("0.01");
    expect(result.totalValueDisplay).toBe("0.01");
  });
});
