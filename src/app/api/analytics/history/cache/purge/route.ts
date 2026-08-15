import { revalidatePath } from "next/cache";
import { z } from "zod";

import { HistoricalProviderCacheService } from "@/services";

import { withDatabase } from "../../../../../server-runtime";
import { isSameOriginRequest } from "../../../../same-origin";
import { analyticsApiError, analyticsJson } from "../../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return analyticsJson(
      { ok: false, error: "Cross-origin history purge is not allowed." },
      403,
    );
  }
  try {
    z.object({ confirm: z.literal("purge-provider-history") })
      .strict()
      .parse(await request.json());
    await withDatabase((context) =>
      new HistoricalProviderCacheService(context).purge(),
    );
    revalidatePath("/analytics");
    return analyticsJson({ ok: true });
  } catch (error) {
    return analyticsApiError(error, "Historical cache purge route");
  }
}
