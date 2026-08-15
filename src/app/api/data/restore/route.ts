import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { BackupValidationError } from "@/domain/backup";
import { BackupService, RestoreTargetError } from "@/services";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return NextResponse.json(
        { error: "Restore requires multipart/form-data." },
        { status: 415 },
      );
    }
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { error: "Cross-origin restore requests are not allowed." },
        { status: 403 },
      );
    }
    const formData = await request.formData();
    const mode = formData.get("mode");
    const file = formData.get("file");
    if (mode !== "preview" && mode !== "commit") {
      return NextResponse.json(
        { error: "Restore mode must be preview or commit." },
        { status: 400 },
      );
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Choose a non-empty JSON backup file." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BACKUP_BYTES) {
      return NextResponse.json(
        { error: "Backup file exceeds the 50 MB upload limit." },
        { status: 413 },
      );
    }
    const text = await file.text();
    const result = await withDatabase((context) => {
      const service = new BackupService(context);
      const payload = service.parseJson(text);
      return mode === "preview"
        ? service.previewRestore(payload)
        : service.restore(payload);
    });
    if (mode === "commit") {
      revalidatePath("/analytics");
    }
    return NextResponse.json({ ok: true, mode, result }, { status: 200 });
  } catch (error) {
    if (error instanceof BackupValidationError) {
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: 400 },
      );
    }
    if (error instanceof RestoreTargetError) {
      return NextResponse.json(
        { code: "RESTORE_TARGET_NOT_EMPTY", error: error.message },
        { status: 409 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Restore failed without changing the database." },
      { status: 500 },
    );
  }
}
