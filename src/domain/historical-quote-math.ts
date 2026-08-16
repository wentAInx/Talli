import {
  divideDecimalTexts,
  invertDecimalText,
  multiplyDecimalTexts,
  normalizePositiveDecimalText,
} from "./price-decimal";
import type {
  HistoricalFxObservation,
  HistoricalManualQuote,
  HistoricalQuoteLeg,
  HistoricalQuoteResolution,
  HistoricalQuoteResolverSnapshot,
  HistoricalProviderId,
  HistoricalPriceObservation,
} from "./historical-quote-types";
import type {
  PriceProviderId,
  ProviderMapping,
  ValuationAsset,
} from "./quote-types";
import {
  canonicalLocalDate,
  canonicalUtcInstantValue,
  localDateDistance,
} from "./time";

const HOUR_MS = 60 * 60 * 1_000;
const INDEX_KEY_SEPARATOR = "\u0000";

type BridgeAssetKey = "EUR" | "USD";

interface IndexedPriceObservation {
  observedAt: number;
  observation: HistoricalPriceObservation;
}

interface IndexedFxObservation {
  observationDate: string;
  observation: HistoricalFxObservation;
}

interface HistoricalResolverIndex {
  assets: ReadonlyMap<string, ValuationAsset>;
  enabledMappings: ReadonlyMap<string, ProviderMapping>;
  bridgeAssets: ReadonlyMap<BridgeAssetKey, ValuationAsset>;
  manualQuotes: ReadonlyMap<string, HistoricalManualQuote>;
  priceSeries: ReadonlyMap<string, readonly IndexedPriceObservation[]>;
  fxSeries: ReadonlyMap<string, readonly IndexedFxObservation[]>;
  providerErrors: ReadonlySet<HistoricalProviderId>;
}

interface ResolverContext {
  queryInstant: number;
  localDate: string;
  index: HistoricalResolverIndex;
}

export interface HistoricalQuoteResolverInput {
  baseAssetId: string;
  homeAssetId: string;
  queryTime: string;
  localDate: string;
}

export interface HistoricalQuoteResolver {
  resolve(input: HistoricalQuoteResolverInput): HistoricalQuoteResolution;
}

function joinedKey(...parts: readonly string[]): string {
  return parts.join(INDEX_KEY_SEPARATOR);
}

function mappingKey(assetId: string, provider: PriceProviderId): string {
  return joinedKey(provider, assetId);
}

function manualQuoteKey(
  baseAssetId: string,
  quoteAssetId: string,
  localDate: string,
): string {
  return joinedKey(baseAssetId, quoteAssetId, localDate);
}

function priceSeriesKey(
  baseAssetId: string,
  quoteAssetId: string,
  granularity: HistoricalPriceObservation["granularity"],
): string {
  return joinedKey(baseAssetId, quoteAssetId, granularity);
}

function fxSeriesKey(baseAssetId: string, quoteAssetId: string): string {
  return joinedKey(baseAssetId, quoteAssetId);
}

function appendIndexed<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function latestPrior<T>(
  values: readonly T[],
  compareToQuery: (value: T) => number,
): T | null {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (compareToQuery(values[middle]!) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low === 0 ? null : values[low - 1]!;
}

function bridgeAssetFromSnapshot(
  snapshot: HistoricalQuoteResolverSnapshot,
  assets: ReadonlyMap<string, ValuationAsset>,
  providerAssetKey: BridgeAssetKey,
): ValuationAsset | undefined {
  const mapped = [...snapshot.mappings]
    .filter(
      (mapping) =>
        mapping.provider === "ecb" &&
        mapping.providerAssetKey.trim().toUpperCase() === providerAssetKey,
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.assetId.localeCompare(right.assetId),
    )
    .map((mapping) => assets.get(mapping.assetId))
    .find((asset) => asset?.assetType === "fiat");
  return (
    mapped ??
    [...assets.values()].find(
      (asset) =>
        asset.assetType === "fiat" &&
        asset.code.toUpperCase() === providerAssetKey,
    )
  );
}

function createResolverIndex(
  snapshot: HistoricalQuoteResolverSnapshot,
): HistoricalResolverIndex {
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const enabledMappings = new Map<string, ProviderMapping>();
  for (const mapping of snapshot.mappings) {
    const key = mappingKey(mapping.assetId, mapping.provider);
    if (mapping.isEnabled && !enabledMappings.has(key)) {
      enabledMappings.set(key, mapping);
    }
  }

  const bridgeAssets = new Map<BridgeAssetKey, ValuationAsset>();
  for (const key of ["EUR", "USD"] as const) {
    const asset = bridgeAssetFromSnapshot(snapshot, assets, key);
    if (asset) bridgeAssets.set(key, asset);
  }

  const manualQuotes = new Map<string, HistoricalManualQuote>();
  for (const quote of snapshot.manualQuotes) {
    const key = manualQuoteKey(
      quote.baseAssetId,
      quote.quoteAssetId,
      canonicalLocalDate(quote.valuationDate),
    );
    if (!manualQuotes.has(key)) manualQuotes.set(key, quote);
  }

  const priceSeries = new Map<string, IndexedPriceObservation[]>();
  for (const observation of snapshot.priceObservations) {
    appendIndexed(
      priceSeries,
      priceSeriesKey(
        observation.baseAssetId,
        observation.quoteAssetId,
        observation.granularity,
      ),
      {
        observedAt: canonicalUtcInstantValue(observation.providerObservedAt),
        observation,
      },
    );
  }
  for (const values of priceSeries.values()) {
    values.sort(
      (left, right) =>
        left.observedAt - right.observedAt ||
        left.observation.fetchedAt.localeCompare(right.observation.fetchedAt) ||
        (left.observation.id ?? "").localeCompare(right.observation.id ?? ""),
    );
  }

  const fxSeries = new Map<string, IndexedFxObservation[]>();
  for (const observation of snapshot.fxObservations) {
    appendIndexed(
      fxSeries,
      fxSeriesKey(observation.baseAssetId, observation.quoteAssetId),
      {
        observationDate: canonicalLocalDate(
          observation.providerObservationDate,
        ),
        observation,
      },
    );
  }
  for (const values of fxSeries.values()) {
    values.sort(
      (left, right) =>
        left.observationDate.localeCompare(right.observationDate) ||
        left.observation.fetchedAt.localeCompare(right.observation.fetchedAt) ||
        (left.observation.id ?? "").localeCompare(right.observation.id ?? ""),
    );
  }

  return {
    assets,
    enabledMappings,
    bridgeAssets,
    manualQuotes,
    priceSeries,
    fxSeries,
    providerErrors: new Set(snapshot.providerErrors ?? []),
  };
}

function failure(
  baseAssetId: string,
  quoteAssetId: string,
  status: Extract<HistoricalQuoteResolution, { ok: false }>["status"],
  message: string,
): HistoricalQuoteResolution {
  return { ok: false, baseAssetId, quoteAssetId, status, message };
}

function isFailure(
  value: HistoricalQuoteLeg | HistoricalQuoteResolution,
): value is HistoricalQuoteResolution {
  return "ok" in value;
}

function mappingFor(
  context: ResolverContext,
  assetId: string,
  provider: PriceProviderId,
): ProviderMapping | null {
  return (
    context.index.enabledMappings.get(mappingKey(assetId, provider)) ?? null
  );
}

function bridgeAsset(
  context: ResolverContext,
  providerAssetKey: BridgeAssetKey,
): ValuationAsset | undefined {
  return context.index.bridgeAssets.get(providerAssetKey);
}

function providerFailureStatus(
  context: ResolverContext,
  provider: HistoricalProviderId,
): "provider_error" | "missing_quote" {
  return context.index.providerErrors.has(provider)
    ? "provider_error"
    : "missing_quote";
}

function cryptoLeg(
  context: ResolverContext,
  base: ValuationAsset,
  usd: ValuationAsset,
): HistoricalQuoteLeg | HistoricalQuoteResolution {
  const hourly = latestPrior(
    context.index.priceSeries.get(priceSeriesKey(base.id, usd.id, "hourly")) ??
      [],
    (candidate) => candidate.observedAt - context.queryInstant,
  );
  const daily = latestPrior(
    context.index.priceSeries.get(priceSeriesKey(base.id, usd.id, "daily")) ??
      [],
    (candidate) => candidate.observedAt - context.queryInstant,
  );
  const usableHourly =
    hourly && context.queryInstant - hourly.observedAt <= 2 * HOUR_MS
      ? hourly
      : null;
  const usableDaily =
    daily && context.queryInstant - daily.observedAt <= 26 * HOUR_MS
      ? daily
      : null;
  const selected = usableHourly ?? usableDaily;
  if (selected === null) {
    return failure(
      base.id,
      usd.id,
      providerFailureStatus(context, "coingecko"),
      `No usable historical CoinGecko quote is available for ${base.code}.`,
    );
  }
  const observation = selected.observation;
  return {
    baseAssetId: observation.baseAssetId,
    quoteAssetId: observation.quoteAssetId,
    rateText: normalizePositiveDecimalText(observation.rateText),
    source: "coingecko",
    kind:
      observation.granularity === "hourly" ? "hourly_prior" : "daily_fallback",
    providerObservedAt: observation.providerObservedAt,
    fetchedAt: observation.fetchedAt,
    granularity: observation.granularity,
  };
}

function fxLeg(
  context: ResolverContext,
  eur: ValuationAsset,
  target: ValuationAsset,
): HistoricalQuoteLeg | HistoricalQuoteResolution {
  if (target.id === eur.id) {
    return {
      baseAssetId: eur.id,
      quoteAssetId: eur.id,
      rateText: "1",
      source: "identity",
      kind: "identity",
    };
  }
  if (!mappingFor(context, target.id, "ecb")) {
    return failure(
      target.id,
      eur.id,
      "missing_mapping",
      `${target.code} has no enabled ECB mapping.`,
    );
  }
  const selected = latestPrior(
    context.index.fxSeries.get(fxSeriesKey(eur.id, target.id)) ?? [],
    (candidate) => candidate.observationDate.localeCompare(context.localDate),
  );
  if (selected === null) {
    return failure(
      eur.id,
      target.id,
      providerFailureStatus(context, "ecb"),
      `No historical ECB reference quote is available for ${target.code}.`,
    );
  }
  const ageDays = localDateDistance(
    selected.observationDate,
    context.localDate,
  );
  if (ageDays < 0 || ageDays > 7) {
    return failure(
      eur.id,
      target.id,
      providerFailureStatus(context, "ecb"),
      `The historical ECB reference quote for ${target.code} is too old.`,
    );
  }
  const observation = selected.observation;
  return {
    baseAssetId: observation.baseAssetId,
    quoteAssetId: observation.quoteAssetId,
    rateText: normalizePositiveDecimalText(observation.rateText),
    source: "ecb",
    kind: ageDays === 0 ? "fx_reference_same_day" : "fx_carry_forward",
    providerObservationDate: observation.providerObservationDate,
    fetchedAt: observation.fetchedAt,
  };
}

function fiatResolution(
  context: ResolverContext,
  base: ValuationAsset,
  home: ValuationAsset,
): HistoricalQuoteResolution {
  const eur = bridgeAsset(context, "EUR");
  if (!eur) {
    return failure(
      base.id,
      home.id,
      "missing_mapping",
      "The EUR bridge asset is unavailable.",
    );
  }
  if (base.id === eur.id) {
    const homeLeg = fxLeg(context, eur, home);
    if (isFailure(homeLeg)) return homeLeg;
    return {
      ok: true,
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: homeLeg.rateText,
      legs: homeLeg.source === "identity" ? [] : [homeLeg],
      degraded: homeLeg.kind === "fx_carry_forward",
    };
  }
  const baseLeg = fxLeg(context, eur, base);
  if (isFailure(baseLeg)) return baseLeg;
  if (home.id === eur.id) {
    return {
      ok: true,
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: invertDecimalText(baseLeg.rateText),
      legs: [baseLeg],
      degraded: baseLeg.kind === "fx_carry_forward",
    };
  }
  const homeLeg = fxLeg(context, eur, home);
  if (isFailure(homeLeg)) return homeLeg;
  const legs = [baseLeg, homeLeg].filter((leg) => leg.source !== "identity");
  return {
    ok: true,
    baseAssetId: base.id,
    quoteAssetId: home.id,
    rateText: divideDecimalTexts(homeLeg.rateText, baseLeg.rateText),
    legs,
    degraded: legs.some((leg) => leg.kind === "fx_carry_forward"),
  };
}

function resolveWithIndex(
  index: HistoricalResolverIndex,
  input: HistoricalQuoteResolverInput,
): HistoricalQuoteResolution {
  const queryInstant = canonicalUtcInstantValue(input.queryTime);
  const localDate = canonicalLocalDate(input.localDate);
  const base = index.assets.get(input.baseAssetId);
  const home = index.assets.get(input.homeAssetId);
  if (!base || !home) {
    return failure(
      input.baseAssetId,
      input.homeAssetId,
      "unsupported",
      "The requested valuation asset does not exist.",
    );
  }
  if (home.assetType !== "fiat" || home.isArchived) {
    return failure(
      base.id,
      home.id,
      "unsupported",
      "Home Asset must be an active fiat asset.",
    );
  }
  if (base.id === home.id) {
    return {
      ok: true,
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: "1",
      legs: [
        {
          baseAssetId: base.id,
          quoteAssetId: home.id,
          rateText: "1",
          source: "identity",
          kind: "identity",
        },
      ],
      degraded: false,
    };
  }
  const manual = index.manualQuotes.get(
    manualQuoteKey(base.id, home.id, localDate),
  );
  if (manual) {
    const rateText = normalizePositiveDecimalText(manual.rateText);
    return {
      ok: true,
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText,
      legs: [
        {
          baseAssetId: base.id,
          quoteAssetId: home.id,
          rateText,
          source: "manual",
          kind: "manual",
        },
      ],
      degraded: false,
    };
  }
  const context: ResolverContext = {
    queryInstant,
    localDate,
    index,
  };
  if (base.assetType === "fiat") {
    return fiatResolution(context, base, home);
  }
  if (base.assetType === "crypto") {
    if (!mappingFor(context, base.id, "coingecko")) {
      return failure(
        base.id,
        home.id,
        "missing_mapping",
        `${base.code} has no enabled CoinGecko mapping.`,
      );
    }
    const usd = bridgeAsset(context, "USD");
    if (!usd) {
      return failure(
        base.id,
        home.id,
        "missing_mapping",
        "The USD bridge asset is unavailable.",
      );
    }
    const marketLeg = cryptoLeg(context, base, usd);
    if (isFailure(marketLeg)) return marketLeg;
    if (home.id === usd.id) {
      return {
        ok: true,
        baseAssetId: base.id,
        quoteAssetId: home.id,
        rateText: marketLeg.rateText,
        legs: [marketLeg],
        degraded: marketLeg.kind === "daily_fallback",
      };
    }
    const usdToHome = fiatResolution(context, usd, home);
    if (!usdToHome.ok) return usdToHome;
    return {
      ok: true,
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: multiplyDecimalTexts(marketLeg.rateText, usdToHome.rateText),
      legs: [marketLeg, ...usdToHome.legs],
      degraded: marketLeg.kind === "daily_fallback" || usdToHome.degraded,
    };
  }
  return failure(
    base.id,
    home.id,
    "unsupported",
    `${base.code} requires a manual historical exact-pair quote.`,
  );
}

export function createHistoricalQuoteResolver(
  snapshot: HistoricalQuoteResolverSnapshot,
): HistoricalQuoteResolver {
  const index = createResolverIndex(snapshot);
  return {
    resolve: (input) => resolveWithIndex(index, input),
  };
}

export function resolveHistoricalQuote(
  snapshot: HistoricalQuoteResolverSnapshot,
  input: HistoricalQuoteResolverInput,
): HistoricalQuoteResolution {
  return createHistoricalQuoteResolver(snapshot).resolve(input);
}
