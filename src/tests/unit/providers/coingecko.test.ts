import { describe, expect, it } from "vitest";

import type { ProviderMapping } from "../../../domain/quote-types";
import { CoinGeckoProvider } from "../../../providers/coingecko";
import { PriceProviderError } from "../../../providers/errors";
import type { PriceHttpTransport } from "../../../providers/types";

const FETCHED_AT = "2026-08-08T12:00:00.000Z";

class StubTransport implements PriceHttpTransport {
  calls: Parameters<PriceHttpTransport["get"]>[0][] = [];

  constructor(
    private readonly response: {
      status: number;
      headers?: Headers;
      text: string;
    },
  ) {}

  async get(input: Parameters<PriceHttpTransport["get"]>[0]) {
    this.calls.push(input);
    return {
      status: this.response.status,
      headers: this.response.headers ?? new Headers(),
      text: this.response.text,
    };
  }
}

function mapping(assetId: string, providerAssetKey: string): ProviderMapping {
  return {
    assetId,
    provider: "coingecko",
    providerAssetKey,
    isEnabled: true,
    priority: 100,
  };
}

describe("CoinGeckoProvider", () => {
  it("batches provider IDs, requests USD, and sends only the demo key header", async () => {
    const transport = new StubTransport({
      status: 200,
      text: JSON.stringify({
        bitcoin: { usd: 68123.456789, last_updated_at: 1_754_656_800 },
        tether: { usd: 0.9972 },
      }),
    });
    const provider = new CoinGeckoProvider(transport, {
      mode: "demo",
      apiKey: "test-secret",
    });

    const quotes = await provider.fetchCryptoUsdQuotes({
      mappings: [
        mapping("asset-usdt", "tether"),
        mapping("asset-btc", "bitcoin"),
      ],
      usdAssetId: "asset-usd",
      fetchedAt: FETCHED_AT,
    });

    expect(transport.calls).toHaveLength(1);
    const call = transport.calls[0]!;
    expect(call.url.pathname).toBe("/api/v3/simple/price");
    expect(call.url.searchParams.get("ids")).toBe("bitcoin,tether");
    expect(call.url.searchParams.get("vs_currencies")).toBe("usd");
    expect(call.url.searchParams.get("include_last_updated_at")).toBe("true");
    expect(call.headers).toEqual({ "x-cg-demo-api-key": "test-secret" });
    expect(quotes.map((quote) => [quote.baseAssetId, quote.rateText])).toEqual([
      ["asset-usdt", "0.9972"],
      ["asset-btc", "68123.456789"],
    ]);
    expect(quotes[0]?.providerObservedAt).toBe(FETCHED_AT);
    expect(quotes[0]?.sourceMetadataJson).toContain(
      '"observationFallback":true',
    );
  });

  it("supports explicitly configured keyless mode without an auth header", async () => {
    const transport = new StubTransport({
      status: 200,
      text: '{"usd-coin":{"usd":"0.9998"}}',
    });
    const provider = new CoinGeckoProvider(transport, { mode: "keyless" });

    await provider.fetchCryptoUsdQuotes({
      mappings: [mapping("asset-usdc", "usd-coin")],
      usdAssetId: "asset-usd",
      fetchedAt: FETCHED_AT,
    });

    expect(transport.calls[0]?.headers).toBeUndefined();
  });

  it.each([
    ["small", 0.00000001, "0.00000001"],
    ["large", 1e21, "1000000000000000000000"],
  ])(
    "normalizes a valid %s JSON number to plain decimal text",
    async (_label, rawUsd, expected) => {
      const provider = new CoinGeckoProvider(
        new StubTransport({
          status: 200,
          text: JSON.stringify({ bitcoin: { usd: rawUsd } }),
        }),
        { mode: "keyless" },
      );

      const quotes = await provider.fetchCryptoUsdQuotes({
        mappings: [mapping("asset-btc", "bitcoin")],
        usdAssetId: "asset-usd",
        fetchedAt: FETCHED_AT,
      });

      expect(quotes[0]?.rateText).toBe(expected);
    },
  );

  it.each([
    [401, "AUTH_ERROR"],
    [403, "AUTH_ERROR"],
    [500, "UPSTREAM_ERROR"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    const provider = new CoinGeckoProvider(
      new StubTransport({ status, text: "upstream unavailable" }),
      { mode: "keyless" },
    );

    await expect(
      provider.fetchCryptoUsdQuotes({
        mappings: [mapping("asset-btc", "bitcoin")],
        usdAssetId: "asset-usd",
        fetchedAt: FETCHED_AT,
      }),
    ).rejects.toMatchObject({ code });
  });

  it("preserves Retry-After metadata for refresh coordination", async () => {
    const provider = new CoinGeckoProvider(
      new StubTransport({
        status: 429,
        headers: new Headers({ "retry-after": "120" }),
        text: "rate limited",
      }),
      { mode: "keyless" },
    );

    await expect(
      provider.fetchCryptoUsdQuotes({
        mappings: [mapping("asset-btc", "bitcoin")],
        usdAssetId: "asset-usd",
        fetchedAt: FETCHED_AT,
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 120,
    });
  });

  it.each([
    ["malformed", "not-json"],
    ["missing id", "{}"],
    ["zero price", '{"bitcoin":{"usd":0}}'],
    ["scientific text", '{"bitcoin":{"usd":"1e-8"}}'],
  ])("rejects %s payloads", async (_label, text) => {
    const provider = new CoinGeckoProvider(
      new StubTransport({ status: 200, text }),
      { mode: "keyless" },
    );

    await expect(
      provider.fetchCryptoUsdQuotes({
        mappings: [mapping("asset-btc", "bitcoin")],
        usdAssetId: "asset-usd",
        fetchedAt: FETCHED_AT,
      }),
    ).rejects.toBeInstanceOf(PriceProviderError);
  });

  it("rejects demo mode without a configured key before HTTP", async () => {
    const transport = new StubTransport({ status: 200, text: "{}" });
    const provider = new CoinGeckoProvider(transport, { mode: "demo" });

    await expect(
      provider.fetchCryptoUsdQuotes({
        mappings: [mapping("asset-btc", "bitcoin")],
        usdAssetId: "asset-usd",
        fetchedAt: FETCHED_AT,
      }),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });
    expect(transport.calls).toHaveLength(0);
  });
});
