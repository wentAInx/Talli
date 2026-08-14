import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { FileImportService } from "@/services/file-import-service";

import {
  logSafeSyncFailure,
  safeSyncError,
} from "../../../../sync/safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z
  .object({
    ledgerEventId: z.string().trim().min(1),
    confirmed: z.literal(true),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin match requests are not allowed." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Candidate match request is invalid." },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    await withDatabase((context) =>
      new FileImportService(context).matchExisting({
        candidateId: id,
        ledgerEventId: parsed.data.ledgerEventId,
        confirmed: true,
      }),
    );
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("File-import match route", error);
    return safeSyncError(error);
  }
}
