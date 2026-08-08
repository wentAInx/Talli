import type { AssetType } from "./types";

export type PriceProviderId = "coingecko" | "ecb";
export type ExternalQuoteKind = "spot" | "reference";
export type DecimalText = string;

export type QuoteStatus =
  | "identity"
  | "manual"
  | "fresh"
  | "stale"
  | "missing_mapping"
  | "missing_quote"
  | "provider_error"
  | "unsupported";

export interface ValuationAsset {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  assetType: AssetType;
  scale: number;
  isArchived: boolean;
  sortOrder: number;
}

export interface ProviderMapping {
  assetId: string;
  provider: PriceProviderId;
  providerAssetKey: string;
  isEnabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderRefreshState {
  provider: PriceProviderId;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  cooldownUntil: string | null;
  updatedAt?: string;
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
        "missing_mapping" | "missing_quote" | "provider_error" | "unsupported";
      baseAssetId: string;
      quoteAssetId: string;
      message: string;
      staleLegs?: QuoteLeg[];
    };

export interface QuoteResolverSnapshot {
  assets: readonly ValuationAsset[];
  mappings: readonly ProviderMapping[];
  manualQuotes: readonly ManualQuote[];
  providerQuotes: readonly ProviderQuote[];
  providerStates: readonly ProviderRefreshState[];
}
