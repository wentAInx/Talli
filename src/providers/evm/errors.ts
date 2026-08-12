export type EvmProviderErrorCode =
  | "CONFIG_ERROR"
  | "AUTH_ERROR"
  | "CHAIN_MISMATCH"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_PAYLOAD"
  | "NETWORK_ERROR"
  | "PAGINATION_EXPIRED";

export class EvmProviderError extends Error {
  constructor(
    readonly code: EvmProviderErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "EvmProviderError";
  }
}

export function safeEvmFailure(error: unknown): {
  code: EvmProviderErrorCode;
  message: string;
  retryAfterSeconds: number | null;
} {
  if (error instanceof EvmProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return {
    code: "UPSTREAM_ERROR",
    message: "Ethereum read-only sync failed.",
    retryAfterSeconds: null,
  };
}
