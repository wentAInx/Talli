"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { accountTypes, assetTypes, categoryTypes } from "@/db/schema";
import { DomainValidationError } from "@/domain/errors";
import { localDateTimeToUtc } from "@/domain/time";
import {
  AccountService,
  ExternalMappingService,
  EvmWalletService,
  LedgerCommandService,
  ManualPriceService,
  ProviderMappingService,
  ReferenceDataService,
  ReconciliationService,
  ServiceError,
  SettingsService,
  ValuationSettingsService,
} from "@/services";

import { withDatabase } from "./server-runtime";
import type { ActionState } from "./action-state";

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_ARCHIVED: "归档账户不能用于新的记账操作。",
  ACCOUNT_ASSET_LOCKED: "账户已有流水或余额锚点，不能再更改资产。",
  ACCOUNT_NOT_FOUND: "没有找到该账户。",
  ASSET_ARCHIVED: "该资产已归档，不能用于新的记账操作。",
  ASSET_NOT_FOUND: "没有找到该资产。",
  ASSET_CODE_REQUIRED: "资产代码不能为空。",
  ASSET_CODE_EXISTS: "资产代码已存在。",
  ASSET_NAME_REQUIRED: "资产名称不能为空。",
  ASSET_FACTS_LOCKED: "资产已有账户引用，类型和小数精度不能再修改。",
  ASSET_HAS_ACTIVE_ACCOUNTS: "请先归档该资产下的所有账户。",
  ASSET_PROVIDER_MAPPING_LOCKED:
    "该资产已有价格源映射，资产类型必须与映射保持兼容。",
  ASSET_SCALE_INVALID: "资产小数精度必须是 0 到 30 的整数。",
  ASSET_SEED_DEFINITION_LOCKED:
    "内置资产的类型与小数精度固定；名称、符号和排序仍可修改。",
  CATEGORY_ARCHIVED: "该分类已归档。",
  CATEGORY_BOOK_MISMATCH: "该分类不属于默认账本。",
  CATEGORY_NAME_REQUIRED: "分类名称不能为空。",
  CATEGORY_NOT_FOUND: "没有找到该分类。",
  CATEGORY_TYPE_MISMATCH: "该分类不适用于当前交易类型。",
  CATEGORY_FACTS_LOCKED: "该分类已有不兼容类型的历史流水。",
  CATEGORY_PARENT_CYCLE: "分类父级不能形成循环。",
  CATEGORY_PARENT_NOT_FOUND: "没有找到该分类父级。",
  CROSS_BOOK_EVENT: "交易涉及的账户不属于同一账本。",
  EXCESS_FRACTIONAL_DIGITS: "金额小数位超过该资产允许的精度。",
  INVALID_DECIMAL: "金额必须是普通十进制文本，不能包含逗号或科学计数法。",
  INVALID_LOCAL_DATE_TIME: "日期与时间格式无效。",
  INVALID_TIME_ZONE: "App 时区设置无效，请先在设置中修正。",
  HOME_ASSET_INVALID: "Home Asset 必须是未归档的法币。",
  HOME_ASSET_ARCHIVE_BLOCKED:
    "该资产当前是 Home Asset，请先切换估值币种再归档。",
  HOME_ASSET_NOT_FOUND: "没有找到 Home Asset。",
  HOME_ASSET_TYPE_LOCKED:
    "该资产当前是 Home Asset，请先切换估值币种再修改资产类型。",
  PRICE_PROVIDER_INVALID: "价格源无效。",
  PROVIDER_ASSET_TYPE_INVALID: "价格源与资产类型不匹配。",
  PROVIDER_KEY_INVALID: "价格源映射 key 格式无效。",
  PROVIDER_PRIORITY_INVALID: "价格源优先级必须是整数。",
  MANUAL_QUOTE_IDENTITY: "手动价格的基础资产和报价资产必须不同。",
  MANUAL_QUOTE_NOT_FOUND: "没有找到该手动价格。",
  BASE_ASSET_NOT_FOUND: "没有找到基础资产。",
  QUOTE_ASSET_NOT_FOUND: "没有找到报价资产。",
  INVALID_PRICE_DECIMAL:
    "价格必须是大于 0 的普通十进制文本，不能使用科学计数法。",
  NONEXISTENT_LOCAL_DATE_TIME:
    "该本地时间因夏令时切换而不存在，请选择另一个时间。",
  AMOUNT_NOT_POSITIVE: "金额必须大于 0。",
  EXCHANGE_ASSET_MATCH: "兑换必须发生在两种不同资产之间。",
  EXCHANGE_SAME_ACCOUNT: "兑换的卖出与买入账户必须不同。",
  EXTERNAL_ACCOUNT_ALREADY_MAPPED: "该 Talli 账户已用于另一个外部映射。",
  EXTERNAL_ACCOUNT_ASSET_MISMATCH: "Talli 账户资产必须与所选资产一致。",
  EXTERNAL_ACCOUNT_BOOK_MISMATCH: "Talli 账户必须属于当前外部连接的账本。",
  EXTERNAL_ACCOUNT_REQUIRED: "映射时必须选择一个 Talli 账户。",
  EXTERNAL_ASSET_REQUIRED: "映射时必须选择一个 Talli 资产。",
  EXTERNAL_ASSET_MAPPING_NOT_FOUND: "请先同步外部资产再设置映射。",
  EXTERNAL_CONNECTION_NOT_FOUND: "没有找到外部连接。",
  EVM_WALLET_DUPLICATE: "这个 Ethereum Mainnet 公共地址已经存在。",
  EVM_WALLET_NAME_REQUIRED: "钱包名称不能为空。",
  SNAPSHOT_TIME_CONFLICT: "该账户在同一时刻已经存在余额锚点。",
  TAG_ARCHIVED: "选择的标签已归档。",
  TAG_NAME_REQUIRED: "标签名称不能为空。",
  TAG_NAME_EXISTS: "同一账本中已存在同名标签。",
  TAG_NOT_FOUND: "没有找到该标签。",
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

function formInstant(
  formData: FormData,
  localName: string,
  canonicalName: string,
  label: string,
  timeZone: string,
): string {
  const local = formData.get(localName);
  if (typeof local === "string" && local.trim().length > 0) {
    return localDateTimeToUtc(local.trim(), timeZone);
  }
  return requiredFormText(formData, canonicalName, label);
}

function ledgerCommand(formData: FormData, timeZone: string) {
  const eventType = z
    .enum(["expense", "income", "transfer", "exchange"], {
      error: "请选择交易类型。",
    })
    .parse(formData.get("eventType"));
  const occurredAt = formInstant(
    formData,
    "occurredAtLocal",
    "occurredAt",
    "交易时间",
    timeZone,
  );
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
  revalidatePath("/reports");
}

function revalidateSettingsViews(): void {
  revalidateLedgerViews();
  revalidatePath("/settings");
  revalidatePath("/transactions/new");
}

function integerFormValue(formData: FormData, name: string, label: string) {
  return z.coerce
    .number({ error: `${label}必须是整数。` })
    .int(`${label}必须是整数。`)
    .parse(formData.get(name));
}

export async function initializeAppTimeZoneAction(
  timeZone: string,
): Promise<boolean> {
  const initialized = await withDatabase((context) =>
    new SettingsService(context).initializeTimeZone(timeZone),
  );
  if (initialized) {
    revalidatePath("/", "layout");
  }
  return initialized;
}

export async function createAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let accountId: string;
  try {
    accountId = await withDatabase(async (context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new AccountService(context).createAccount({
        bookId,
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
      const timeZone = new SettingsService(context).getTimeZoneOrDefault();
      const command = ledgerCommand(formData, timeZone);
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
    await withDatabase((context) => {
      const timeZone = new SettingsService(context).getTimeZoneOrDefault();
      return new ReconciliationService(context).reconcile({
        accountId,
        actualBalance: requiredFormText(formData, "actualBalance", "实际余额"),
        asOf: formInstant(
          formData,
          "occurredAtLocal",
          "occurredAt",
          "调整时间",
          timeZone,
        ),
        note: optionalFormText(formData, "note"),
      });
    });
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
    await withDatabase((context) => {
      const timeZone = new SettingsService(context).getTimeZoneOrDefault();
      return new LedgerCommandService(context).updateEvent(
        eventId,
        ledgerCommand(formData, timeZone),
      );
    });
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
    await withDatabase((context) => {
      const timeZone = new SettingsService(context).getTimeZoneOrDefault();
      return new ReconciliationService(context).reconcile({
        accountId,
        actualBalance: requiredFormText(formData, "actualBalance", "实际余额"),
        asOf: formInstant(formData, "asOfLocal", "asOf", "调整时间", timeZone),
        note: optionalFormText(formData, "note"),
      });
    });
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
    await withDatabase((context) => {
      const timeZone = new SettingsService(context).getTimeZoneOrDefault();
      return new ReconciliationService(context).update(snapshotId, {
        actualBalance: requiredFormText(formData, "actualBalance", "实际余额"),
        asOf: formInstant(formData, "asOfLocal", "asOf", "调整时间", timeZone),
        note: optionalFormText(formData, "note"),
      });
    });
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

export async function createAssetSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new ReferenceDataService(context).createAsset({
        code: requiredFormText(formData, "code", "资产代码"),
        name: requiredFormText(formData, "name", "资产名称"),
        symbol: optionalFormText(formData, "symbol"),
        assetType: z
          .enum(assetTypes, { error: "请选择资产类型。" })
          .parse(formData.get("assetType")),
        scale: integerFormValue(formData, "scale", "小数精度"),
        sortOrder: integerFormValue(formData, "sortOrder", "排序"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function updateAssetSettingsAction(
  assetId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new ReferenceDataService(context).updateAsset(assetId, {
        code: requiredFormText(formData, "code", "资产代码"),
        name: requiredFormText(formData, "name", "资产名称"),
        symbol: optionalFormText(formData, "symbol"),
        assetType: z
          .enum(assetTypes, { error: "请选择资产类型。" })
          .parse(formData.get("assetType")),
        scale: integerFormValue(formData, "scale", "小数精度"),
        sortOrder: integerFormValue(formData, "sortOrder", "排序"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function setAssetArchivedSettingsAction(
  assetId: string,
  isArchived: boolean,
): Promise<void> {
  await withDatabase((context) =>
    new ReferenceDataService(context).setAssetArchived(assetId, isArchived),
  );
  revalidateSettingsViews();
}

function categorySettingsInput(formData: FormData, bookId: string) {
  return {
    bookId,
    name: requiredFormText(formData, "name", "分类名称"),
    categoryType: z
      .enum(categoryTypes, { error: "请选择分类类型。" })
      .parse(formData.get("categoryType")),
    parentId: optionalFormText(formData, "parentId"),
    sortOrder: integerFormValue(formData, "sortOrder", "排序"),
  };
}

export async function createCategorySettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new ReferenceDataService(context).createCategory(
        categorySettingsInput(formData, bookId),
      );
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function updateCategorySettingsAction(
  categoryId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new ReferenceDataService(context).updateCategory(
        categoryId,
        categorySettingsInput(formData, bookId),
      );
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function setCategoryArchivedSettingsAction(
  categoryId: string,
  isArchived: boolean,
): Promise<void> {
  await withDatabase((context) =>
    new ReferenceDataService(context).setCategoryArchived(
      categoryId,
      isArchived,
    ),
  );
  revalidateSettingsViews();
}

export async function createTagSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new ReferenceDataService(context).createTag(
        bookId,
        requiredFormText(formData, "name", "标签名称"),
      );
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function updateTagSettingsAction(
  tagId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new ReferenceDataService(context).updateTag(
        tagId,
        requiredFormText(formData, "name", "标签名称"),
      ),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function setTagArchivedSettingsAction(
  tagId: string,
  isArchived: boolean,
): Promise<void> {
  await withDatabase((context) =>
    new ReferenceDataService(context).setTagArchived(tagId, isArchived),
  );
  revalidateSettingsViews();
}

export async function updateTimeZoneSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new SettingsService(context).setTimeZone(
        requiredFormText(formData, "timeZone", "App 时区"),
      ),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidatePath("/", "layout");
  return { error: null };
}

export async function updateHomeAssetSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new ValuationSettingsService(context).setHomeAsset(
        bookId,
        requiredFormText(formData, "homeAssetId", "Home Asset"),
      );
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function updateProviderMappingSettingsAction(
  assetId: string,
  provider: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) =>
      new ProviderMappingService(context).update({
        assetId,
        provider,
        providerAssetKey: requiredFormText(
          formData,
          "providerAssetKey",
          "Provider key",
        ),
        isEnabled: formData.get("isEnabled") === "on",
        priority: integerFormValue(formData, "priority", "优先级"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function createManualPriceSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await withDatabase((context) => {
      const timeZone = new SettingsService(context).getTimeZoneOrDefault();
      return new ManualPriceService(context).create({
        baseAssetId: requiredFormText(formData, "baseAssetId", "基础资产"),
        quoteAssetId: requiredFormText(formData, "quoteAssetId", "报价资产"),
        rateText: requiredFormText(formData, "rateText", "价格"),
        observedAt: formInstant(
          formData,
          "observedAtLocal",
          "observedAt",
          "观察时间",
          timeZone,
        ),
        note: optionalFormText(formData, "note"),
      });
    });
  } catch (error) {
    return actionError(error);
  }
  revalidateSettingsViews();
  return { error: null };
}

export async function deactivateManualPriceSettingsAction(
  id: string,
): Promise<void> {
  await withDatabase((context) =>
    new ManualPriceService(context).deactivate(id),
  );
  revalidateSettingsViews();
}

export async function createKrakenConnectionAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  try {
    await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new ExternalMappingService(context).createKrakenConnection({
        bookId,
      });
    });
  } catch (error) {
    return actionError(error);
  }
  revalidatePath("/sync");
  return { error: null };
}

export async function createEvmWalletAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void _previous;
  try {
    const name = requiredFormText(formData, "name", "钱包名称");
    const publicAddress = requiredFormText(
      formData,
      "publicAddress",
      "公共地址",
    );
    const historyStartDate = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "历史起点日期无效。")
      .parse(formData.get("historyStartDate"));
    const historyStartAt = `${historyStartDate}T00:00:00.000Z`;
    await withDatabase((context) => {
      const bookId = new ReferenceDataService(context).getDefaultBookId();
      return new EvmWalletService(context, () => {
        throw new Error("Provider is not used while creating a wallet.");
      }).createWallet({ bookId, name, publicAddress, historyStartAt });
    });
  } catch (error) {
    return actionError(error);
  }
  revalidatePath("/sync");
  return { error: null };
}

export async function updateExternalMappingAction(
  connectionId: string,
  providerAssetKey: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const mappingStatus = z
      .enum(["mapped", "unmapped", "ignored"], {
        error: "请选择映射状态。",
      })
      .parse(formData.get("mappingStatus"));
    await withDatabase((context) =>
      new ExternalMappingService(context).updateMapping({
        connectionId,
        providerAssetKey,
        mappingStatus,
        talliAssetId: optionalFormText(formData, "talliAssetId"),
        talliAccountId: optionalFormText(formData, "talliAccountId"),
      }),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidatePath("/sync");
  revalidatePath("/sync/candidates");
  return { error: null };
}
