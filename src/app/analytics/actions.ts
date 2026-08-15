"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DomainValidationError } from "@/domain/errors";
import { HistoricalManualQuoteService, ServiceError } from "@/services";

import { INITIAL_ACTION_STATE, type ActionState } from "../action-state";
import { withDatabase } from "../server-runtime";

const formSchema = z
  .object({
    id: z.string().trim().min(1).max(255).optional(),
    baseAssetId: z.string().trim().min(1).max(255),
    quoteAssetId: z.string().trim().min(1).max(255),
    valuationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rateText: z.string().trim().min(1).max(500),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();

function actionError(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "请检查历史价格表单。" };
  }
  if (error instanceof ServiceError || error instanceof DomainValidationError) {
    return { error: error.message };
  }
  console.error(
    "Historical manual quote action failed.",
    error instanceof Error ? error.name : "UnknownError",
  );
  return { error: "历史手动价格保存失败。" };
}

export async function saveHistoricalManualQuoteAction(
  state: ActionState = INITIAL_ACTION_STATE,
  formData: FormData,
): Promise<ActionState> {
  void state;
  try {
    const input = formSchema.parse({
      id:
        typeof formData.get("id") === "string" && formData.get("id")
          ? formData.get("id")
          : undefined,
      baseAssetId: formData.get("baseAssetId"),
      quoteAssetId: formData.get("quoteAssetId"),
      valuationDate: formData.get("valuationDate"),
      rateText: formData.get("rateText"),
      note:
        typeof formData.get("note") === "string" && formData.get("note")
          ? formData.get("note")
          : undefined,
    });
    await withDatabase((context) =>
      new HistoricalManualQuoteService(context).save(input),
    );
    revalidatePath("/analytics");
    return INITIAL_ACTION_STATE;
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteHistoricalManualQuoteAction(
  id: string,
): Promise<void> {
  const quoteId = z.string().trim().min(1).max(255).parse(id);
  await withDatabase((context) =>
    new HistoricalManualQuoteService(context).delete(quoteId),
  );
  revalidatePath("/analytics");
}
