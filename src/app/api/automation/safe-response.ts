import { NextResponse } from "next/server";

import { DomainValidationError } from "@/domain/errors";
import { ServiceError } from "@/services/errors";

export function automationApiError(error: unknown) {
  if (error instanceof ServiceError || error instanceof DomainValidationError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: 400 },
    );
  }
  console.error("Automation API request failed", error);
  return NextResponse.json(
    { ok: false, error: "Automation request failed." },
    { status: 500 },
  );
}
