import type {
  HistoricalCryptoGranularity,
  HistoricalFxObservation,
  HistoricalPriceObservation,
} from "../domain/historical-quote-types";
import type {
  PriceProviderId,
  ProviderMapping,
  ProviderQuote,
} from "../domain/quote-types";

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

export interface PriceProviderAdapters {
  coingecko: CoinGeckoPriceProvider;
  ecb: EcbPriceProvider;
}

export interface CoinGeckoHistoricalProvider {
  fetchCryptoUsdHistory(input: {
    mapping: { assetId: string; providerAssetKey: string };
    usdAssetId: string;
    fromUtc: string;
    toUtc: string;
    interval: HistoricalCryptoGranularity;
    fetchedAt: string;
  }): Promise<HistoricalPriceObservation[]>;
}

export interface EcbHistoricalProvider {
  fetchEurReferenceHistory(input: {
    mappings: Array<{ assetId: string; providerAssetKey: string }>;
    eurAssetId: string;
    fromDate: string;
    toDate: string;
    fetchedAt: string;
  }): Promise<HistoricalFxObservation[]>;
}

export interface HistoricalPriceProviderAdapters {
  coingecko: CoinGeckoHistoricalProvider;
  ecb: EcbHistoricalProvider;
}

export interface CoinGeckoRuntimeConfiguration {
  mode: "demo" | "keyless" | "pro" | "invalid";
  configured: boolean;
  apiKey: string | null;
}

export interface SafeProviderConfigurationView {
  provider: PriceProviderId;
  configured: boolean;
  mode: string;
}
