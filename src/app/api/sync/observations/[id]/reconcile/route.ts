import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { ExternalReconciliationService } from "@/services/external-reconciliation-service";

import { logSafeSyncFailure, safeSyncError } from "../../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z
  .object({
    accountId: z.string().trim().min(1),
    note: z.string().max(2000).optional().nullable(),
    confirmed: z.literal(true),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin reconcile requests are not allowed." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Observation reconcile request is invalid." },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    const result = await withDatabase((context) =>
      new ExternalReconciliationService(context).reconcileObservation({
        observationId: id,
        accountId: parsed.data.accountId,
        note: parsed.data.note,
        confirmed: true,
      }),
    );
    return NextResponse.json(
      {
        ok: true,
        result: {
          snapshotId: result.snapshotId,
          ledgerBeforeAtomic: result.ledgerBeforeAtomic.toString(),
          externalAtomic: result.externalAtomic.toString(),
          differenceAtomic: result.differenceAtomic.toString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("External observation reconcile route", error);
    return safeSyncError(error);
  }
}
