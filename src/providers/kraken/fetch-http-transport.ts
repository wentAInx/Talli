import "server-only";

import { KrakenProviderError } from "./errors";
import type { KrakenHttpTransport } from "./types";

export class FetchKrakenHttpTransport implements KrakenHttpTransport {
  async request(input: {
    method: "GET" | "POST";
    url: URL;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
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
        throw new KrakenProviderError(
          "NETWORK_ERROR",
          "Kraken read-only request timed out.",
        );
      }
      throw new KrakenProviderError(
        "NETWORK_ERROR",
        "Kraken read-only network request failed.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
