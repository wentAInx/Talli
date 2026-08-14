import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { MAX_FILE_IMPORT_BYTES } from "@/domain/file-import";
import { FileImportService } from "@/services/file-import-service";

import { logSafeSyncFailure, safeSyncError } from "../../sync/safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin commit requests are not allowed." },
      { status: 403 },
    );
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const connectionId = form?.get("connectionId");
  if (
    !(file instanceof File) ||
    typeof connectionId !== "string" ||
    connectionId.trim().length === 0 ||
    form?.get("confirmed") !== "true"
  ) {
    return NextResponse.json(
      { ok: false, error: "Confirmed statement commit is invalid." },
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
    const output = await withDatabase(async (context) => {
      const service = new FileImportService(context);
      const preview = await service.preview({
        connectionId: connectionId.trim(),
        bytes,
        filename: file.name,
      });
      if (!preview.parsed) {
        return { fatalErrors: preview.fatalErrors };
      }
      const known = new Set(preview.alreadyKnownSourceIds);
      const summary = {
        rows: preview.parsed.transactions.length,
        alreadyImportedCount: preview.parsed.transactions.filter(
          (row) =>
            row.unsupportedReason === null && known.has(row.sourceExternalId),
        ).length,
        possibleMatchCount: preview.parsed.transactions.filter(
          (row) =>
            row.unsupportedReason === null &&
            !known.has(row.sourceExternalId) &&
            (preview.matchSuggestions[row.sourceExternalId]?.length ?? 0) > 0,
        ).length,
        newCount: preview.parsed.transactions.filter(
          (row) =>
            row.unsupportedReason === null &&
            !known.has(row.sourceExternalId) &&
            (preview.matchSuggestions[row.sourceExternalId]?.length ?? 0) === 0,
        ).length,
        unsupportedCount: preview.parsed.transactions.filter(
          (row) => row.unsupportedReason !== null,
        ).length,
        invalidCount: 0,
      };
      const result = await service.commit({
        connectionId: connectionId.trim(),
        bytes,
        filename: file.name,
        confirmed: true,
        confirmedStatementIdentity:
          form.get("confirmedStatementIdentity") === "true" ? true : undefined,
      });
      return { result: { ...result, summary } };
    });
    if ("fatalErrors" in output) {
      return NextResponse.json(
        { ok: false, fatalErrors: output.fatalErrors },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, result: output.result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logSafeSyncFailure("File-import commit route", error);
    return safeSyncError(error);
  }
}
