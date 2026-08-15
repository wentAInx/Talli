import {
  normalizeExternalNumberDecimal,
  normalizePositiveDecimalText,
} from "../domain/price-decimal";
import type {
  HistoricalCryptoGranularity,
  HistoricalPriceObservation,
} from "../domain/historical-quote-types";
import { canonicalUtcInstantValue } from "../domain/time";
import type { ProviderMapping, ProviderQuote } from "../domain/quote-types";
import { assertProviderHttpStatus, PriceProviderError } from "./errors";
import type {
  CoinGeckoHistoricalProvider,
  CoinGeckoPriceProvider,
  PriceHttpTransport,
} from "./types";

interface CoinGeckoProviderOptions {
  mode: "demo" | "keyless" | "pro";
  apiKey?: string | null;
  baseUrl?: string;
  timeoutMs?: number;
}

const HISTORICAL_BOUNDARY_TOLERANCE_MS = 5 * 60 * 1_000;

function rateTextFromExternal(value: unknown): string {
  try {
    if (typeof value === "number") return normalizeExternalNumberDecimal(value);
    if (typeof value === "string") return normalizePositiveDecimalText(value);
  } catch {
    // Normalize every provider parse failure to a safe provider error below.
  }
  throw new PriceProviderError(
    "UPSTREAM_PAYLOAD_INVALID",
    "CoinGecko returned an invalid historical USD price.",
  );
}

function observedAt(
  raw: unknown,
  fetchedAt: string,
): {
  value: string;
  fallback: boolean;
} {
  if (raw === undefined || raw === null) {
    return { value: fetchedAt, fallback: true };
  }
  if (
    (typeof raw !== "number" && typeof raw !== "string") ||
    !/^\d+$/.test(String(raw))
  ) {
    throw new PriceProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "CoinGecko last_updated_at is invalid.",
    );
  }
  const epochSeconds = Number.parseInt(String(raw), 10);
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds <= 0) {
    throw new PriceProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "CoinGecko last_updated_at is invalid.",
    );
  }
  return {
    value: new Date(epochSeconds * 1000).toISOString(),
    fallback: false,
  };
}

export class CoinGeckoProvider
  implements CoinGeckoPriceProvider, CoinGeckoHistoricalProvider
{
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly transport: PriceHttpTransport,
    private readonly options: CoinGeckoProviderOptions,
  ) {
    this.baseUrl =
      options.baseUrl ??
      (options.mode === "pro"
        ? "https://pro-api.coingecko.com/api/v3/"
        : "https://api.coingecko.com/api/v3/");
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  private authHeaders(): Record<string, string> | undefined {
    if (this.options.mode === "keyless") return undefined;
    const apiKey = this.options.apiKey?.trim();
    if (!apiKey) {
      throw new PriceProviderError(
        "CONFIG_ERROR",
        `CoinGecko ${this.options.mode} mode requires a server-side API key.`,
      );
    }
    return this.options.mode === "pro"
      ? { "x-cg-pro-api-key": apiKey }
      : { "x-cg-demo-api-key": apiKey };
  }

  async fetchCryptoUsdQuotes(input: {
    mappings: ProviderMapping[];
    usdAssetId: string;
    fetchedAt: string;
  }): Promise<ProviderQuote[]> {
    canonicalUtcInstantValue(input.fetchedAt);
    const mappings = input.mappings.filter(
      (mapping) => mapping.provider === "coingecko" && mapping.isEnabled,
    );
    if (mappings.length === 0) return [];
    const headers = this.authHeaders();
    const ids = [
      ...new Set(mappings.map((mapping) => mapping.providerAssetKey)),
    ]
      .sort()
      .join(",");
    const url = new URL("simple/price", this.baseUrl);
    url.searchParams.set("ids", ids);
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_last_updated_at", "true");
    url.searchParams.set("precision", "full");
    const response = await this.transport.get({
      url,
      headers,
      timeoutMs: this.timeoutMs,
    });
    assertProviderHttpStatus({
      status: response.status,
      headers: response.headers,
      fetchedAt: input.fetchedAt,
      providerLabel: "CoinGecko",
    });

    let payload: unknown;
    try {
      payload = JSON.parse(response.text);
    } catch {
      throw new PriceProviderError(
        "UPSTREAM_PAYLOAD_INVALID",
        "CoinGecko returned malformed JSON.",
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new PriceProviderError(
        "UPSTREAM_PAYLOAD_INVALID",
        "CoinGecko response must be an object.",
      );
    }

    return mappings.map((mapping) => {
      const candidate = (payload as Record<string, unknown>)[
        mapping.providerAssetKey
      ];
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          `CoinGecko omitted the configured id ${mapping.providerAssetKey}.`,
        );
      }
      const rawUsd = (candidate as Record<string, unknown>).usd;
      if (typeof rawUsd !== "number" && typeof rawUsd !== "string") {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          `CoinGecko omitted USD price for ${mapping.providerAssetKey}.`,
        );
      }
      let rateText: string;
      try {
        rateText =
          typeof rawUsd === "number"
            ? normalizeExternalNumberDecimal(rawUsd)
            : normalizePositiveDecimalText(rawUsd);
      } catch {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          `CoinGecko returned an invalid USD price for ${mapping.providerAssetKey}.`,
        );
      }
      const observation = observedAt(
        (candidate as Record<string, unknown>).last_updated_at,
        input.fetchedAt,
      );
      return {
        baseAssetId: mapping.assetId,
        quoteAssetId: input.usdAssetId,
        provider: "coingecko",
        kind: "spot",
        rateText,
        providerObservedAt: observation.value,
        providerObservationDate: null,
        fetchedAt: input.fetchedAt,
        sourceMetadataJson: JSON.stringify({
          providerAssetKey: mapping.providerAssetKey,
          observationFallback: observation.fallback,
        }),
      };
    });
  }

  async fetchCryptoUsdHistory(input: {
    mapping: { assetId: string; providerAssetKey: string };
    usdAssetId: string;
    fromUtc: string;
    toUtc: string;
    interval: HistoricalCryptoGranularity;
    fetchedAt: string;
  }): Promise<HistoricalPriceObservation[]> {
    const from = canonicalUtcInstantValue(input.fromUtc);
    const to = canonicalUtcInstantValue(input.toUtc);
    canonicalUtcInstantValue(input.fetchedAt);
    if (from >= to) {
      throw new PriceProviderError(
        "CONFIG_ERROR",
        "CoinGecko historical range start must be before its end.",
      );
    }
    const providerAssetKey = input.mapping.providerAssetKey.trim();
    if (!providerAssetKey || providerAssetKey.length > 128) {
      throw new PriceProviderError(
        "CONFIG_ERROR",
        "CoinGecko provider asset key is invalid.",
      );
    }
    const url = new URL(
      `coins/${encodeURIComponent(providerAssetKey)}/market_chart/range`,
      this.baseUrl,
    );
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("from", String(Math.floor(from / 1_000)));
    url.searchParams.set("to", String(Math.ceil(to / 1_000)));
    url.searchParams.set("interval", input.interval);
    url.searchParams.set("precision", "full");
    const response = await this.transport.get({
      url,
      headers: this.authHeaders(),
      timeoutMs: this.timeoutMs,
    });
    assertProviderHttpStatus({
      status: response.status,
      headers: response.headers,
      fetchedAt: input.fetchedAt,
      providerLabel: "CoinGecko",
    });
    let payload: unknown;
    try {
      payload = JSON.parse(response.text);
    } catch {
      throw new PriceProviderError(
        "UPSTREAM_PAYLOAD_INVALID",
        "CoinGecko returned malformed JSON.",
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new PriceProviderError(
        "UPSTREAM_PAYLOAD_INVALID",
        "CoinGecko historical response must be an object.",
      );
    }
    const prices = (payload as Record<string, unknown>).prices;
    if (!Array.isArray(prices)) {
      throw new PriceProviderError(
        "UPSTREAM_PAYLOAD_INVALID",
        "CoinGecko historical response omitted prices.",
      );
    }
    const observations = new Map<number, HistoricalPriceObservation>();
    for (const point of prices) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        typeof point[0] !== "number" ||
        !Number.isSafeInteger(point[0]) ||
        point[0] <= 0 ||
        point[0] < from - HISTORICAL_BOUNDARY_TOLERANCE_MS ||
        point[0] > to + HISTORICAL_BOUNDARY_TOLERANCE_MS
      ) {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          "CoinGecko returned an invalid historical timestamp.",
        );
      }
      const rateText = rateTextFromExternal(point[1]);
      const previous = observations.get(point[0]);
      if (previous && previous.rateText !== rateText) {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          "CoinGecko returned conflicting duplicate historical prices.",
        );
      }
      observations.set(point[0], {
        baseAssetId: input.mapping.assetId,
        quoteAssetId: input.usdAssetId,
        provider: "coingecko",
        granularity: input.interval,
        rateText,
        providerObservedAt: new Date(point[0]).toISOString(),
        fetchedAt: input.fetchedAt,
        sourceMetadataJson: JSON.stringify({
          providerAssetKey,
          interval: input.interval,
        }),
      });
    }
    return [...observations.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, observation]) => observation);
  }
}
