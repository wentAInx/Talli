import { describe, expect, it } from "vitest";

import {
  calculateHistoricalAllocation,
  calculateHistoricalCashFlow,
  calculateHistoricalNetWorthPoint,
  calculateNetWorthBridge,
  type HistoricalEntryFact,
} from "../../../domain/historical-analytics";
import type { HistoricalQuoteResolution } from "../../../domain/historical-quote-types";
import { PriceDecimal, decimalText } from "../../../domain/price-decimal";
import type { ValuationAsset } from "../../../domain/quote-types";

function asset(
  id: string,
  code: string,
  assetType: ValuationAsset["assetType"],
  scale = 2,
): ValuationAsset {
  return {
    id,
    code,
    name: code,
    symbol: null,
    assetType,
    scale,
    isArchived: false,
    sortOrder: 0,
  };
}

const cny = asset("cny", "CNY", "fiat");
const usd = asset("usd", "USD", "fiat");
const btc = asset("btc", "BTC", "crypto", 8);

function resolved(
  assetId: string,
  rateText: string,
  degraded = false,
): HistoricalQuoteResolution {
  return {
    ok: true,
    baseAssetId: assetId,
    quoteAssetId: "cny",
    rateText,
    legs: [],
    degraded,
  };
}

function missing(assetId: string): HistoricalQuoteResolution {
  return {
    ok: false,
    baseAssetId: assetId,
    quoteAssetId: "cny",
    status: "missing_quote",
    message: "missing",
  };
}

const cutoff = "2026-08-14T15:59:59.999Z";

describe("historical analytics exact math", () => {
  it("reports known and complete totals separately and keeps liabilities signed", () => {
    const result = calculateHistoricalNetWorthPoint({
      localDate: "2026-08-14",
      cutoffUtc: cutoff,
      quantities: [
        { asset: cny, quantityAtomic: 100_000n },
        { asset: usd, quantityAtomic: -10_00n },
        { asset: btc, quantityAtomic: 10_000_000n },
      ],
      resolve: (assetId) =>
        assetId === "btc"
          ? missing(assetId)
          : resolved(assetId, assetId === "usd" ? "7" : "1", true),
    });

    expect(result).toMatchObject({
      knownValueText: "930",
      completeValueText: null,
      grossAssetsKnownText: "1000",
      grossLiabilitiesKnownText: "-70",
      isComplete: false,
      isDegraded: true,
      missingAssetIds: ["btc"],
    });
  });

  it("builds positive-only allocations and never divides liabilities into shares", () => {
    const result = calculateHistoricalAllocation({
      localDate: "2026-08-14",
      cutoffUtc: cutoff,
      quantities: [
        { asset: cny, quantityAtomic: 700_00n },
        { asset: usd, quantityAtomic: 50_00n },
        { asset: btc, quantityAtomic: -1_000_000n },
      ],
      resolve: (assetId) =>
        resolved(
          assetId,
          assetId === "cny" ? "1" : assetId === "btc" ? "476000" : "7",
        ),
    });

    expect(result).toMatchObject({
      grossAssetsText: "1050",
      grossLiabilitiesText: "-4760",
      netWorthText: "-3710",
      isComplete: true,
    });
    expect(result.byAsset.map((slice) => slice.key)).toEqual(["cny", "usd"]);
    expect(result.byFiatCurrency.map((slice) => slice.key)).toEqual([
      "CNY",
      "USD",
    ]);
    expect(result.byAssetClass).toEqual([
      {
        key: "fiat",
        label: "fiat",
        valueText: "1050",
        shareText: "1",
      },
    ]);
  });

  it("values included cash-flow facts at event time and marks only affected values missing", () => {
    const entries: HistoricalEntryFact[] = [
      {
        entryId: "income",
        eventId: "e1",
        occurredAt: "2026-07-31T16:00:00.000Z",
        eventType: "income",
        entryRole: "main",
        assetId: "usd",
        amountAtomic: 10_00n,
      },
      {
        entryId: "expense",
        eventId: "e2",
        occurredAt: "2026-08-01T02:00:00.000Z",
        eventType: "expense",
        entryRole: "main",
        assetId: "usd",
        amountAtomic: -2_00n,
      },
      {
        entryId: "fee",
        eventId: "e3",
        occurredAt: "2026-08-01T03:00:00.000Z",
        eventType: "transfer",
        entryRole: "fee",
        assetId: "btc",
        amountAtomic: -1n,
      },
      {
        entryId: "principal",
        eventId: "e3",
        occurredAt: "2026-08-01T03:00:00.000Z",
        eventType: "transfer",
        entryRole: "source",
        assetId: "usd",
        amountAtomic: -8_00n,
      },
      {
        entryId: "exchange-source",
        eventId: "e4",
        occurredAt: "2026-08-01T04:00:00.000Z",
        eventType: "exchange",
        entryRole: "source",
        assetId: "usd",
        amountAtomic: -100_00n,
      },
      {
        entryId: "exchange-destination",
        eventId: "e4",
        occurredAt: "2026-08-01T04:00:00.000Z",
        eventType: "exchange",
        entryRole: "destination",
        assetId: "btc",
        amountAtomic: 1_000_000n,
      },
    ];
    const result = calculateHistoricalCashFlow({
      periods: ["2026-08"],
      entries,
      assets: new Map([
        [usd.id, usd],
        [btc.id, btc],
      ]),
      timeZoneDate: () => "2026-08-01",
      resolve: (assetId, queryTime) =>
        assetId === "btc"
          ? missing(assetId)
          : resolved(assetId, queryTime.includes("16:00") ? "6" : "7"),
    });

    expect(result).toEqual([
      {
        period: "2026-08",
        incomeText: "60",
        expenseText: "-14",
        feesText: null,
        netFlowText: null,
        isComplete: false,
        missingCount: 1,
      },
    ]);
  });

  it("preserves the exact bridge identity including snapshot reconciliation", () => {
    const entries: HistoricalEntryFact[] = [
      {
        entryId: "income",
        eventId: "e1",
        occurredAt: "2026-08-14T01:00:00.000Z",
        eventType: "income",
        entryRole: "main",
        assetId: "usd",
        amountAtomic: 20_00n,
      },
      {
        entryId: "expense",
        eventId: "e2",
        occurredAt: "2026-08-14T02:00:00.000Z",
        eventType: "expense",
        entryRole: "main",
        assetId: "usd",
        amountAtomic: -5_00n,
      },
      {
        entryId: "transfer-source",
        eventId: "e3",
        occurredAt: "2026-08-14T03:00:00.000Z",
        eventType: "transfer",
        entryRole: "source",
        assetId: "usd",
        amountAtomic: -10_00n,
      },
      {
        entryId: "transfer-destination",
        eventId: "e3",
        occurredAt: "2026-08-14T03:00:00.000Z",
        eventType: "transfer",
        entryRole: "destination",
        assetId: "usd",
        amountAtomic: 10_00n,
      },
    ];
    const result = calculateNetWorthBridge({
      localDate: "2026-08-14",
      startDate: "2026-08-13",
      startCutoffUtc: "2026-08-13T15:59:59.999Z",
      endCutoffUtc: cutoff,
      startQuantities: new Map([["usd", 100_00n]]),
      endQuantities: new Map([["usd", 145_00n]]),
      entries,
      assets: new Map([[usd.id, usd]]),
      resolve: (_assetId, queryTime) =>
        resolved("usd", queryTime === cutoff ? "3" : "2"),
    });

    expect(result).toMatchObject({
      startValueText: "200",
      endValueText: "435",
      deltaText: "235",
      marketAndFxText: "100",
      incomeText: "60",
      expenseText: "-15",
      internalTransferText: "0",
      reconciliationText: "90",
      isComplete: true,
    });
    const componentTotal = [
      result.marketAndFxText,
      result.incomeText,
      result.expenseText,
      result.feesText,
      result.internalTransferText,
      result.tradeRebalanceText,
      result.reconciliationText,
    ].reduce(
      (total, value) => total.add(new PriceDecimal(value!)),
      new PriceDecimal(0),
    );
    expect(decimalText(componentTotal)).toBe(result.deltaText);
  });

  it("isolates price-only and exchange/rebalance bridge effects", () => {
    const priceOnly = calculateNetWorthBridge({
      localDate: "2026-08-14",
      startDate: "2026-08-13",
      startCutoffUtc: "2026-08-13T15:59:59.999Z",
      endCutoffUtc: cutoff,
      startQuantities: new Map([["usd", 100_00n]]),
      endQuantities: new Map([["usd", 100_00n]]),
      entries: [],
      assets: new Map([[usd.id, usd]]),
      resolve: (_assetId, queryTime) =>
        resolved("usd", queryTime === cutoff ? "3" : "2"),
    });
    expect(priceOnly).toMatchObject({
      deltaText: "100",
      marketAndFxText: "100",
      incomeText: "0",
      tradeRebalanceText: "0",
      reconciliationText: "0",
    });

    const exchangeEntries: HistoricalEntryFact[] = [
      {
        entryId: "exchange-source",
        eventId: "exchange",
        occurredAt: "2026-08-14T02:00:00.000Z",
        eventType: "exchange",
        entryRole: "source",
        assetId: "usd",
        amountAtomic: -100_00n,
      },
      {
        entryId: "exchange-destination",
        eventId: "exchange",
        occurredAt: "2026-08-14T02:00:00.000Z",
        eventType: "exchange",
        entryRole: "destination",
        assetId: "btc",
        amountAtomic: 100_000_000n,
      },
    ];
    const rebalance = calculateNetWorthBridge({
      localDate: "2026-08-14",
      startDate: "2026-08-13",
      startCutoffUtc: "2026-08-13T15:59:59.999Z",
      endCutoffUtc: cutoff,
      startQuantities: new Map([
        ["usd", 100_00n],
        ["btc", 0n],
      ]),
      endQuantities: new Map([
        ["usd", 0n],
        ["btc", 100_000_000n],
      ]),
      entries: exchangeEntries,
      assets: new Map([
        [usd.id, usd],
        [btc.id, btc],
      ]),
      resolve: (assetId) => resolved(assetId, assetId === "btc" ? "120" : "1"),
    });
    expect(rebalance).toMatchObject({
      deltaText: "20",
      marketAndFxText: "0",
      tradeRebalanceText: "20",
      reconciliationText: "0",
    });
  });

  it("returns no authoritative bridge components when either endpoint quote is missing", () => {
    const result = calculateNetWorthBridge({
      localDate: "2026-08-14",
      startDate: "2026-08-13",
      startCutoffUtc: "2026-08-13T15:59:59.999Z",
      endCutoffUtc: cutoff,
      startQuantities: new Map([["btc", 1n]]),
      endQuantities: new Map([["btc", 1n]]),
      entries: [],
      assets: new Map([[btc.id, btc]]),
      resolve: (_assetId, queryTime) =>
        queryTime === cutoff ? resolved("btc", "500000") : missing("btc"),
    });
    expect(result).toMatchObject({
      isComplete: false,
      deltaText: null,
      marketAndFxText: null,
      missingAssetIds: ["btc"],
    });
  });
});
