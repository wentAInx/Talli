import { parse } from "csv-parse/sync";

import { normalizePositiveDecimalText } from "../domain/price-decimal";
import { canonicalUtcInstantValue } from "../domain/time";
import type { ProviderMapping, ProviderQuote } from "../domain/quote-types";
import { assertProviderHttpStatus, PriceProviderError } from "./errors";
import type { EcbPriceProvider, PriceHttpTransport } from "./types";

interface EcbProviderOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

interface EcbCsvRow {
  CURRENCY?: string;
  TIME_PERIOD?: string;
  OBS_VALUE?: string;
  [key: string]: string | undefined;
}

function ecbCurrencyKey(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new PriceProviderError(
      "CONFIG_ERROR",
      "ECB provider keys must be three-letter currency codes.",
    );
  }
  return normalized;
}

export class EcbProvider implements EcbPriceProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly transport: PriceHttpTransport,
    options: EcbProviderOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? "https://data-api.ecb.europa.eu/service/";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async fetchEurReferenceQuotes(input: {
    mappings: ProviderMapping[];
    eurAssetId: string;
    fetchedAt: string;
  }): Promise<ProviderQuote[]> {
    canonicalUtcInstantValue(input.fetchedAt);
    const mappings = input.mappings
      .filter((mapping) => mapping.provider === "ecb" && mapping.isEnabled)
      .map((mapping) => ({
        ...mapping,
        currency: ecbCurrencyKey(mapping.providerAssetKey),
      }));
    const requested = [...new Set(mappings.map((mapping) => mapping.currency))]
      .filter((currency) => currency !== "EUR")
      .sort();
    if (requested.length === 0) return [];

    const url = new URL(
      `data/EXR/D.${requested.join("+")}.EUR.SP00.A`,
      this.baseUrl,
    );
    url.searchParams.set("lastNObservations", "1");
    url.searchParams.set("format", "csvdata");
    url.searchParams.set("detail", "dataonly");
    const response = await this.transport.get({
      url,
      timeoutMs: this.timeoutMs,
    });
    assertProviderHttpStatus({
      status: response.status,
      headers: response.headers,
      fetchedAt: input.fetchedAt,
      providerLabel: "ECB",
    });

    let rows: EcbCsvRow[];
    try {
      rows = parse<EcbCsvRow>(response.text, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new PriceProviderError(
        "UPSTREAM_PAYLOAD_INVALID",
        "ECB returned malformed CSV.",
      );
    }
    const latest = new Map<string, { date: string; rateText: string }>();
    for (const row of rows) {
      const currency = row.CURRENCY?.trim().toUpperCase();
      const date = row.TIME_PERIOD?.trim();
      const rawRate = row.OBS_VALUE?.trim();
      if (!currency || !date || !rawRate || !requested.includes(currency)) {
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          `ECB returned an invalid observation date for ${currency}.`,
        );
      }
      let rateText: string;
      try {
        rateText = normalizePositiveDecimalText(rawRate);
      } catch {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          `ECB returned an invalid OBS_VALUE for ${currency}.`,
        );
      }
      if (!latest.has(currency) || latest.get(currency)!.date < date) {
        latest.set(currency, { date, rateText });
      }
    }
    for (const currency of requested) {
      if (!latest.has(currency)) {
        throw new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          `ECB omitted the configured currency ${currency}.`,
        );
      }
    }

    return mappings
      .filter((mapping) => mapping.currency !== "EUR")
      .map((mapping) => {
        const observation = latest.get(mapping.currency)!;
        return {
          baseAssetId: input.eurAssetId,
          quoteAssetId: mapping.assetId,
          provider: "ecb",
          kind: "reference",
          rateText: observation.rateText,
          providerObservedAt: null,
          providerObservationDate: observation.date,
          fetchedAt: input.fetchedAt,
          sourceMetadataJson: JSON.stringify({
            providerAssetKey: mapping.currency,
          }),
        };
      });
  }
}
