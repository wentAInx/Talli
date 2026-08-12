import "server-only";

import { EVM_ALCHEMY_CREDENTIAL_REF } from "../../domain/evm";
import { AlchemyReadOnlyClient } from "./client";
import { EvmProviderError } from "./errors";
import { FetchEvmJsonRpcTransport } from "./fetch-http-transport";
import {
  DeterministicEvmFixtureProvider,
  isEvmFixtureMode,
} from "./fixture-provider";
import type {
  AlchemyRuntimeConfiguration,
  SafeAlchemyConfigurationView,
} from "./types";

export function alchemyRuntimeConfiguration(): AlchemyRuntimeConfiguration {
  const apiKey = process.env.ALCHEMY_API_KEY?.trim() || null;
  return {
    credentialRef: EVM_ALCHEMY_CREDENTIAL_REF,
    configured: Boolean(apiKey),
    apiKey,
  };
}

export function safeAlchemyConfigurationView(): SafeAlchemyConfigurationView {
  const configuration = alchemyRuntimeConfiguration();
  return {
    credentialRef: configuration.credentialRef,
    configured: configuration.configured || isEvmFixtureMode(),
  };
}

export function createServerEvmProvider() {
  if (isEvmFixtureMode()) {
    return new DeterministicEvmFixtureProvider();
  }
  if (process.env.CI === "true") {
    throw new EvmProviderError(
      "CONFIG_ERROR",
      "Live Alchemy transport is disabled in CI.",
    );
  }
  const configuration = alchemyRuntimeConfiguration();
  if (!configuration.apiKey) {
    throw new EvmProviderError(
      "CONFIG_ERROR",
      "Alchemy server credential is not configured.",
    );
  }
  return new AlchemyReadOnlyClient(new FetchEvmJsonRpcTransport(), {
    apiKey: configuration.apiKey,
  });
}
