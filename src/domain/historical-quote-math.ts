import {
  divideDecimalTexts,
  invertDecimalText,
  multiplyDecimalTexts,
  normalizePositiveDecimalText,
} from "./price-decimal";
import type {
  HistoricalFxObservation,
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

interface ResolverContext {
  queryInstant: number;
  localDate: string;
  assets: Map<string, ValuationAsset>;
  mappings: readonly ProviderMapping[];
  priceObservations: readonly HistoricalPriceObservation[];
  fxObservations: readonly HistoricalFxObservation[];
  providerErrors: ReadonlySet<HistoricalProviderId>;
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
    context.mappings.find(
      (mapping) =>
        mapping.assetId === assetId &&
        mapping.provider === provider &&
        mapping.isEnabled,
    ) ?? null
  );
}

function bridgeAsset(
  context: ResolverContext,
  providerAssetKey: "EUR" | "USD",
): ValuationAsset | undefined {
  const mapped = context.mappings
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
    .map((mapping) => context.assets.get(mapping.assetId))
    .find((asset) => asset?.assetType === "fiat");
  return (
    mapped ??
    [...context.assets.values()].find(
      (asset) =>
        asset.assetType === "fiat" &&
        asset.code.toUpperCase() === providerAssetKey,
    )
  );
}

function providerFailureStatus(
  context: ResolverContext,
  provider: HistoricalProviderId,
): "provider_error" | "missing_quote" {
  return context.providerErrors.has(provider)
    ? "provider_error"
    : "missing_quote";
}

function cryptoLeg(
  context: ResolverContext,
  base: ValuationAsset,
  usd: ValuationAsset,
): HistoricalQuoteLeg | HistoricalQuoteResolution {
  const candidates = context.priceObservations
    .filter(
      (quote) =>
        quote.baseAssetId === base.id &&
        quote.quoteAssetId === usd.id &&
        quote.provider === "coingecko" &&
        canonicalUtcInstantValue(quote.providerObservedAt) <=
          context.queryInstant,
    )
    .sort(
      (left, right) =>
        right.providerObservedAt.localeCompare(left.providerObservedAt) ||
        right.fetchedAt.localeCompare(left.fetchedAt) ||
        (right.id ?? "").localeCompare(left.id ?? ""),
    );
  const hourly = candidates.find((candidate) => {
    if (candidate.granularity !== "hourly") return false;
    const age =
      context.queryInstant -
      canonicalUtcInstantValue(candidate.providerObservedAt);
    return age >= 0 && age <= 2 * HOUR_MS;
  });
  const daily = candidates.find((candidate) => {
    if (candidate.granularity !== "daily") return false;
    const age =
      context.queryInstant -
      canonicalUtcInstantValue(candidate.providerObservedAt);
    return age >= 0 && age <= 26 * HOUR_MS;
  });
  const selected = hourly ?? daily;
  if (!selected) {
    return failure(
      base.id,
      usd.id,
      providerFailureStatus(context, "coingecko"),
      `No usable historical CoinGecko quote is available for ${base.code}.`,
    );
  }
  return {
    baseAssetId: selected.baseAssetId,
    quoteAssetId: selected.quoteAssetId,
    rateText: normalizePositiveDecimalText(selected.rateText),
    source: "coingecko",
    kind: selected.granularity === "hourly" ? "hourly_prior" : "daily_fallback",
    providerObservedAt: selected.providerObservedAt,
    fetchedAt: selected.fetchedAt,
    granularity: selected.granularity,
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
  const selected = context.fxObservations
    .filter(
      (quote) =>
        quote.baseAssetId === eur.id &&
        quote.quoteAssetId === target.id &&
        quote.provider === "ecb" &&
        quote.providerObservationDate <= context.localDate,
    )
    .sort(
      (left, right) =>
        right.providerObservationDate.localeCompare(
          left.providerObservationDate,
        ) ||
        right.fetchedAt.localeCompare(left.fetchedAt) ||
        (right.id ?? "").localeCompare(left.id ?? ""),
    )[0];
  if (!selected) {
    return failure(
      eur.id,
      target.id,
      providerFailureStatus(context, "ecb"),
      `No historical ECB reference quote is available for ${target.code}.`,
    );
  }
  const ageDays = localDateDistance(
    selected.providerObservationDate,
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
  return {
    baseAssetId: selected.baseAssetId,
    quoteAssetId: selected.quoteAssetId,
    rateText: normalizePositiveDecimalText(selected.rateText),
    source: "ecb",
    kind: ageDays === 0 ? "fx_reference_same_day" : "fx_carry_forward",
    providerObservationDate: selected.providerObservationDate,
    fetchedAt: selected.fetchedAt,
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

export function resolveHistoricalQuote(
  snapshot: HistoricalQuoteResolverSnapshot,
  input: {
    baseAssetId: string;
    homeAssetId: string;
    queryTime: string;
    localDate: string;
  },
): HistoricalQuoteResolution {
  const queryInstant = canonicalUtcInstantValue(input.queryTime);
  const localDate = canonicalLocalDate(input.localDate);
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const base = assets.get(input.baseAssetId);
  const home = assets.get(input.homeAssetId);
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
  const manual = snapshot.manualQuotes.find(
    (quote) =>
      quote.baseAssetId === base.id &&
      quote.quoteAssetId === home.id &&
      quote.valuationDate === localDate,
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
    assets,
    mappings: snapshot.mappings,
    priceObservations: snapshot.priceObservations,
    fxObservations: snapshot.fxObservations,
    providerErrors: new Set(snapshot.providerErrors ?? []),
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
