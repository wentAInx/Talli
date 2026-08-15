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
  })
  .strict();

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(strictQuery(request, ["from", "to"]));
    const result = await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new HistoricalAnalyticsService(context).netWorthSeries({
        bookId,
        fromDate: query.from,
        toDate: query.to,
      });
    });
    return analyticsJson({ ok: true, result });
  } catch (error) {
    return analyticsApiError(error, "Analytics net-worth route");
  }
}
