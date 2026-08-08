export type PriceProviderErrorCode =
  | "CONFIG_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_PAYLOAD_INVALID";

export class PriceProviderError extends Error {
  constructor(
    readonly code: PriceProviderErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "PriceProviderError";
  }
}

export function retryAfterSeconds(
  headers: Headers,
  fetchedAt: string,
): number | null {
  const raw = headers.get("retry-after")?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return Math.max(0, Number.parseInt(raw, 10));
  }
  const retryAt = Date.parse(raw);
  const reference = Date.parse(fetchedAt);
  if (Number.isNaN(retryAt) || Number.isNaN(reference)) return null;
  return Math.max(0, Math.ceil((retryAt - reference) / 1000));
}

export function assertProviderHttpStatus(input: {
  status: number;
  headers: Headers;
  fetchedAt: string;
  providerLabel: string;
}): void {
  if (input.status >= 200 && input.status < 300) return;
  if (input.status === 401 || input.status === 403) {
    throw new PriceProviderError(
      "AUTH_ERROR",
      `${input.providerLabel} rejected the configured credentials.`,
    );
  }
  if (input.status === 429) {
    throw new PriceProviderError(
      "RATE_LIMITED",
      `${input.providerLabel} rate limit was reached.`,
      retryAfterSeconds(input.headers, input.fetchedAt),
    );
  }
  throw new PriceProviderError(
    "UPSTREAM_ERROR",
    `${input.providerLabel} returned an unavailable upstream response.`,
  );
}
