import "server-only";

import { EvmProviderError } from "./errors";
import type { EvmJsonRpcTransport } from "./types";

export class FetchEvmJsonRpcTransport implements EvmJsonRpcTransport {
  async request(input: { url: URL; body: string; timeoutMs: number }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        throw new EvmProviderError(
          "NETWORK_ERROR",
          "Alchemy read-only request timed out.",
        );
      }
      throw new EvmProviderError(
        "NETWORK_ERROR",
        "Alchemy read-only network request failed.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
