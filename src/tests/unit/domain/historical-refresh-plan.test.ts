import { describe, expect, it } from "vitest";

import {
  historicalMappingFingerprint,
  planHistoricalRefresh,
} from "../../../domain/historical-refresh-plan";
import type {
  ProviderMapping,
  ValuationAsset,
} from "../../../domain/quote-types";

const assets: ValuationAsset[] = [
  {
    id: "eur",
    code: "EUR",
    name: "Euro",
    symbol: "€",
    assetType: "fiat",
    scale: 2,
    isArchived: false,
    sortOrder: 0,
  },
  {
    id: "usd",
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    assetType: "fiat",
    scale: 2,
    isArchived: false,
    sortOrder: 1,
  },
  {
    id: "cny",
    code: "CNY",
    name: "Chinese Yuan",
    symbol: "¥",
    assetType: "fiat",
    scale: 2,
    isArchived: true,
    sortOrder: 2,
  },
  {
    id: "btc",
    code: "BTC",
    name: "Bitcoin",
    symbol: null,
    assetType: "crypto",
    scale: 8,
    isArchived: true,
    sortOrder: 3,
  },
];

const mappings: ProviderMapping[] = [
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
];

describe("historical refresh planning", () => {
  it("adds lookback, retains archived mappings, and caps hourly units at 100 days", () => {
    const units = planHistoricalRefresh({
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
      timeZone: "Asia/Shanghai",
      assets,
      mappings,
    });
    const crypto = units.filter((unit) => unit.provider === "coingecko");
    const ecb = units.filter((unit) => unit.provider === "ecb");
    expect(crypto).toHaveLength(4);
    expect(crypto.every((unit) => unit.assetId === "btc")).toBe(true);
    expect(crypto[0]?.fromBoundary).toBe("2024-12-30T14:00:00.000Z");
    for (const unit of crypto) {
      const span = Date.parse(unit.toBoundary) - Date.parse(unit.fromBoundary);
      expect(span).toBeLessThan(100 * 24 * 60 * 60 * 1_000);
      expect(unit.intervalKind).toBe("hourly");
    }
    expect(ecb).toHaveLength(2);
    expect(ecb[0]?.fromBoundary).toBe("2024-12-25");
    expect(JSON.parse(ecb[0]!.providerScopeJson).mappings).toEqual([
      { assetId: "usd", providerAssetKey: "USD" },
      { assetId: "cny", providerAssetKey: "CNY" },
    ]);
  });

  it("uses daily units before CoinGecko hourly availability", () => {
    const units = planHistoricalRefresh({
      fromDate: "2017-12-01",
      toDate: "2018-02-05",
      timeZone: "UTC",
      assets,
      mappings,
    }).filter((unit) => unit.provider === "coingecko");
    expect(units.map((unit) => unit.intervalKind)).toEqual(["daily", "hourly"]);
    expect(units[0]?.toBoundary).toBe("2018-01-29T23:59:59.999Z");
    expect(units[1]?.fromBoundary).toBe("2018-01-30T00:00:00.000Z");
  });

  it("fingerprints enablement and provider keys deterministically", () => {
    const first = historicalMappingFingerprint(mappings);
    expect(historicalMappingFingerprint([...mappings].reverse())).toBe(first);
    expect(
      historicalMappingFingerprint(
        mappings.map((mapping) =>
          mapping.assetId === "btc"
            ? { ...mapping, providerAssetKey: "wrapped-bitcoin" }
            : mapping,
        ),
      ),
    ).not.toBe(first);
    expect(
      historicalMappingFingerprint(
        mappings.map((mapping) =>
          mapping.assetId === "btc"
            ? { ...mapping, isEnabled: false }
            : mapping,
        ),
      ),
    ).not.toBe(first);
  });

  it("bounds ECB currency batches independently from date chunks", () => {
    const extraAssets = Array.from({ length: 101 }, (_, index) => ({
      id: `fiat-${index}`,
      code: `F${String(index).padStart(3, "0")}`,
      name: `Fixture fiat ${index}`,
      symbol: null,
      assetType: "fiat" as const,
      scale: 2,
      isArchived: false,
      sortOrder: 100 + index,
    }));
    const extraMappings = extraAssets.map((asset, index) => ({
      assetId: asset.id,
      provider: "ecb" as const,
      providerAssetKey: `X${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`,
      isEnabled: true,
      priority: 100 + index,
    }));
    const units = planHistoricalRefresh({
      fromDate: "2026-08-14",
      toDate: "2026-08-14",
      timeZone: "UTC",
      assets: [...assets, ...extraAssets],
      mappings: [mappings[0]!, ...extraMappings],
    });
    const scopes = units.map((unit) => JSON.parse(unit.providerScopeJson));
    expect(units).toHaveLength(3);
    expect(scopes.map((scope) => scope.mappings.length)).toEqual([50, 50, 1]);
  });
});
