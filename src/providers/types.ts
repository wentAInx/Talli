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

export interface CoinGeckoRuntimeConfiguration {
  mode: "demo" | "keyless" | "invalid";
  configured: boolean;
  apiKey: string | null;
}

export interface SafeProviderConfigurationView {
  provider: PriceProviderId;
  configured: boolean;
  mode: string;
}
