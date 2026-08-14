import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { MAX_FILE_IMPORT_BYTES } from "@/domain/file-import";
import { FileImportService } from "@/services/file-import-service";

import { logSafeSyncFailure, safeSyncError } from "../../sync/safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requiredText(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin preview requests are not allowed." },
      { status: 403 },
    );
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const connectionId = form ? requiredText(form, "connectionId") : null;
  if (!(file instanceof File) || !connectionId) {
    return NextResponse.json(
      { ok: false, error: "Statement file and import profile are required." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_IMPORT_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Statement file exceeds the 20 MiB limit." },
      { status: 413 },
    );
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await withDatabase((context) =>
      new FileImportService(context).preview({
        connectionId,
        bytes,
        filename: file.name,
      }),
    );
    if (!preview.parsed) {
      const invalidRows = preview.fatalErrors.map((invalidReason, index) => ({
        sourceExternalId: `invalid:${index + 1}`,
        invalidReason,
      }));
      return NextResponse.json(
        {
          ok: false,
          fatalErrors: preview.fatalErrors,
          invalidRows,
          warnings: [],
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const known = new Set(preview.alreadyKnownSourceIds);
    const possibleMatchCount = preview.parsed.transactions.filter(
      (row) =>
        row.unsupportedReason === null &&
        !known.has(row.sourceExternalId) &&
        (preview.matchSuggestions[row.sourceExternalId]?.length ?? 0) > 0,
    ).length;
    const alreadyKnownCount = preview.parsed.transactions.filter(
      (row) =>
        row.unsupportedReason === null && known.has(row.sourceExternalId),
    ).length;
    const newCount = preview.parsed.transactions.filter(
      (row) =>
        row.unsupportedReason === null &&
        !known.has(row.sourceExternalId) &&
        (preview.matchSuggestions[row.sourceExternalId]?.length ?? 0) === 0,
    ).length;
    const rows = preview.parsed.transactions.slice(0, 20).map((row) => ({
      sourceExternalId: row.sourceExternalId,
      identityStrength: row.identityStrength,
      occurredAt: row.occurredAt,
      originalDateText: row.originalDateText,
      datePrecision: row.datePrecision,
      amountText: row.rawSignedAmountText,
      signedAtomic: row.signedAtomic.toString(),
      currencyCode: row.currencyCode,
      payee: row.payee,
      memo: row.memo,
      unsupportedReason: row.unsupportedReason,
      invalidReason: null,
      alreadyKnown: known.has(row.sourceExternalId),
      possibleMatches: preview.matchSuggestions[row.sourceExternalId] ?? [],
    }));
    return NextResponse.json(
      {
        ok: true,
        preview: {
          format: preview.parsed.format,
          sanitizedFilename: preview.parsed.sanitizedFilename,
          fileSha256: preview.parsed.fileSha256,
          statementIdentity: preview.parsed.statementIdentity,
          statementFromDate: preview.parsed.statementFromDate,
          statementToDate: preview.parsed.statementToDate,
          rowCount: preview.parsed.transactions.length,
          alreadyKnownCount,
          possibleMatchCount,
          newCount,
          invalidCount: 0,
          unsupportedCount: preview.parsed.transactions.filter(
            (row) => row.unsupportedReason !== null,
          ).length,
          closingBalance: preview.parsed.closingBalance
            ? {
                ...preview.parsed.closingBalance,
                signedAtomic:
                  preview.parsed.closingBalance.signedAtomic.toString(),
              }
            : null,
          rows,
          truncated: preview.parsed.transactions.length > rows.length,
          warnings: preview.warnings,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("File-import preview route", error);
    return safeSyncError(error);
  }
}
