import "server-only";

import { PriceProviderError } from "./errors";
import type { PriceHttpTransport } from "./types";

export class FetchPriceHttpTransport implements PriceHttpTransport {
  async get(input: {
    url: URL;
    headers?: Record<string, string>;
    timeoutMs: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: "GET",
        headers: input.headers,
        signal: controller.signal,
        cache: "no-store",
      });
      return {
        status: response.status,
        headers: response.headers,
        text: await response.text(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PriceProviderError(
          "TIMEOUT",
          "Price provider request timed out.",
        );
      }
      throw new PriceProviderError(
        "NETWORK_ERROR",
        "Price provider network request failed.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
