import {
  HistoricalHistoryStatusService,
  ReferenceDataService,
} from "@/services";

import { withDatabase } from "../../../../server-runtime";
import {
  analyticsApiError,
  analyticsJson,
  strictQuery,
} from "../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    strictQuery(request, []);
    const result = await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new HistoricalHistoryStatusService(context).read({ bookId });
    });
    return analyticsJson({ ok: true, result });
  } catch (error) {
    return analyticsApiError(error, "Analytics history status route");
  }
}
