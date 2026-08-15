import { assertDomain } from "./errors";
import type { ProviderMapping, ValuationAsset } from "./quote-types";
import {
  addLocalDateDays,
  canonicalLocalDate,
  canonicalUtcInstantValue,
  localDateRangeToUtc,
} from "./time";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const COINGECKO_HOURLY_START = Date.parse("2018-01-30T00:00:00.000Z");
const MAX_HOURLY_RANGE_MS = 100 * DAY_MS;
const MAX_DAILY_RANGE_MS = 366 * DAY_MS;
const MAX_REFRESH_UNITS = 2_000;
const MAX_ECB_MAPPINGS_PER_UNIT = 50;

export interface HistoricalRefreshUnitPlan {
  provider: "coingecko" | "ecb";
  assetId: string | null;
  providerScopeJson: string;
  intervalKind: "hourly" | "daily" | "ecb_daily";
  fromBoundary: string;
  toBoundary: string;
}

export function historicalMappingFingerprint(
  mappings: readonly ProviderMapping[],
): string {
  return JSON.stringify(
    [...mappings]
      .map((mapping) => ({
        assetId: mapping.assetId,
        provider: mapping.provider,
        providerAssetKey: mapping.providerAssetKey,
        isEnabled: mapping.isEnabled,
        priority: mapping.priority,
      }))
      .sort(
        (left, right) =>
          left.assetId.localeCompare(right.assetId) ||
          left.provider.localeCompare(right.provider) ||
          left.providerAssetKey.localeCompare(right.providerAssetKey),
      ),
  );
}

function bridgeAsset(
  assets: readonly ValuationAsset[],
  mappings: readonly ProviderMapping[],
  key: "EUR" | "USD",
): ValuationAsset | null {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const mapped = mappings
    .filter(
      (mapping) =>
        mapping.provider === "ecb" &&
        mapping.providerAssetKey.trim().toUpperCase() === key,
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.assetId.localeCompare(right.assetId),
    )
    .map((mapping) => byId.get(mapping.assetId))
    .find((asset) => asset?.assetType === "fiat");
  return (
    mapped ??
    assets.find(
      (asset) => asset.assetType === "fiat" && asset.code.toUpperCase() === key,
    ) ??
    null
  );
}

function utcChunks(input: {
  fromInclusive: number;
  toInclusive: number;
  maxRangeMs: number;
  intervalKind: "hourly" | "daily";
  mapping: ProviderMapping;
  usdAssetId: string;
}): HistoricalRefreshUnitPlan[] {
  const result: HistoricalRefreshUnitPlan[] = [];
  let cursor = input.fromInclusive;
  while (cursor <= input.toInclusive) {
    const to = Math.min(input.toInclusive, cursor + input.maxRangeMs - 1);
    result.push({
      provider: "coingecko",
      assetId: input.mapping.assetId,
      providerScopeJson: JSON.stringify({
        mapping: {
          assetId: input.mapping.assetId,
          providerAssetKey: input.mapping.providerAssetKey,
        },
        usdAssetId: input.usdAssetId,
      }),
      intervalKind: input.intervalKind,
      fromBoundary: new Date(cursor).toISOString(),
      toBoundary: new Date(to).toISOString(),
    });
    cursor = to + 1;
  }
  return result;
}

function ecbChunks(input: {
  fromDate: string;
  toDate: string;
  mappings: readonly ProviderMapping[];
  eurAssetId: string;
}): HistoricalRefreshUnitPlan[] {
  const result: HistoricalRefreshUnitPlan[] = [];
  let cursor = input.fromDate;
  while (cursor <= input.toDate) {
    const candidateTo = addLocalDateDays(cursor, 365);
    const toDate = candidateTo < input.toDate ? candidateTo : input.toDate;
    result.push({
      provider: "ecb",
      assetId: null,
      providerScopeJson: JSON.stringify({
        mappings: input.mappings.map((mapping) => ({
          assetId: mapping.assetId,
          providerAssetKey: mapping.providerAssetKey,
        })),
        eurAssetId: input.eurAssetId,
      }),
      intervalKind: "ecb_daily",
      fromBoundary: cursor,
      toBoundary: toDate,
    });
    cursor = addLocalDateDays(toDate, 1);
  }
  return result;
}

export function planHistoricalRefresh(input: {
  fromDate: string;
  toDate: string;
  timeZone: string;
  assets: readonly ValuationAsset[];
  mappings: readonly ProviderMapping[];
}): HistoricalRefreshUnitPlan[] {
  const fromDate = canonicalLocalDate(input.fromDate);
  const toDate = canonicalLocalDate(input.toDate);
  const range = localDateRangeToUtc(
    { from: fromDate, to: toDate },
    input.timeZone,
  );
  assertDomain(
    range.startInclusive && range.endExclusive,
    "INVALID_DATE_RANGE",
    "Historical refresh range could not be resolved.",
  );
  const requestedStart = canonicalUtcInstantValue(range.startInclusive);
  const requestedEnd = canonicalUtcInstantValue(range.endExclusive) - 1;
  const requiredStart = requestedStart - 26 * HOUR_MS;
  const cryptoMappings = input.mappings
    .filter((mapping) => mapping.provider === "coingecko" && mapping.isEnabled)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.assetId.localeCompare(right.assetId),
    );
  const ecbMappings = input.mappings
    .filter((mapping) => mapping.provider === "ecb" && mapping.isEnabled)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.assetId.localeCompare(right.assetId),
    );
  const usd = bridgeAsset(input.assets, input.mappings, "USD");
  const eur = bridgeAsset(input.assets, input.mappings, "EUR");
  assertDomain(
    cryptoMappings.length === 0 || Boolean(usd),
    "HISTORICAL_USD_BRIDGE_MISSING",
    "USD bridge asset is required for CoinGecko history.",
  );
  assertDomain(
    ecbMappings.length === 0 || Boolean(eur),
    "HISTORICAL_EUR_BRIDGE_MISSING",
    "EUR bridge asset is required for ECB history.",
  );

  const units: HistoricalRefreshUnitPlan[] = [];
  for (const mapping of cryptoMappings) {
    if (requiredStart < COINGECKO_HOURLY_START) {
      units.push(
        ...utcChunks({
          fromInclusive: requiredStart,
          toInclusive: Math.min(requestedEnd, COINGECKO_HOURLY_START - 1),
          maxRangeMs: MAX_DAILY_RANGE_MS,
          intervalKind: "daily",
          mapping,
          usdAssetId: usd!.id,
        }),
      );
    }
    if (requestedEnd >= COINGECKO_HOURLY_START) {
      units.push(
        ...utcChunks({
          fromInclusive: Math.max(requiredStart, COINGECKO_HOURLY_START),
          toInclusive: requestedEnd,
          maxRangeMs: MAX_HOURLY_RANGE_MS,
          intervalKind: "hourly",
          mapping,
          usdAssetId: usd!.id,
        }),
      );
    }
  }
  const nonEurMappings = ecbMappings.filter(
    (mapping) => mapping.assetId !== eur?.id,
  );
  for (
    let index = 0;
    index < nonEurMappings.length;
    index += MAX_ECB_MAPPINGS_PER_UNIT
  ) {
    units.push(
      ...ecbChunks({
        fromDate: addLocalDateDays(fromDate, -7),
        toDate,
        mappings: nonEurMappings.slice(
          index,
          index + MAX_ECB_MAPPINGS_PER_UNIT,
        ),
        eurAssetId: eur!.id,
      }),
    );
  }
  assertDomain(
    units.length <= MAX_REFRESH_UNITS,
    "HISTORICAL_REFRESH_TOO_LARGE",
    `Historical refresh may contain at most ${MAX_REFRESH_UNITS} units.`,
  );
  return units;
}
