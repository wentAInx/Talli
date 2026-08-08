import { describe, expect, it } from "vitest";

import { resolveCurrentQuote } from "../../../domain/quote-math";
import type {
  ProviderQuote,
  QuoteResolverSnapshot,
  ValuationAsset,
} from "../../../domain/quote-types";

const now = "2026-08-08T12:00:00.000Z";
const assetDefinitions: Array<
  Pick<ValuationAsset, "id" | "code" | "assetType" | "scale">
> = [
  { id: "cny", code: "CNY", assetType: "fiat", scale: 2 },
  { id: "usd", code: "USD", assetType: "fiat", scale: 2 },
  { id: "eur", code: "EUR", assetType: "fiat", scale: 2 },
  { id: "btc", code: "BTC", assetType: "crypto", scale: 8 },
  { id: "usdt", code: "USDT", assetType: "crypto", scale: 6 },
  { id: "custom", code: "XYZ", assetType: "custom", scale: 4 },
];
const assets: ValuationAsset[] = assetDefinitions.map((asset, sortOrder) => ({
  ...asset,
  name: asset.code,
  symbol: null,
  isArchived: false,
  sortOrder,
}));

const mappings: QuoteResolverSnapshot["mappings"] = [
  ["cny", "ecb", "CNY"],
  ["usd", "ecb", "USD"],
  ["eur", "ecb", "EUR"],
  ["btc", "coingecko", "bitcoin"],
  ["usdt", "coingecko", "tether"],
].map(([assetId, provider, providerAssetKey]) => ({
  assetId,
  provider: provider as "coingecko" | "ecb",
  providerAssetKey,
  isEnabled: true,
  priority: 100,
}));

function quote(
  baseAssetId: string,
  quoteAssetId: string,
  provider: "coingecko" | "ecb",
  rateText: string,
  fetchedAt = now,
): ProviderQuote {
  return {
    baseAssetId,
    quoteAssetId,
    provider,
    kind: provider === "ecb" ? "reference" : "spot",
    rateText,
    providerObservedAt: provider === "coingecko" ? fetchedAt : null,
    providerObservationDate: provider === "ecb" ? "2026-08-08" : null,
    fetchedAt,
    sourceMetadataJson: null,
  };
}

function snapshot(
  providerQuotes: ProviderQuote[] = [
    quote("eur", "usd", "ecb", "1.10"),
    quote("eur", "cny", "ecb", "7.70"),
    quote("btc", "usd", "coingecko", "68000"),
    quote("usdt", "usd", "coingecko", "0.9972"),
  ],
): QuoteResolverSnapshot {
  return {
    assets,
    mappings,
    manualQuotes: [],
    providerQuotes,
    providerStates: [],
  };
}

function resolve(
  baseAssetId: string,
  homeAssetId: string,
  source = snapshot(),
) {
  return resolveCurrentQuote(source, {
    baseAssetId,
    homeAssetId,
    queryTime: now,
  });
}

describe("current quote resolution", () => {
  it("Q-001 resolves identity without cache", () => {
    expect(resolve("cny", "cny", snapshot([]))).toMatchObject({
      ok: true,
      status: "identity",
      rateText: "1",
    });
  });

  it("Q-002 uses the direct ECB EUR leg", () => {
    expect(resolve("eur", "cny")).toMatchObject({
      ok: true,
      rateText: "7.7",
      legs: [{ source: "ecb" }],
    });
  });

  it("Q-003 computes an ECB cross rate", () => {
    expect(resolve("usd", "cny")).toMatchObject({
      ok: true,
      rateText: "7",
      legs: [{ source: "ecb" }, { source: "ecb" }],
    });
  });

  it("Q-004 computes a precise ECB inverse", () => {
    const result = resolve("usd", "eur");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rateText).toMatch(/^0\.9090909090909090/);
    }
  });

  it("Q-005 composes crypto/USD with USD/Home and keeps both legs", () => {
    expect(resolve("btc", "cny")).toMatchObject({
      ok: true,
      rateText: "476000",
      legs: [
        { source: "coingecko", rateText: "68000" },
        { source: "ecb" },
        { source: "ecb" },
      ],
    });
  });

  it("Q-006 gives active manual exact-pair quote precedence", () => {
    const source = snapshot();
    source.manualQuotes = [
      {
        id: "manual",
        baseAssetId: "btc",
        quoteAssetId: "cny",
        rateText: "480000",
        observedAt: now,
        note: null,
        isActive: true,
      },
    ];
    expect(resolve("btc", "cny", source)).toMatchObject({
      ok: true,
      status: "manual",
      rateText: "480000",
      legs: [{ source: "manual" }],
    });
  });

  it("Q-007 never turns the USDT market fixture into a 1:1 peg", () => {
    expect(resolve("usdt", "usd")).toMatchObject({
      ok: true,
      rateText: "0.9972",
      legs: [{ source: "coingecko" }],
    });
  });

  it("Q-008 requires a manual exact pair for custom assets", () => {
    expect(resolve("custom", "cny")).toMatchObject({
      ok: false,
      status: "unsupported",
    });
  });

  it("keeps USD and EUR bridge identity stable when display codes are renamed", () => {
    const source = snapshot();
    source.assets = source.assets.map((asset) =>
      asset.id === "usd"
        ? { ...asset, code: "US_DOLLAR" }
        : asset.id === "eur"
          ? { ...asset, code: "EURO" }
          : asset,
    );
    expect(resolve("btc", "cny", source)).toMatchObject({
      ok: true,
      rateText: "476000",
    });
  });

  it("rejects an archived Home Asset even for identity", () => {
    const source = snapshot([]);
    source.assets = source.assets.map((asset) =>
      asset.id === "cny" ? { ...asset, isArchived: true } : asset,
    );
    expect(resolve("cny", "cny", source)).toMatchObject({
      ok: false,
      status: "unsupported",
    });
  });

  it("propagates stale and rejects quotes beyond the usable window", () => {
    const stale = snapshot([
      quote("eur", "usd", "ecb", "1.10"),
      quote("eur", "cny", "ecb", "7.70", "2026-08-08T00:00:00.000Z"),
    ]);
    expect(resolve("usd", "cny", stale)).toMatchObject({
      ok: true,
      status: "stale",
    });

    const expired = snapshot([
      quote("usdt", "usd", "coingecko", "0.9972", "2026-08-07T11:59:59.999Z"),
    ]);
    expect(resolve("usdt", "usd", expired)).toMatchObject({
      ok: false,
      status: "missing_quote",
    });
  });

  it("keeps a recently fetched ECB reference stale-usable for seven days", () => {
    const source = snapshot([
      quote("eur", "usd", "ecb", "1.10", "2026-08-01T12:00:00.001Z"),
      quote("eur", "cny", "ecb", "7.70", "2026-08-01T12:00:00.001Z"),
    ]);
    expect(resolve("usd", "cny", source)).toMatchObject({
      ok: true,
      status: "stale",
    });

    source.providerQuotes = source.providerQuotes.map((item) => ({
      ...item,
      fetchedAt: "2026-08-01T11:59:59.999Z",
    }));
    source.providerStates = [
      {
        provider: "ecb",
        lastAttemptAt: now,
        lastSuccessAt: null,
        lastErrorCode: "UPSTREAM_ERROR",
        lastErrorMessage: "Unavailable.",
        cooldownUntil: null,
      },
    ];
    expect(resolve("usd", "cny", source)).toMatchObject({
      ok: false,
      status: "provider_error",
    });
  });
});
