import { BackupService } from "@/services";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const csv = await withDatabase((context) =>
    new BackupService(context).exportCsv(),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="asset-ledger-entries-${date}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
