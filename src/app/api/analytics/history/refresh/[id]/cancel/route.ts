import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerHistoricalPriceProviderAdapters } from "@/providers/server-factory";
import { HistoricalRefreshService } from "@/services";

import { withDatabase } from "../../../../../../server-runtime";
import { isSameOriginRequest } from "../../../../../same-origin";
import { analyticsApiError, analyticsJson } from "../../../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return analyticsJson(
      { ok: false, error: "Cross-origin historical refresh is not allowed." },
      403,
    );
  }
  try {
    const body = (await request.json()) as unknown;
    z.object({}).strict().parse(body);
    const { id } = await params;
    const result = await withDatabase((context) =>
      new HistoricalRefreshService(
        context,
        createServerHistoricalPriceProviderAdapters(),
      ).cancel({ runId: z.string().min(1).max(255).parse(id) }),
    );
    revalidatePath("/analytics");
    return analyticsJson({ ok: true, result });
  } catch (error) {
    return analyticsApiError(error, "Historical refresh cancel route");
  }
}
