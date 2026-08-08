import { canonicalUtcInstantValue } from "./time";
import {
  divideDecimalTexts,
  invertDecimalText,
  multiplyDecimalTexts,
  normalizePositiveDecimalText,
} from "./price-decimal";
import type {
  PriceProviderId,
  ProviderMapping,
  ProviderQuote,
  QuoteLeg,
  QuoteResolution,
  QuoteResolverSnapshot,
  ValuationAsset,
} from "./quote-types";

export const PRICE_POLICY = {
  coingecko: {
    freshMs: 10 * 60 * 1000,
    staleUsableMs: 24 * 60 * 60 * 1000,
  },
  ecb: {
    freshMs: 6 * 60 * 60 * 1000,
    staleUsableMs: 7 * 24 * 60 * 60 * 1000,
  },
  manualRefreshCooldownMs: 60 * 1000,
  coingeckoTimeoutMs: 8 * 1000,
  ecbTimeoutMs: 10 * 1000,
} as const;

interface ResolverContext {
  queryInstant: number;
  assets: Map<string, ValuationAsset>;
  mappings: readonly ProviderMapping[];
  providerQuotes: readonly ProviderQuote[];
  providerStates: QuoteResolverSnapshot["providerStates"];
}

function failure(
  baseAssetId: string,
  quoteAssetId: string,
  status: Extract<QuoteResolution, { ok: false }>["status"],
  message: string,
  staleLegs?: QuoteLeg[],
): QuoteResolution {
  return {
    ok: false,
    status,
    baseAssetId,
    quoteAssetId,
    message,
    ...(staleLegs && staleLegs.length > 0 ? { staleLegs } : {}),
  };
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

function providerStateHasError(
  context: ResolverContext,
  provider: PriceProviderId,
): boolean {
  return Boolean(
    context.providerStates.find((state) => state.provider === provider)
      ?.lastErrorCode,
  );
}

function fiatBridgeAsset(
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
    .find((asset) => asset?.assetType === "fiat" && !asset.isArchived);
  return (
    mapped ??
    [...context.assets.values()].find(
      (asset) =>
        asset.assetType === "fiat" &&
        !asset.isArchived &&
        asset.code.toUpperCase() === providerAssetKey,
    )
  );
}

function externalLeg(input: {
  context: ResolverContext;
  baseAssetId: string;
  quoteAssetId: string;
  provider: PriceProviderId;
  label: string;
}): QuoteLeg | QuoteResolution {
  const quote = input.context.providerQuotes.find(
    (candidate) =>
      candidate.baseAssetId === input.baseAssetId &&
      candidate.quoteAssetId === input.quoteAssetId &&
      candidate.provider === input.provider,
  );
  if (!quote) {
    return failure(
      input.baseAssetId,
      input.quoteAssetId,
      providerStateHasError(input.context, input.provider)
        ? "provider_error"
        : "missing_quote",
      providerStateHasError(input.context, input.provider)
        ? `${input.provider} could not refresh the required quote.`
        : `No cached ${input.provider} quote is available.`,
    );
  }

  const age =
    input.context.queryInstant - canonicalUtcInstantValue(quote.fetchedAt);
  const policy = PRICE_POLICY[input.provider];
  const status = age <= policy.freshMs ? "fresh" : "stale";
  const leg: QuoteLeg = {
    baseAssetId: quote.baseAssetId,
    quoteAssetId: quote.quoteAssetId,
    rateText: normalizePositiveDecimalText(quote.rateText),
    source: quote.provider,
    status,
    label: input.label,
    providerObservedAt: quote.providerObservedAt,
    providerObservationDate: quote.providerObservationDate,
    fetchedAt: quote.fetchedAt,
  };
  if (age <= policy.staleUsableMs) {
    return leg;
  }
  return failure(
    input.baseAssetId,
    input.quoteAssetId,
    providerStateHasError(input.context, input.provider)
      ? "provider_error"
      : "missing_quote",
    `The cached ${input.provider} quote is too old to use.`,
    [leg],
  );
}

function isFailure(
  value: QuoteLeg | QuoteResolution,
): value is QuoteResolution {
  return "ok" in value;
}

function weakestStatus(legs: readonly QuoteLeg[]): "fresh" | "stale" {
  return legs.some((leg) => leg.status === "stale") ? "stale" : "fresh";
}

function fiatResolution(
  context: ResolverContext,
  base: ValuationAsset,
  home: ValuationAsset,
): QuoteResolution {
  const eur = fiatBridgeAsset(context, "EUR");
  if (!eur) {
    return failure(
      base.id,
      home.id,
      "missing_mapping",
      "The EUR bridge asset is unavailable.",
    );
  }

  const sourceLeg = (target: ValuationAsset): QuoteLeg | QuoteResolution => {
    if (target.id === eur.id) {
      return {
        baseAssetId: eur.id,
        quoteAssetId: eur.id,
        rateText: "1",
        source: "identity",
        status: "identity",
        label: "EUR identity",
      };
    }
    if (!mappingFor(context, target.id, "ecb")) {
      return failure(
        base.id,
        home.id,
        "missing_mapping",
        `${target.code} has no enabled ECB mapping.`,
      );
    }
    return externalLeg({
      context,
      baseAssetId: eur.id,
      quoteAssetId: target.id,
      provider: "ecb",
      label: `ECB EUR/${target.code} reference`,
    });
  };

  if (base.id === eur.id) {
    const homeLeg = sourceLeg(home);
    if (isFailure(homeLeg)) return homeLeg;
    const legs = homeLeg.source === "identity" ? [] : [homeLeg];
    return {
      ok: true,
      status: legs.length === 0 ? "identity" : weakestStatus(legs),
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: homeLeg.rateText,
      legs,
    };
  }

  const baseLeg = sourceLeg(base);
  if (isFailure(baseLeg)) return baseLeg;
  if (home.id === eur.id) {
    const legs = baseLeg.source === "identity" ? [] : [baseLeg];
    return {
      ok: true,
      status: weakestStatus(legs),
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: invertDecimalText(baseLeg.rateText),
      legs,
    };
  }

  const homeLeg = sourceLeg(home);
  if (isFailure(homeLeg)) return homeLeg;
  const legs = [baseLeg, homeLeg].filter((leg) => leg.source !== "identity");
  return {
    ok: true,
    status: weakestStatus(legs),
    baseAssetId: base.id,
    quoteAssetId: home.id,
    rateText: divideDecimalTexts(homeLeg.rateText, baseLeg.rateText),
    legs,
  };
}

export function resolveCurrentQuote(
  snapshot: QuoteResolverSnapshot,
  input: { baseAssetId: string; homeAssetId: string; queryTime: string },
): QuoteResolution {
  const queryInstant = canonicalUtcInstantValue(input.queryTime);
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
      status: "identity",
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: "1",
      legs: [
        {
          baseAssetId: base.id,
          quoteAssetId: home.id,
          rateText: "1",
          source: "identity",
          status: "identity",
          label: `${base.code} identity`,
        },
      ],
    };
  }

  const manual = snapshot.manualQuotes
    .filter(
      (quote) =>
        quote.isActive &&
        quote.baseAssetId === base.id &&
        quote.quoteAssetId === home.id,
    )
    .sort(
      (left, right) =>
        right.observedAt.localeCompare(left.observedAt) ||
        right.id.localeCompare(left.id),
    )[0];
  if (manual) {
    return {
      ok: true,
      status: "manual",
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: normalizePositiveDecimalText(manual.rateText),
      legs: [
        {
          baseAssetId: base.id,
          quoteAssetId: home.id,
          rateText: normalizePositiveDecimalText(manual.rateText),
          source: "manual",
          status: "manual",
          label: `Manual ${base.code}/${home.code}`,
          providerObservedAt: manual.observedAt,
        },
      ],
    };
  }

  const context: ResolverContext = {
    queryInstant,
    assets,
    mappings: snapshot.mappings,
    providerQuotes: snapshot.providerQuotes,
    providerStates: snapshot.providerStates,
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
    const usd = fiatBridgeAsset(context, "USD");
    if (!usd) {
      return failure(
        base.id,
        home.id,
        "missing_mapping",
        "The USD bridge asset is unavailable.",
      );
    }
    const cryptoLeg = externalLeg({
      context,
      baseAssetId: base.id,
      quoteAssetId: usd.id,
      provider: "coingecko",
      label: `CoinGecko ${base.code}/USD market`,
    });
    if (isFailure(cryptoLeg)) return cryptoLeg;
    if (home.id === usd.id) {
      return {
        ok: true,
        status: weakestStatus([cryptoLeg]),
        baseAssetId: base.id,
        quoteAssetId: home.id,
        rateText: cryptoLeg.rateText,
        legs: [cryptoLeg],
      };
    }
    const fiat = fiatResolution(context, usd, home);
    if (!fiat.ok) return fiat;
    const legs = [cryptoLeg, ...fiat.legs];
    return {
      ok: true,
      status: weakestStatus(legs),
      baseAssetId: base.id,
      quoteAssetId: home.id,
      rateText: multiplyDecimalTexts(cryptoLeg.rateText, fiat.rateText),
      legs,
    };
  }

  return failure(
    base.id,
    home.id,
    "unsupported",
    `${base.code} requires an active manual exact-pair quote in V2.0.`,
  );
}
