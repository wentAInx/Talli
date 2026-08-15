import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerHistoricalPriceProviderAdapters } from "@/providers/server-factory";
import { HistoricalRefreshService } from "@/services";

import { withDatabase } from "../../../../server-runtime";
import { isSameOriginRequest } from "../../../same-origin";
import { analyticsApiError, analyticsJson } from "../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z
  .object({
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return analyticsJson(
      { ok: false, error: "Cross-origin historical refresh is not allowed." },
      403,
    );
  }
  try {
    const input = requestSchema.parse(await request.json());
    const result = await withDatabase((context) =>
      new HistoricalRefreshService(
        context,
        createServerHistoricalPriceProviderAdapters(),
      ).start(input),
    );
    revalidatePath("/analytics");
    return analyticsJson({ ok: true, result });
  } catch (error) {
    return analyticsApiError(error, "Historical refresh start route");
  }
}
