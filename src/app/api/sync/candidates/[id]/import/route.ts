import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
    ignoreUnresolvedFee: z.boolean().optional().default(false),
    categoryId: optionalId,
    payee: z.string().max(200).optional().nullable(),
    tagIds: z.array(z.string().trim().min(1)).max(100).optional(),
    note: z.string().max(2000).optional().nullable(),
    recurringItemId: z.string().trim().min(1).optional(),
    occurrenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    confirmedRecurringLink: z.literal(true).optional(),
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
        ignoreUnresolvedFee: parsed.data.ignoreUnresolvedFee,
        categoryId: parsed.data.categoryId,
        payee: parsed.data.payee,
        tagIds: parsed.data.tagIds,
        note: parsed.data.note,
        recurringItemId: parsed.data.recurringItemId,
        occurrenceDate: parsed.data.occurrenceDate,
        confirmedRecurringLink: parsed.data.confirmedRecurringLink,
        confirmed: true,
      }),
    );
    revalidatePath("/analytics");
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("External candidate import route", error);
    return safeSyncError(error);
  }
}
