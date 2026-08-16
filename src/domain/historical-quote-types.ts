import type { ProviderMapping, ValuationAsset } from "./quote-types";

export type HistoricalProviderId = "coingecko" | "ecb";
export type HistoricalCryptoGranularity = "hourly" | "daily";

export interface HistoricalPriceObservation {
  id?: string;
  baseAssetId: string;
  quoteAssetId: string;
  provider: "coingecko";
  granularity: HistoricalCryptoGranularity;
  rateText: string;
  providerObservedAt: string;
  firstFetchedAt?: string;
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface HistoricalFxObservation {
  id?: string;
  baseAssetId: string;
  quoteAssetId: string;
  provider: "ecb";
  rateText: string;
  providerObservationDate: string;
  firstFetchedAt?: string;
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface HistoricalManualQuote {
  id: string;
  baseAssetId: string;
  quoteAssetId: string;
  valuationDate: string;
  rateText: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HistoricalResolutionKind =
  | "identity"
  | "manual"
  | "hourly_prior"
  | "daily_fallback"
  | "fx_reference_same_day"
  | "fx_carry_forward";

export interface HistoricalQuoteLeg {
  baseAssetId: string;
  quoteAssetId: string;
  rateText: string;
  source: "identity" | "manual" | HistoricalProviderId;
  kind: HistoricalResolutionKind;
  providerObservedAt?: string | null;
  providerObservationDate?: string | null;
  fetchedAt?: string | null;
  granularity?: HistoricalCryptoGranularity | null;
}

export type HistoricalQuoteResolution =
  | {
      ok: true;
      baseAssetId: string;
      quoteAssetId: string;
      rateText: string;
      legs: HistoricalQuoteLeg[];
      degraded: boolean;
    }
  | {
      ok: false;
      baseAssetId: string;
      quoteAssetId: string;
      status:
        "missing_mapping" | "missing_quote" | "provider_error" | "unsupported";
      message: string;
    };

export interface HistoricalQuoteResolverSnapshot {
  assets: readonly ValuationAsset[];
  mappings: readonly ProviderMapping[];
  manualQuotes: readonly HistoricalManualQuote[];
  priceObservations: readonly HistoricalPriceObservation[];
  fxObservations: readonly HistoricalFxObservation[];
  providerErrors?: readonly HistoricalProviderId[];
}

export interface HistoricalNetWorthPoint {
  localDate: string;
  cutoffUtc: string;
  knownValueText: string;
  completeValueText: string | null;
  grossAssetsKnownText: string;
  grossLiabilitiesKnownText: string;
  isComplete: boolean;
  isDegraded: boolean;
  missingAssetIds: string[];
}

export interface HistoricalNetWorthSeriesResult {
  homeAssetId: string;
  timeZone: string;
  fromDate: string;
  toDate: string;
  points: HistoricalNetWorthPoint[];
}

export interface AllocationSlice {
  key: string;
  label: string;
  valueText: string;
  shareText: string | null;
}

export interface HistoricalAllocationResult {
  localDate: string;
  isComplete: boolean;
  grossAssetsText: string | null;
  grossLiabilitiesText: string | null;
  netWorthText: string | null;
  byAsset: AllocationSlice[];
  byAssetClass: AllocationSlice[];
  byFiatCurrency: AllocationSlice[];
  liabilitiesByAsset: AllocationSlice[];
  missingAssetIds: string[];
}

export interface HistoricalFlowBucket {
  period: string;
  incomeText: string | null;
  expenseText: string | null;
  feesText: string | null;
  netFlowText: string | null;
  isComplete: boolean;
  missingCount: number;
}

export interface NetWorthBridgePoint {
  localDate: string;
  startValueText: string | null;
  endValueText: string | null;
  deltaText: string | null;
  marketAndFxText: string | null;
  incomeText: string | null;
  expenseText: string | null;
  feesText: string | null;
  internalTransferText: string | null;
  tradeRebalanceText: string | null;
  reconciliationText: string | null;
  isComplete: boolean;
  missingAssetIds: string[];
}

export type HistoricalRefreshRunStatus =
  | "pending"
  | "running"
  | "partial"
  | "success"
  | "failed"
  | "invalidated"
  | "cancelled";

export interface HistoricalRefreshProgress {
  runId: string;
  status: HistoricalRefreshRunStatus;
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  nextAction: "step" | "retry" | "done" | "restart";
}
