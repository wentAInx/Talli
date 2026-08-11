import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { createServerKrakenProvider } from "@/providers/kraken/server-factory";
import { ExternalSyncService } from "@/services/external-sync-service";

import { logSafeSyncFailure, safeSyncError } from "../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({ connectionId: z.string().min(1) }).strict();

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin sync requests are not allowed." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Sync request is invalid." },
      { status: 400 },
    );
  }
  try {
    const result = await withDatabase((context) =>
      new ExternalSyncService(context, (connectionId) =>
        createServerKrakenProvider(context, connectionId),
      ).syncNow(parsed.data.connectionId),
    );
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("Kraken sync route", error);
    return safeSyncError(error);
  }
}
