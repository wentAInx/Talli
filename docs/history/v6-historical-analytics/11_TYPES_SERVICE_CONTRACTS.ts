// HISTORICAL DESIGN CONTRACT ONLY. NOT CURRENT SOURCE OR API.
// Current source and migrations take precedence.

export type HistoricalProviderId = "coingecko" | "ecb";
export type HistoricalCryptoGranularity = "hourly" | "daily";

export interface HistoricalPriceObservation {
  baseAssetId: string;
  quoteAssetId: string;
  provider: "coingecko";
  granularity: HistoricalCryptoGranularity;
  rateText: string;
  providerObservedAt: string;
  fetchedAt: string;
  sourceMetadataJson: string | null;
}

export interface HistoricalFxObservation {
  baseAssetId: string; // EUR
  quoteAssetId: string;
  provider: "ecb";
  rateText: string;
  providerObservationDate: string; // YYYY-MM-DD
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
        | "missing_mapping"
        | "missing_quote"
        | "provider_error"
        | "unsupported";
      message: string;
    };

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

export interface CoinGeckoHistoricalProvider {
  fetchCryptoUsdHistory(input: {
    mapping: {
      assetId: string;
      providerAssetKey: string;
    };
    usdAssetId: string;
    fromUtc: string;
    toUtc: string;
    interval: HistoricalCryptoGranularity;
    fetchedAt: string;
  }): Promise<HistoricalPriceObservation[]>;
}

export interface EcbHistoricalProvider {
  fetchEurReferenceHistory(input: {
    mappings: Array<{
      assetId: string;
      providerAssetKey: string;
    }>;
    eurAssetId: string;
    fromDate: string;
    toDate: string;
    fetchedAt: string;
  }): Promise<HistoricalFxObservation[]>;
}

export interface HistoricalRefreshService {
  start(input: {
    fromDate: string;
    toDate: string;
  }): HistoricalRefreshProgress;

  step(input: {
    runId: string;
    maxUnits?: number;
  }): Promise<HistoricalRefreshProgress>;

  cancel(input: { runId: string }): HistoricalRefreshProgress;
}

export interface HistoricalAnalyticsService {
  netWorthSeries(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
  }): HistoricalNetWorthSeriesResult;

  allocation(input: {
    bookId: string;
    localDate: string;
  }): HistoricalAllocationResult;

  cashFlowTrend(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
    bucket: "month";
  }): { buckets: HistoricalFlowBucket[] };

  decomposition(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
  }): { points: NetWorthBridgePoint[] };
}
