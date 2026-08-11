import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { ExternalImportService } from "@/services/external-import-service";

import { logSafeSyncFailure, safeSyncError } from "../../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({ confirmed: z.literal(true) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin ignore requests are not allowed." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Candidate ignore request is invalid." },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    await withDatabase((context) =>
      new ExternalImportService(context).ignoreCandidate(id),
    );
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("External candidate ignore route", error);
    return safeSyncError(error);
  }
}
