import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { ExternalImportService } from "@/services/external-import-service";

import { logSafeSyncFailure, safeSyncError } from "../../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const optionalId = z.string().trim().min(1).optional().nullable();
const requestSchema = z
  .object({
    chosenEventType: z.enum(["expense", "income", "transfer", "exchange"]),
    sourceAccountId: optionalId,
    destinationAccountId: optionalId,
    mainAccountId: optionalId,
    feeAccountId: optionalId,
    categoryId: optionalId,
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
      { ok: false, error: "Cross-origin import requests are not allowed." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Candidate import request is invalid." },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    const result = await withDatabase((context) =>
      new ExternalImportService(context).importCandidate({
        candidateId: id,
        chosenEventType: parsed.data.chosenEventType,
        sourceAccountId: parsed.data.sourceAccountId ?? undefined,
        destinationAccountId: parsed.data.destinationAccountId ?? undefined,
        mainAccountId: parsed.data.mainAccountId ?? undefined,
        feeAccountId: parsed.data.feeAccountId,
        categoryId: parsed.data.categoryId,
        note: parsed.data.note,
        confirmed: true,
      }),
    );
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("External candidate import route", error);
    return safeSyncError(error);
  }
}
