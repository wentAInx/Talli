import { describe, expect, it } from "vitest";

import { resolveHistoricalQuote } from "../../../domain/historical-quote-math";
import type { HistoricalQuoteResolverSnapshot } from "../../../domain/historical-quote-types";
import {
  divideDecimalTexts,
  multiplyDecimalTexts,
} from "../../../domain/price-decimal";
import type { ValuationAsset } from "../../../domain/quote-types";

const FETCHED_AT = "2026-08-15T16:10:00.000Z";

function asset(
  id: string,
  code: string,
  assetType: ValuationAsset["assetType"],
  scale: number,
  isArchived = false,
): ValuationAsset {
  return {
    id,
    code,
    name: code,
    symbol: null,
    assetType,
    scale,
    isArchived,
    sortOrder: 0,
  };
}

function fixture(): HistoricalQuoteResolverSnapshot {
  return {
    assets: [
      asset("eur", "EUR", "fiat", 2),
      asset("usd", "USD", "fiat", 2),
      asset("cny", "CNY", "fiat", 2),
      asset("btc", "BTC", "crypto", 8, true),
      asset("usdt", "USDT", "crypto", 6),
      asset("gold", "XAU-CUSTOM", "custom", 6),
    ],
    mappings: [
      {
        assetId: "eur",
        provider: "ecb",
        providerAssetKey: "EUR",
        isEnabled: true,
        priority: 0,
      },
      {
        assetId: "usd",
        provider: "ecb",
        providerAssetKey: "USD",
        isEnabled: true,
        priority: 1,
      },
      {
        assetId: "cny",
        provider: "ecb",
        providerAssetKey: "CNY",
        isEnabled: true,
        priority: 2,
      },
      {
        assetId: "btc",
        provider: "coingecko",
        providerAssetKey: "bitcoin",
        isEnabled: true,
        priority: 1,
      },
      {
        assetId: "usdt",
        provider: "coingecko",
        providerAssetKey: "tether",
        isEnabled: true,
        priority: 1,
      },
    ],
    manualQuotes: [
      {
        id: "manual-gold-cny",
        baseAssetId: "gold",
        quoteAssetId: "cny",
        valuationDate: "2026-08-15",
        rateText: "815.125",
        note: "fixture",
        createdAt: FETCHED_AT,
        updatedAt: FETCHED_AT,
      },
    ],
    priceObservations: [
      {
        id: "btc-14",
        baseAssetId: "btc",
        quoteAssetId: "usd",
        provider: "coingecko",
        granularity: "hourly",
        rateText: "118000.123456789",
        providerObservedAt: "2026-08-15T14:00:00.000Z",
        fetchedAt: FETCHED_AT,
        sourceMetadataJson: null,
      },
      {
        id: "btc-15",
        baseAssetId: "btc",
        quoteAssetId: "usd",
        provider: "coingecko",
        granularity: "hourly",
        rateText: "118100.987654321",
        providerObservedAt: "2026-08-15T15:00:00.000Z",
        fetchedAt: FETCHED_AT,
        sourceMetadataJson: null,
      },
      {
        id: "btc-future",
        baseAssetId: "btc",
        quoteAssetId: "usd",
        provider: "coingecko",
        granularity: "hourly",
        rateText: "999999",
        providerObservedAt: "2026-08-15T16:00:00.000Z",
        fetchedAt: FETCHED_AT,
        sourceMetadataJson: null,
      },
      {
        id: "usdt-daily",
        baseAssetId: "usdt",
        quoteAssetId: "usd",
        provider: "coingecko",
        granularity: "daily",
        rateText: "0.9972",
        providerObservedAt: "2026-08-15T00:00:00.000Z",
        fetchedAt: FETCHED_AT,
        sourceMetadataJson: null,
      },
    ],
    fxObservations: [
      {
        id: "eur-usd",
        baseAssetId: "eur",
        quoteAssetId: "usd",
        provider: "ecb",
        rateText: "1.1701",
        providerObservationDate: "2026-08-14",
        fetchedAt: FETCHED_AT,
        sourceMetadataJson: null,
      },
      {
        id: "eur-cny",
        baseAssetId: "eur",
        quoteAssetId: "cny",
        provider: "ecb",
        rateText: "8.4201",
        providerObservationDate: "2026-08-14",
        fetchedAt: FETCHED_AT,
        sourceMetadataJson: null,
      },
    ],
  };
}

describe("historical quote resolution", () => {
  it("resolves identity and same-day ECB legs without degradation", () => {
    expect(
      resolveHistoricalQuote(fixture(), {
        baseAssetId: "cny",
        homeAssetId: "cny",
        localDate: "2026-08-15",
        queryTime: "2026-08-15T15:59:59.999Z",
      }),
    ).toMatchObject({
      ok: true,
      rateText: "1",
      degraded: false,
      legs: [{ source: "identity", kind: "identity" }],
    });

    const sameDay = fixture();
    sameDay.fxObservations = sameDay.fxObservations.map((quote) => ({
      ...quote,
      providerObservationDate: "2026-08-15",
    }));
    expect(
      resolveHistoricalQuote(sameDay, {
        baseAssetId: "usd",
        homeAssetId: "cny",
        localDate: "2026-08-15",
        queryTime: "2026-08-15T15:59:59.999Z",
      }),
    ).toMatchObject({
      ok: true,
      degraded: false,
      legs: [
        { source: "ecb", kind: "fx_reference_same_day" },
        { source: "ecb", kind: "fx_reference_same_day" },
      ],
    });
  });

  it("uses manual exact-pair quotes before automatic paths", () => {
    const result = resolveHistoricalQuote(fixture(), {
      baseAssetId: "gold",
      homeAssetId: "cny",
      localDate: "2026-08-15",
      queryTime: "2026-08-15T15:59:59.999Z",
    });
    expect(result).toMatchObject({
      ok: true,
      rateText: "815.125",
      degraded: false,
      legs: [{ source: "manual", kind: "manual" }],
    });
  });

  it("resolves an archived crypto asset from the latest prior quote", () => {
    const result = resolveHistoricalQuote(fixture(), {
      baseAssetId: "btc",
      homeAssetId: "cny",
      localDate: "2026-08-15",
      queryTime: "2026-08-15T15:59:59.999Z",
    });
    const expectedUsdToCny = divideDecimalTexts("8.4201", "1.1701");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rateText).toBe(
      multiplyDecimalTexts("118100.987654321", expectedUsdToCny),
    );
    expect(result.legs[0]).toMatchObject({
      source: "coingecko",
      kind: "hourly_prior",
      providerObservedAt: "2026-08-15T15:00:00.000Z",
    });
    expect(result.legs.some((leg) => leg.kind === "fx_carry_forward")).toBe(
      true,
    );
    expect(result.degraded).toBe(true);
  });

  it("uses daily fallback without treating a stablecoin as USD identity", () => {
    const result = resolveHistoricalQuote(fixture(), {
      baseAssetId: "usdt",
      homeAssetId: "usd",
      localDate: "2026-08-15",
      queryTime: "2026-08-15T15:59:59.999Z",
    });
    expect(result).toMatchObject({
      ok: true,
      rateText: "0.9972",
      degraded: true,
      legs: [{ source: "coingecko", kind: "daily_fallback" }],
    });
  });

  it("rejects stale crypto and ECB observations instead of filling zero", () => {
    const staleCrypto = fixture();
    staleCrypto.priceObservations = staleCrypto.priceObservations.map(
      (quote) => ({
        ...quote,
        providerObservedAt: "2026-08-12T00:00:00.000Z",
      }),
    );
    expect(
      resolveHistoricalQuote(staleCrypto, {
        baseAssetId: "btc",
        homeAssetId: "usd",
        localDate: "2026-08-15",
        queryTime: "2026-08-15T15:59:59.999Z",
      }),
    ).toMatchObject({ ok: false, status: "missing_quote" });

    const staleFx = fixture();
    staleFx.fxObservations = staleFx.fxObservations.map((quote) => ({
      ...quote,
      providerObservationDate: "2026-08-01",
    }));
    expect(
      resolveHistoricalQuote(staleFx, {
        baseAssetId: "usd",
        homeAssetId: "cny",
        localDate: "2026-08-15",
        queryTime: "2026-08-15T15:59:59.999Z",
      }),
    ).toMatchObject({ ok: false, status: "missing_quote" });
  });

  it("keeps custom assets unsupported without the exact date and pair", () => {
    expect(
      resolveHistoricalQuote(fixture(), {
        baseAssetId: "gold",
        homeAssetId: "cny",
        localDate: "2026-08-14",
        queryTime: "2026-08-14T15:59:59.999Z",
      }),
    ).toMatchObject({ ok: false, status: "unsupported" });
  });
});
