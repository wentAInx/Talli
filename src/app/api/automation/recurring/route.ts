import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { RecurringItemService } from "@/services/recurring-item-service";

import { automationApiError } from "../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const optionalText = z.string().optional().nullable();
const draftSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    bookId: z.string().trim().min(1),
    accountId: z.string().trim().min(1),
    name: z.string(),
    eventType: z.enum(["expense", "income"]),
    payeeText: optionalText,
    payeeMatchMode: z.enum(["any", "exact", "contains"]),
    categoryId: optionalText,
    tagIds: z.array(z.string().trim().min(1)).max(100).optional(),
    note: optionalText,
    amountMode: z.enum(["exact", "approx", "range"]),
    amount: optionalText,
    toleranceBps: z.number().int().optional().nullable(),
    minAmount: optionalText,
    maxAmount: optionalText,
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    intervalCount: z.number().int(),
    anchorDate: z.string(),
    monthlyDayMode: z.enum(["fixed", "last"]).optional().nullable(),
    dateWindowBeforeDays: z.number().int(),
    dateWindowAfterDays: z.number().int(),
    startsOn: optionalText,
    endsOn: optionalText,
    isActive: z.boolean(),
  })
  .strict();

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), draft: draftSchema }).strict(),
  z
    .object({
      action: z.literal("set_active"),
      recurringItemId: z.string().trim().min(1),
      isActive: z.boolean(),
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
      { ok: false, error: "Recurring item request is invalid." },
      { status: 400 },
    );
  }
  try {
    const result = await withDatabase((context) => {
      const service = new RecurringItemService(context);
      if (parsed.data.action === "save") {
        return { recurringItemId: service.save(parsed.data.draft) };
      }
      service.setActive(parsed.data.recurringItemId, parsed.data.isActive);
      return {};
    });
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return automationApiError(error);
  }
}
