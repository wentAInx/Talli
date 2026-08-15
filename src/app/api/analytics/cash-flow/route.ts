import { z } from "zod";

import { HistoricalAnalyticsService, ReferenceDataService } from "@/services";

import { withDatabase } from "../../../server-runtime";
import {
  analyticsApiError,
  analyticsJson,
  strictQuery,
} from "../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bucket: z.literal("month"),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(
      strictQuery(request, ["from", "to", "bucket"]),
    );
    const result = await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new HistoricalAnalyticsService(context).cashFlowTrend({
        bookId,
        fromDate: query.from,
        toDate: query.to,
        bucket: query.bucket,
      });
    });
    return analyticsJson({ ok: true, result });
  } catch (error) {
    return analyticsApiError(error, "Analytics cash-flow route");
  }
}
