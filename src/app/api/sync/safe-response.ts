import { NextResponse } from "next/server";

import { DomainValidationError } from "@/domain/errors";
import { KrakenProviderError } from "@/providers/kraken/errors";
import { ServiceError } from "@/services/errors";

const SAFE_KRAKEN_MESSAGES: Record<string, string> = {
  CONFIG_ERROR: "Kraken 凭据未配置，无法同步。",
  AUTH_ERROR: "Kraken 凭据认证失败。",
  PERMISSION_ERROR: "Kraken API key 权限不符合只读同步要求。",
  NONCE_ERROR: "Kraken nonce 被拒绝，请稍后重试。",
  RATE_LIMITED: "Kraken 请求频率受限，请稍后重试。",
  UPSTREAM_ERROR: "Kraken 服务暂时不可用。",
  UPSTREAM_PAYLOAD_INVALID: "Kraken 返回了无法安全处理的数据。",
  NETWORK_ERROR: "无法连接 Kraken，请检查网络后重试。",
};

export function safeSyncError(error: unknown): NextResponse {
  if (error instanceof KrakenProviderError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        error: SAFE_KRAKEN_MESSAGES[error.code] ?? "Kraken 同步失败。",
      },
      { status: error.code === "RATE_LIMITED" ? 429 : 400 },
    );
  }
  if (error instanceof ServiceError || error instanceof DomainValidationError) {
    return NextResponse.json(
      { ok: false, code: error.code, error: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { ok: false, code: "INTERNAL_ERROR", error: "同步操作未完成。" },
    { status: 500 },
  );
}

export function logSafeSyncFailure(scope: string, error: unknown): void {
  const code =
    error instanceof KrakenProviderError ||
    error instanceof ServiceError ||
    error instanceof DomainValidationError
      ? error.code
      : "INTERNAL_ERROR";
  console.error(`${scope} failed.`, code);
}
