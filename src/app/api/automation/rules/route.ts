import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/app/api/same-origin";
import { withDatabase } from "@/app/server-runtime";
import { AutomationRuleService } from "@/services/automation-rule-service";

import { automationApiError } from "../safe-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const conditionSchema = z
  .object({
    field: z.enum([
      "source_payee",
      "projected_payee",
      "memo",
      "file_profile",
      "target_account",
      "source_format",
      "direction",
      "amount_abs",
      "identity_strength",
    ]),
    operator: z.enum([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
      "is_empty",
      "is_not_empty",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
    ]),
    value: z.unknown(),
    isNegated: z.boolean().optional(),
  })
  .strict();

const actionSchema = z
  .object({
    actionType: z.enum([
      "set_payee",
      "set_category",
      "add_tag",
      "set_note",
      "append_note",
      "suggest_event_type",
    ]),
    value: z.unknown(),
  })
  .strict();

const draftSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    bookId: z.string().trim().min(1),
    name: z.string(),
    stage: z.enum(["pre", "default", "post"]),
    matchMode: z.enum(["all", "any"]),
    isEnabled: z.boolean(),
    sortOrder: z.number().int(),
    conditions: z.array(conditionSchema).max(50),
    actions: z.array(actionSchema).max(20),
  })
  .strict();

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), draft: draftSchema }).strict(),
  z.object({ action: z.literal("preview"), draft: draftSchema }).strict(),
  z
    .object({
      action: z.literal("set_enabled"),
      ruleId: z.string().trim().min(1),
      isEnabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      ruleId: z.string().trim().min(1),
      direction: z.enum(["up", "down"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("duplicate"),
      ruleId: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      ruleId: z.string().trim().min(1),
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
      { ok: false, error: "Automation rule request is invalid." },
      { status: 400 },
    );
  }
  try {
    const result = await withDatabase((context) => {
      const service = new AutomationRuleService(context);
      switch (parsed.data.action) {
        case "save":
          return { ruleId: service.save(parsed.data.draft) };
        case "preview":
          return service.preview(parsed.data.draft);
        case "set_enabled":
          service.setEnabled(parsed.data.ruleId, parsed.data.isEnabled);
          return {};
        case "move":
          service.move(parsed.data.ruleId, parsed.data.direction);
          return {};
        case "duplicate":
          return { ruleId: service.duplicate(parsed.data.ruleId) };
        case "delete":
          service.deleteDisabled(parsed.data.ruleId);
          return {};
      }
    });
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return automationApiError(error);
  }
}
