import "server-only";

import type { DatabaseContext } from "../../db/connection";
import { KrakenReadOnlyClient } from "./client";
import { KrakenProviderError } from "./errors";
import { FetchKrakenHttpTransport } from "./fetch-http-transport";
import { KrakenNonceService } from "./nonce";
import {
  DeterministicKrakenFixtureProvider,
  isKrakenFixtureMode,
} from "./fixture-provider";
import type {
  KrakenRuntimeConfiguration,
  SafeKrakenConfigurationView,
} from "./types";

export function krakenRuntimeConfiguration(): KrakenRuntimeConfiguration {
  const apiKey = process.env.KRAKEN_API_KEY?.trim() || null;
  const apiSecret = process.env.KRAKEN_API_SECRET?.trim() || null;
  return {
    credentialRef: "env:kraken.primary",
    configured: Boolean(apiKey && apiSecret),
    apiKey,
    apiSecret,
  };
}

export function safeKrakenConfigurationView(): SafeKrakenConfigurationView {
  const configuration = krakenRuntimeConfiguration();
  return {
    credentialRef: configuration.credentialRef,
    configured: configuration.configured || isKrakenFixtureMode(),
  };
}

export function createServerKrakenProvider(
  context: DatabaseContext,
  connectionId: string,
) {
  if (isKrakenFixtureMode()) {
    return new DeterministicKrakenFixtureProvider();
  }
  if (process.env.CI === "true") {
    throw new KrakenProviderError(
      "CONFIG_ERROR",
      "Live Kraken transport is disabled in CI.",
    );
  }
  const configuration = krakenRuntimeConfiguration();
  if (!configuration.apiKey || !configuration.apiSecret) {
    throw new KrakenProviderError(
      "CONFIG_ERROR",
      "Kraken server credentials are not configured.",
    );
  }
  return new KrakenReadOnlyClient(
    new FetchKrakenHttpTransport(),
    new KrakenNonceService(context),
    {
      connectionId,
      apiKey: configuration.apiKey,
      apiSecret: configuration.apiSecret,
    },
  );
}
