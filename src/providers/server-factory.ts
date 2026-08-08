import "server-only";

import { CoinGeckoProvider } from "./coingecko";
import { EcbProvider } from "./ecb";
import { PriceProviderError } from "./errors";
import { FetchPriceHttpTransport } from "./fetch-http-transport";
import type {
  CoinGeckoRuntimeConfiguration,
  PriceProviderAdapters,
  SafeProviderConfigurationView,
} from "./types";

export function coinGeckoRuntimeConfiguration(): CoinGeckoRuntimeConfiguration {
  const rawMode = process.env.COINGECKO_MODE?.trim().toLowerCase() ?? "demo";
  const apiKey = process.env.COINGECKO_API_KEY?.trim() || null;
  if (rawMode !== "demo" && rawMode !== "keyless") {
    return { mode: "invalid", configured: false, apiKey: null };
  }
  return {
    mode: rawMode,
    configured: rawMode === "keyless" || Boolean(apiKey),
    apiKey,
  };
}

export function safeProviderConfigurationViews(): SafeProviderConfigurationView[] {
  const coinGecko = coinGeckoRuntimeConfiguration();
  return [
    {
      provider: "coingecko",
      configured: coinGecko.configured,
      mode: coinGecko.mode,
    },
    { provider: "ecb", configured: true, mode: "reference" },
  ];
}

export function createServerPriceProviderAdapters(): PriceProviderAdapters {
  const transport = new FetchPriceHttpTransport();
  const coinGecko = coinGeckoRuntimeConfiguration();
  if (coinGecko.mode === "invalid") {
    return {
      coingecko: {
        fetchCryptoUsdQuotes: async () => {
          throw new PriceProviderError(
            "CONFIG_ERROR",
            "COINGECKO_MODE must be demo or keyless.",
          );
        },
      },
      ecb: new EcbProvider(transport),
    };
  }
  return {
    coingecko: new CoinGeckoProvider(transport, {
      mode: coinGecko.mode,
      apiKey: coinGecko.apiKey,
    }),
    ecb: new EcbProvider(transport),
  };
}
