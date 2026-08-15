import { addLocalDateDays, canonicalUtcInstantValue } from "../domain/time";
import type {
  HistoricalFxObservation,
  HistoricalPriceObservation,
} from "../domain/historical-quote-types";
import { PriceProviderError } from "./errors";
import type { HistoricalPriceProviderAdapters } from "./types";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

const CRYPTO_RATES = new Map([
  ["tether", "0.9972"],
  ["usd-coin", "0.9998"],
  ["bitcoin", "68000"],
  ["ethereum", "3400"],
  ["solana", "150"],
]);

const FX_RATES = new Map([
  ["CNY", "7.7"],
  ["HKD", "8.5"],
  ["USD", "1.1"],
]);

function assertFixtureAllowed(): void {
  if (
    process.env.TALLI_E2E_HISTORICAL_FIXTURE !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new PriceProviderError(
      "CONFIG_ERROR",
      "Historical E2E fixture provider is not available.",
    );
  }
}

function utcObservations(input: {
  fromUtc: string;
  toUtc: string;
  stepMs: number;
}): string[] {
  const from = canonicalUtcInstantValue(input.fromUtc);
  const to = canonicalUtcInstantValue(input.toUtc);
  const first = Math.ceil(from / input.stepMs) * input.stepMs;
  const values: string[] = [];
  for (let cursor = first; cursor <= to; cursor += input.stepMs) {
    values.push(new Date(cursor).toISOString());
  }
  return values.length > 0 ? values : [input.toUtc];
}

export function createHistoricalFixtureAdapters(): HistoricalPriceProviderAdapters {
  return {
    coingecko: {
      fetchCryptoUsdHistory: async (request) => {
        assertFixtureAllowed();
        const rateText = CRYPTO_RATES.get(request.mapping.providerAssetKey);
        if (!rateText) {
          throw new PriceProviderError(
            "UPSTREAM_PAYLOAD_INVALID",
            "Historical fixture mapping is unsupported.",
          );
        }
        return utcObservations({
          fromUtc: request.fromUtc,
          toUtc: request.toUtc,
          stepMs: request.interval === "hourly" ? HOUR_MS : DAY_MS,
        }).map(
          (providerObservedAt) =>
            ({
              baseAssetId: request.mapping.assetId,
              quoteAssetId: request.usdAssetId,
              provider: "coingecko",
              granularity: request.interval,
              rateText,
              providerObservedAt,
              fetchedAt: request.fetchedAt,
              sourceMetadataJson: JSON.stringify({
                fixture: true,
                providerAssetKey: request.mapping.providerAssetKey,
              }),
            }) satisfies HistoricalPriceObservation,
        );
      },
    },
    ecb: {
      fetchEurReferenceHistory: async (request) => {
        assertFixtureAllowed();
        const observations: HistoricalFxObservation[] = [];
        for (
          let date = request.fromDate;
          date <= request.toDate;
          date = addLocalDateDays(date, 1)
        ) {
          const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
          if (weekday === 0 || weekday === 6) continue;
          for (const mapping of request.mappings) {
            const rateText = FX_RATES.get(mapping.providerAssetKey);
            if (!rateText) {
              throw new PriceProviderError(
                "UPSTREAM_PAYLOAD_INVALID",
                "Historical fixture currency is unsupported.",
              );
            }
            observations.push({
              baseAssetId: request.eurAssetId,
              quoteAssetId: mapping.assetId,
              provider: "ecb",
              rateText,
              providerObservationDate: date,
              fetchedAt: request.fetchedAt,
              sourceMetadataJson: JSON.stringify({
                fixture: true,
                providerAssetKey: mapping.providerAssetKey,
              }),
            });
          }
        }
        return observations;
      },
    },
  };
}
