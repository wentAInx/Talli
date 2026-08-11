export type KrakenProviderErrorCode =
  | "CONFIG_ERROR"
  | "AUTH_ERROR"
  | "PERMISSION_ERROR"
  | "NONCE_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_PAYLOAD_INVALID"
  | "NETWORK_ERROR";

export class KrakenProviderError extends Error {
  constructor(
    readonly code: KrakenProviderErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "KrakenProviderError";
  }
}

export function safeKrakenFailure(error: unknown): {
  code: KrakenProviderErrorCode;
  message: string;
  retryAfterSeconds: number | null;
} {
  if (error instanceof KrakenProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return {
    code: "UPSTREAM_ERROR",
    message: "Kraken read-only sync failed.",
    retryAfterSeconds: null,
  };
}
