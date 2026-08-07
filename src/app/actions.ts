"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { listDefaultBooks } from "@/db/queries";
import { accountTypes } from "@/db/schema";
import { DomainValidationError } from "@/domain/errors";
import {
  AccountService,
  LedgerCommandService,
  ReconciliationService,
  ServiceError,
} from "@/services";

import { withDatabase } from "./server-runtime";
import type { ActionState } from "./action-state";

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_ARCHIVED: "归档账户不能用于新的记账操作。",
  ACCOUNT_ASSET_LOCKED: "账户已有流水或余额锚点，不能再更改资产。",
  ACCOUNT_NOT_FOUND: "没有找到该账户。",
  ASSET_ARCHIVED: "该资产已归档，不能用于新的记账操作。",
  ASSET_NOT_FOUND: "没有找到该资产。",
  CATEGORY_ARCHIVED: "该分类已归档。",
  CATEGORY_TYPE_MISMATCH: "该分类不适用于当前交易类型。",
  CROSS_BOOK_EVENT: "交易涉及的账户不属于同一账本。",
  EXCESS_FRACTIONAL_DIGITS: "金额小数位超过该资产允许的精度。",
  INVALID_DECIMAL: "金额必须是普通十进制文本，不能包含逗号或科学计数法。",
  AMOUNT_NOT_POSITIVE: "金额必须大于 0。",
  EXCHANGE_ASSET_MATCH: "兑换必须发生在两种不同资产之间。",
  EXCHANGE_SAME_ACCOUNT: "兑换的卖出与买入账户必须不同。",
  SNAPSHOT_TIME_CONFLICT: "该账户在同一时刻已经存在余额锚点。",
  TAG_ARCHIVED: "选择的标签已归档。",
  TRANSFER_ASSET_MISMATCH: "转账只能发生在相同资产的两个账户之间。",
  TRANSFER_SAME_ACCOUNT: "转账的转出与转入账户必须不同。",
};

function actionError(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "请检查表单内容。" };
  }
  if (error instanceof ServiceError || error instanceof DomainValidationError) {
    return { error: ERROR_MESSAGES[error.code] ?? error.message };
  }
  console.error(error);
  return { error: "保存失败。请检查输入后重试。" };
}

function requiredFormText(formData: FormData, name: string, label: string) {
  return z
    .string({ error: `${label}格式无效。` })
    .trim()
    .min(1, `${label}不能为空。`)
    .parse(formData.get(name));
}

function optionalFormText(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function tagIds(formData: FormData): string[] {
  return formData
    .getAll("tagIds")
    .filter((value): value is string => typeof value === "string");
}

function feeInput(formData: FormData) {
  if (formData.get("hasFee") !== "on") {
    return null;
  }
  return {
    accountId: requiredFormText(formData, "feeAccountId", "手续费账户"),
    amount: requiredFormText(formData, "feeAmount", "手续费金额"),
  };
}

function ledgerCommand(formData: FormData) {
  const eventType = z
    .enum(["expense", "income", "transfer", "exchange"], {
      error: "请选择交易类型。",
    })
    .parse(formData.get("eventType"));
  const occurredAt = requiredFormText(formData, "occurredAt", "交易时间");
  const note = optionalFormText(formData, "note");
  const selectedTagIds = tagIds(formData);

  switch (eventType) {
    case "expense":
    case "income":
      return {
        eventType,
        input: {
          accountId: requiredFormText(formData, "accountId", "账户"),
          amount: requiredFormText(formData, "amount", "金额"),
          occurredAt,
          categoryId: optionalFormText(formData, "categoryId"),
          payee: optionalFormText(formData, "payee"),
          note,
          tagIds: selectedTagIds,
        },
      } as const;
    case "transfer":
      return {
        eventType,
        input: {
          sourceAccountId: requiredFormText(
            formData,
            "sourceAccountId",
            "转出账户",
          ),
          destinationAccountId: requiredFormText(
            formData,
            "destinationAccountId",
            "转入账户",
          ),
          amount: requiredFormText(formData, "amount", "金额"),
          occurredAt,
          fee: feeInput(formData),
          note,
          tagIds: selectedTagIds,
        },
      } as const;
    case "exchange":
      return {
        eventType,
        input: {
          sourceAccountId: requiredFormText(
            formData,
            "sourceAccountId",
            "卖出账户",
          ),
          sourceAmount: requiredFormText(formData, "sourceAmount", "卖出数量"),
          destinationAccountId: requiredFormText(
            formData,
            "destinationAccountId",
            "买入账户",
          ),
          destinationAmount: requiredFormText(
            formData,
            "destinationAmount",
            "买入数量",
          ),
          occurredAt,
          fee: feeInput(formData),
          note,
          tagIds: selectedTagIds,
        },
      } as const;
  }
}

function revalidateLedgerViews(): void {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
}

export async function createAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let accountId: string;
  try {
    accountId = await withDatabase(async (context) => {
      const books = listDefaultBooks(context.db);
      if (books.length !== 1) {
        throw new ServiceError("DEFAULT_BOOK_UNAVAILABLE", "默认账本不可用。");
      }
      return new AccountService(context).createAccount({
        bookId: books[0].id,
        assetId: requiredFormText(formData, "assetId", "资产"),
        name: requiredFormText(formData, "name", "账户名称"),
        accountType: z
          .enum(accountTypes, { error: "请选择账户类型。" })
          .parse(formData.get("accountType")),
        institutionName: optionalFormText(formData, "institutionName"),
        initialBalance: optionalFormText(formData, "initialBalance"),
        note: optionalFormText(formData, "note"),
      });
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}

export async function updateAccountAction(
  accountId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new AccountService(context).updateAccount(accountId, {
        assetId: requiredFormText(formData, "assetId", "资产"),
        name: requiredFormText(formData, "name", "账户名称"),
        accountType: z
          .enum(accountTypes, { error: "请选择账户类型。" })
          .parse(formData.get("accountType")),
        institutionName: optionalFormText(formData, "institutionName"),
        note: optionalFormText(formData, "note"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}

export async function setAccountArchivedAction(
  accountId: string,
  isArchived: boolean,
): Promise<void> {
  await withDatabase((context) =>
    new AccountService(context).setArchived(accountId, isArchived),
  );
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}

export async function createLedgerEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let eventId: string;
  try {
    eventId = await withDatabase((context) => {
      const service = new LedgerCommandService(context);
      const command = ledgerCommand(formData);
      switch (command.eventType) {
        case "expense":
          return service.createExpense(command.input);
        case "income":
          return service.createIncome(command.input);
        case "transfer":
          return service.createTransfer(command.input);
        case "exchange":
          return service.createExchange(command.input);
      }
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/transactions/${eventId}`);
}

export async function createLedgerOperationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formData.get("eventType") !== "reconcile") {
    return createLedgerEventAction(_previous, formData);
  }

  const accountIdValue = formData.get("accountId");
  let accountId: string;
  try {
    accountId = z
      .string({ error: "请选择账户。" })
      .trim()
      .min(1, "请选择账户。")
      .parse(accountIdValue);
    await withDatabase((context) =>
      new ReconciliationService(context).reconcile({
        accountId,
        actualBalance: requiredFormText(formData, "actualBalance", "实际余额"),
        asOf: requiredFormText(formData, "occurredAt", "调整时间"),
        note: optionalFormText(formData, "note"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}

export async function updateLedgerEventAction(
  eventId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new LedgerCommandService(context).updateEvent(
        eventId,
        ledgerCommand(formData),
      ),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/transactions/${eventId}`);
}

export async function deleteLedgerEventAction(eventId: string): Promise<void> {
  await withDatabase((context) =>
    new LedgerCommandService(context).deleteEvent(eventId),
  );
  revalidateLedgerViews();
  redirect("/transactions");
}

export async function createSnapshotAction(
  accountId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new ReconciliationService(context).reconcile({
        accountId,
        actualBalance: requiredFormText(formData, "actualBalance", "实际余额"),
        asOf: requiredFormText(formData, "asOf", "调整时间"),
        note: optionalFormText(formData, "note"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}

export async function updateSnapshotAction(
  accountId: string,
  snapshotId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new ReconciliationService(context).update(snapshotId, {
        actualBalance: requiredFormText(formData, "actualBalance", "实际余额"),
        asOf: requiredFormText(formData, "asOf", "调整时间"),
        note: optionalFormText(formData, "note"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}

export async function deleteSnapshotAction(
  accountId: string,
  snapshotId: string,
): Promise<void> {
  await withDatabase((context) =>
    new ReconciliationService(context).delete(snapshotId),
  );
  revalidateLedgerViews();
  redirect(`/accounts/${accountId}`);
}
