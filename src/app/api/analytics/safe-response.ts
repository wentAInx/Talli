import { NextResponse } from "next/server";
import { z } from "zod";

import { DomainValidationError } from "@/domain/errors";
import { ServiceError } from "@/services/errors";

export function analyticsJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function analyticsApiError(error: unknown, scope: string) {
  if (error instanceof z.ZodError) {
    return analyticsJson(
      {
        ok: false,
        code: "INVALID_ANALYTICS_REQUEST",
        error: "Historical analytics request is invalid.",
      },
      400,
    );
  }
  if (error instanceof ServiceError || error instanceof DomainValidationError) {
    return analyticsJson(
      { ok: false, code: error.code, error: error.message },
      400,
    );
  }
  console.error(
    `${scope} failed.`,
    error instanceof Error ? error.name : "UnknownError",
  );
  return analyticsJson(
    {
      ok: false,
      code: "INTERNAL_ERROR",
      error: "Historical analytics request could not be completed.",
    },
    500,
  );
}

export function strictQuery(
  request: Request,
  allowed: readonly string[],
): Record<string, string | undefined> {
  const parameters = new URL(request.url).searchParams;
  for (const key of parameters.keys()) {
    if (!allowed.includes(key)) {
      throw new DomainValidationError(
        "INVALID_ANALYTICS_QUERY",
        `Unexpected analytics query parameter: ${key}.`,
      );
    }
  }
  const result: Record<string, string | undefined> = {};
  for (const key of allowed) {
    const values = parameters.getAll(key);
    if (values.length > 1) {
      throw new DomainValidationError(
        "INVALID_ANALYTICS_QUERY",
        `Analytics query parameter ${key} may be provided only once.`,
      );
    }
    result[key] = values[0];
  }
  return result;
}
