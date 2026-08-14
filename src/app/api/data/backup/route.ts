import { BackupService } from "@/services";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const payload = await withDatabase((context) =>
    new BackupService(context).exportBackup(),
  );
  const date = payload.exportedAt.slice(0, 10);
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="talli-backup-v6-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
