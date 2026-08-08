import {
  normalizeExternalNumberDecimal,
  normalizePositiveDecimalText,
} from "../domain/price-decimal";
import { canonicalUtcInstantValue } from "../domain/time";
import type { ProviderMapping, ProviderQuote } from "../domain/quote-types";
import { assertProviderHttpStatus, PriceProviderError } from "./errors";
import type { CoinGeckoPriceProvider, PriceHttpTransport } from "./types";

interface CoinGeckoProviderOptions {
  mode: "demo" | "keyless";
  apiKey?: string | null;
  baseUrl?: string;
  timeoutMs?: number;
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

export class CoinGeckoProvider implements CoinGeckoPriceProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly transport: PriceHttpTransport,
    private readonly options: CoinGeckoProviderOptions,
  ) {
    this.baseUrl = options.baseUrl ?? "https://api.coingecko.com/api/v3/";
    this.timeoutMs = options.timeoutMs ?? 8_000;
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
    if (this.options.mode === "demo" && !this.options.apiKey?.trim()) {
      throw new PriceProviderError(
        "CONFIG_ERROR",
        "CoinGecko demo mode requires a server-side API key.",
      );
    }
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
    const headers =
      this.options.mode === "demo"
        ? { "x-cg-demo-api-key": this.options.apiKey!.trim() }
        : undefined;
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
}
