import { describe, expect, it } from "vitest";

import type { ProviderMapping } from "../../../domain/quote-types";
import { EcbProvider } from "../../../providers/ecb";
import type { PriceHttpTransport } from "../../../providers/types";

const FETCHED_AT = "2026-08-09T12:00:00.000Z";

class StubTransport implements PriceHttpTransport {
  calls: Parameters<PriceHttpTransport["get"]>[0][] = [];

  constructor(private readonly text: string) {}

  async get(input: Parameters<PriceHttpTransport["get"]>[0]) {
    this.calls.push(input);
    return { status: 200, headers: new Headers(), text: this.text };
  }
}

function mapping(assetId: string, currency: string): ProviderMapping {
  return {
    assetId,
    provider: "ecb",
    providerAssetKey: currency,
    isEnabled: true,
    priority: 100,
  };
}

describe("EcbProvider", () => {
  it("builds a sorted series key and parses shuffled quoted CSV headers", async () => {
    const transport = new StubTransport(
      [
        "OBS_VALUE,EXTRA,TIME_PERIOD,CURRENCY",
        '7.90,"quoted, field",2026-08-07,HKD',
        "7.75,x,2026-08-07,CNY",
        "1.17,x,2026-08-07,USD",
      ].join("\n"),
    );
    const provider = new EcbProvider(transport);

    const quotes = await provider.fetchEurReferenceQuotes({
      mappings: [
        mapping("asset-usd", "USD"),
        mapping("asset-eur", "EUR"),
        mapping("asset-cny", "CNY"),
        mapping("asset-hkd", "HKD"),
      ],
      eurAssetId: "asset-eur",
      fetchedAt: FETCHED_AT,
    });

    expect(transport.calls).toHaveLength(1);
    expect(decodeURI(transport.calls[0]!.url.pathname)).toBe(
      "/service/data/EXR/D.CNY+HKD+USD.EUR.SP00.A",
    );
    expect(transport.calls[0]!.url.searchParams.get("lastNObservations")).toBe(
      "1",
    );
    expect(quotes).toHaveLength(3);
    expect(quotes).not.toContainEqual(
      expect.objectContaining({ quoteAssetId: "asset-eur" }),
    );
    expect(quotes).toContainEqual(
      expect.objectContaining({
        baseAssetId: "asset-eur",
        quoteAssetId: "asset-cny",
        rateText: "7.75",
        providerObservationDate: "2026-08-07",
        kind: "reference",
      }),
    );
  });

  it("accepts the latest official observation from the previous workday", async () => {
    const transport = new StubTransport(
      "CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,2026-08-07,1.17\n",
    );
    const provider = new EcbProvider(transport);

    const quotes = await provider.fetchEurReferenceQuotes({
      mappings: [mapping("asset-usd", "USD")],
      eurAssetId: "asset-eur",
      fetchedAt: FETCHED_AT,
    });

    expect(quotes[0]?.providerObservationDate).toBe("2026-08-07");
    expect(quotes[0]?.fetchedAt).toBe(FETCHED_AT);
  });

  it("does no HTTP work for an EUR-only mapping", async () => {
    const transport = new StubTransport("");
    const provider = new EcbProvider(transport);

    await expect(
      provider.fetchEurReferenceQuotes({
        mappings: [mapping("asset-eur", "EUR")],
        eurAssetId: "asset-eur",
        fetchedAt: FETCHED_AT,
      }),
    ).resolves.toEqual([]);
    expect(transport.calls).toHaveLength(0);
  });

  it.each(["0", "-1", "1e-8", "NaN"])(
    "rejects invalid OBS_VALUE %s",
    async (value) => {
      const provider = new EcbProvider(
        new StubTransport(
          `CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,2026-08-07,${value}\n`,
        ),
      );

      await expect(
        provider.fetchEurReferenceQuotes({
          mappings: [mapping("asset-usd", "USD")],
          eurAssetId: "asset-eur",
          fetchedAt: FETCHED_AT,
        }),
      ).rejects.toMatchObject({ code: "UPSTREAM_PAYLOAD_INVALID" });
    },
  );

  it("rejects omitted configured currencies", async () => {
    const provider = new EcbProvider(
      new StubTransport(
        "CURRENCY,TIME_PERIOD,OBS_VALUE\nCNY,2026-08-07,7.75\n",
      ),
    );

    await expect(
      provider.fetchEurReferenceQuotes({
        mappings: [mapping("asset-usd", "USD")],
        eurAssetId: "asset-eur",
        fetchedAt: FETCHED_AT,
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_PAYLOAD_INVALID" });
  });
});
