import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { localDateTimeToUtc } from "@/domain/time";
import { RecurringItemService } from "@/services/recurring-item-service";
import { SettingsService } from "@/services/settings-service";

import { automationApiError } from "../../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const identity = {
  recurringItemId: z.string().trim().min(1),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};

const requestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("link"),
      ...identity,
      ledgerEventId: z.string().trim().min(1),
      confirmed: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("unlink"), ...identity }).strict(),
  z
    .object({
      action: z.literal("skip"),
      ...identity,
      note: z.string().max(2000).optional().nullable(),
    })
    .strict(),
  z.object({ action: z.literal("unskip"), ...identity }).strict(),
  z
    .object({
      action: z.literal("post"),
      ...identity,
      actualAmount: z.string(),
      occurredAtLocal: z.string(),
      payee: z.string().max(200).optional().nullable(),
      categoryId: z.string().trim().min(1).optional().nullable(),
      tagIds: z.array(z.string().trim().min(1)).max(100).optional(),
      note: z.string().max(2000).optional().nullable(),
      confirmed: z.literal(true),
    })
    .strict(),
]);

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin automation requests are not allowed." },
      { status: 403 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Recurring occurrence request is invalid." },
      { status: 400 },
    );
  }
  try {
    const result = await withDatabase((context) => {
      const service = new RecurringItemService(context);
      switch (parsed.data.action) {
        case "link":
          service.linkExisting(parsed.data);
          return {};
        case "unlink":
          service.unlink(parsed.data);
          return {};
        case "skip":
          service.skip(parsed.data);
          return {};
        case "unskip":
          service.unskip(parsed.data);
          return {};
        case "post": {
          const timeZone = new SettingsService(context).getTimeZoneOrDefault();
          const ledgerEventId = service.postOccurrence({
            recurringItemId: parsed.data.recurringItemId,
            occurrenceDate: parsed.data.occurrenceDate,
            actualAmount: parsed.data.actualAmount,
            occurredAt: localDateTimeToUtc(
              parsed.data.occurredAtLocal,
              timeZone,
            ),
            payee: parsed.data.payee,
            categoryId: parsed.data.categoryId,
            tagIds: parsed.data.tagIds,
            note: parsed.data.note,
            confirmed: true,
          });
          return { ledgerEventId };
        }
      }
    });
    if (parsed.data.action === "post") {
      revalidatePath("/analytics");
    }
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return automationApiError(error);
  }
}
