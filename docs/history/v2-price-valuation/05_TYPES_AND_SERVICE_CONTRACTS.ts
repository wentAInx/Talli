// Historical design contract for Talli V2.0; file layout may differ while preserving semantics.

export type PriceProviderId = "coingecko" | "ecb";
export type ExternalQuoteKind = "spot" | "reference";
export type QuoteStatus =
  | "identity"
  | "manual"
  | "fresh"
  | "stale"
  | "missing_mapping"
  | "missing_quote"
  | "provider_error"
  | "unsupported";

// Runtime implementation should validate this as positive plain decimal text.
export type DecimalText = string;

export interface ProviderMapping {
  assetId: string;
  provider: PriceProviderId;
  providerAssetKey: string;
  isEnabled: boolean;
  priority: number;
}

export interface ProviderQuote {
  baseAssetId: string;
  quoteAssetId: string;
  provider: PriceProviderId;
  kind: ExternalQuoteKind;
  rateText: DecimalText;
  providerObservedAt: string | null;
  providerObservationDate: string | null;
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface ManualQuote {
  id: string;
  baseAssetId: string;
  quoteAssetId: string;
  rateText: DecimalText;
  observedAt: string;
  note: string | null;
  isActive: boolean;
}

export interface QuoteLeg {
  baseAssetId: string;
  quoteAssetId: string;
  rateText: DecimalText;
  source: "identity" | "manual" | PriceProviderId;
  status: "identity" | "manual" | "fresh" | "stale";
  label: string;
  providerObservedAt?: string | null;
  providerObservationDate?: string | null;
  fetchedAt?: string | null;
}

export type QuoteResolution =
  | {
      ok: true;
      status: "identity" | "manual" | "fresh" | "stale";
      baseAssetId: string;
      quoteAssetId: string;
      rateText: DecimalText;
      legs: QuoteLeg[];
    }
  | {
      ok: false;
      status:
        | "missing_mapping"
        | "missing_quote"
        | "provider_error"
        | "unsupported";
      baseAssetId: string;
      quoteAssetId: string;
      message: string;
      staleLegs?: QuoteLeg[];
    };

export interface ProviderRefreshState {
  provider: PriceProviderId;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  cooldownUntil: string | null;
}

export interface AssetValuationLine {
  assetId: string;
  quantityAtomic: string;
  quantityDisplay: string;
  resolution: QuoteResolution;
  // Exact Decimal text; null when quote unavailable.
  valueText: DecimalText | null;
  valueDisplay: string | null;
}

export interface PortfolioValuationView {
  queryTime: string;
  homeAssetId: string;
  homeAssetCode: string;
  totalValueText: DecimalText;
  totalValueDisplay: string;
  isComplete: boolean;
  valuedNonZeroAssetCount: number;
  missingNonZeroAssetCount: number;
  lines: AssetValuationLine[];
}

export interface PriceHttpTransport {
  get(input: {
    url: URL;
    headers?: Record<string, string>;
    timeoutMs: number;
  }): Promise<{
    status: number;
    headers: Headers;
    text: string;
  }>;
}

// Provider adapter contracts: no Ledger/Account/Dashboard dependencies.
export interface CoinGeckoPriceProvider {
  fetchCryptoUsdQuotes(input: {
    mappings: ProviderMapping[];
    usdAssetId: string;
    fetchedAt: string;
  }): Promise<ProviderQuote[]>;
}

export interface EcbPriceProvider {
  fetchEurReferenceQuotes(input: {
    mappings: ProviderMapping[];
    eurAssetId: string;
    fetchedAt: string;
  }): Promise<ProviderQuote[]>;
}

export interface PriceRefreshService {
  refreshCurrent(input?: {
    force?: boolean;
    providers?: PriceProviderId[];
  }): Promise<{
    refreshed: PriceProviderId[];
    skipped: PriceProviderId[];
    failed: Array<{ provider: PriceProviderId; code: string; message: string }>;
  }>;
}

// Pure/cache-only: MUST NOT perform HTTP.
export interface QuoteResolver {
  resolve(input: {
    baseAssetId: string;
    homeAssetId: string;
    queryTime: string;
  }): QuoteResolution;
}

// Pure/cache-only with respect to market data: MUST NOT perform HTTP.
export interface PortfolioValuationService {
  current(input: {
    bookId: string;
    queryTime: string;
  }): PortfolioValuationView | null;
}
