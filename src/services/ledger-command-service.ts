import {
  buildExchangeEntries,
  buildExpenseEntries,
  buildIncomeEntries,
  buildTransferEntries,
} from "../domain/ledger";
import { parseDecimalToAtomic } from "../domain/money";
import type { EventType, LedgerEntryDraft } from "../domain/types";
import { atomicToDb } from "../db/atomic";
import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  deleteEntriesForEvent,
  deleteLedgerEvent,
  deleteTagsForEvent,
  findAccountWithAsset,
  findCategoryById,
  findExternalImportLinkByLedgerEvent,
  findLedgerEventById,
  findTagIdsForEvent,
  findTagsByIds,
  insertEventTags,
  insertLedgerEntries,
  insertLedgerEvent,
  updateLedgerEvent,
} from "../db/queries";
import { assertService, ServiceError } from "./errors";
import type {
  ExchangeInput,
  ExpenseInput,
  IncomeInput,
  LedgerMutationInput,
  OptionalFeeInput,
  TransferInput,
} from "./contracts";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { canonicalTimestamp, optionalText, uniqueTagIds } from "./validation";

interface PreparedCommand {
  bookId: string;
  eventType: EventType;
  occurredAt: string;
  categoryId: string | null;
  payee: string | null;
  note: string | null;
  tagIds: string[];
  entries: LedgerEntryDraft[];
}

interface ExistingArchivedReferences {
  categoryId?: string | null;
  tagIds?: readonly string[];
}

type AccountWithAsset = NonNullable<ReturnType<typeof findAccountWithAsset>>;

function requireAccount(
  executor: DatabaseExecutor,
  accountId: string,
): AccountWithAsset {
  const value = findAccountWithAsset(executor, accountId);
  if (!value) {
    throw new ServiceError(
      "ACCOUNT_NOT_FOUND",
      `Account ${accountId} was not found.`,
    );
  }
  assertService(
    !value.account.isArchived,
    "ACCOUNT_ARCHIVED",
    "Archived accounts cannot be used.",
  );
  assertService(
    !value.asset.isArchived,
    "ASSET_ARCHIVED",
    "Archived assets cannot be used for new ledger facts.",
  );
  return value;
}

function accountRef(value: AccountWithAsset) {
  return { id: value.account.id, assetId: value.account.assetId };
}

function requireSameBook(
  bookId: string,
  values: readonly AccountWithAsset[],
): void {
  assertService(
    values.every((value) => value.account.bookId === bookId),
    "CROSS_BOOK_EVENT",
    "All event accounts, including the fee account, must belong to one book.",
  );
}

function prepareFee(
  executor: DatabaseExecutor,
  fee: OptionalFeeInput | null | undefined,
): { account: AccountWithAsset; amountAtomic: bigint } | null {
  if (!fee) {
    return null;
  }
  const account = requireAccount(executor, fee.accountId);
  return {
    account,
    amountAtomic: parseDecimalToAtomic(fee.amount, account.asset.scale),
  };
}

function validateCategory(
  executor: DatabaseExecutor,
  categoryId: string | null,
  bookId: string,
  eventType: "expense" | "income",
  existingCategoryId?: string | null,
): void {
  if (!categoryId) {
    return;
  }

  const category = findCategoryById(executor, categoryId);
  assertService(
    category,
    "CATEGORY_NOT_FOUND",
    `Category ${categoryId} was not found.`,
  );
  assertService(
    category.bookId === bookId,
    "CROSS_BOOK_CATEGORY",
    "Category belongs to another book.",
  );
  assertService(
    !category.isArchived || category.id === existingCategoryId,
    "CATEGORY_ARCHIVED",
    "Archived category cannot be selected.",
  );
  assertService(
    category.categoryType === "both" || category.categoryType === eventType,
    "CATEGORY_TYPE_MISMATCH",
    `Category cannot be used for ${eventType}.`,
  );
}

function validateTags(
  executor: DatabaseExecutor,
  tagIds: readonly string[],
  bookId: string,
  existingTagIds: readonly string[] = [],
): void {
  const tagRows = findTagsByIds(executor, tagIds);
  assertService(
    tagRows.length === tagIds.length,
    "TAG_NOT_FOUND",
    "One or more tags were not found.",
  );
  assertService(
    tagRows.every((tag) => tag.bookId === bookId),
    "CROSS_BOOK_TAG",
    "All tags must belong to the event book.",
  );
  assertService(
    tagRows.every((tag) => !tag.isArchived || existingTagIds.includes(tag.id)),
    "TAG_ARCHIVED",
    "Archived tags cannot be selected.",
  );
}

function commonInput(input: {
  occurredAt: string;
  note?: string | null;
  tagIds?: string[];
}) {
  return {
    occurredAt: canonicalTimestamp(input.occurredAt),
    note: optionalText(input.note),
    tagIds: uniqueTagIds(input.tagIds),
  };
}

function prepareExpenseOrIncome(
  executor: DatabaseExecutor,
  eventType: "expense" | "income",
  input: ExpenseInput | IncomeInput,
  existing: ExistingArchivedReferences,
): PreparedCommand {
  const account = requireAccount(executor, input.accountId);
  const amountAtomic = parseDecimalToAtomic(input.amount, account.asset.scale);
  const categoryId = input.categoryId ?? null;
  const common = commonInput(input);

  validateCategory(
    executor,
    categoryId,
    account.account.bookId,
    eventType,
    existing.categoryId,
  );
  validateTags(
    executor,
    common.tagIds,
    account.account.bookId,
    existing.tagIds,
  );

  return {
    bookId: account.account.bookId,
    eventType,
    occurredAt: common.occurredAt,
    categoryId,
    payee: optionalText(input.payee),
    note: common.note,
    tagIds: common.tagIds,
    entries:
      eventType === "expense"
        ? buildExpenseEntries({ account: accountRef(account), amountAtomic })
        : buildIncomeEntries({ account: accountRef(account), amountAtomic }),
  };
}

function prepareTransfer(
  executor: DatabaseExecutor,
  input: TransferInput,
  existing: ExistingArchivedReferences,
): PreparedCommand {
  const source = requireAccount(executor, input.sourceAccountId);
  const destination = requireAccount(executor, input.destinationAccountId);
  const fee = prepareFee(executor, input.fee);
  const accounts = fee
    ? [source, destination, fee.account]
    : [source, destination];
  requireSameBook(source.account.bookId, accounts);

  const common = commonInput(input);
  validateTags(executor, common.tagIds, source.account.bookId, existing.tagIds);

  return {
    bookId: source.account.bookId,
    eventType: "transfer",
    occurredAt: common.occurredAt,
    categoryId: null,
    payee: null,
    note: common.note,
    tagIds: common.tagIds,
    entries: buildTransferEntries({
      sourceAccount: accountRef(source),
      destinationAccount: accountRef(destination),
      amountAtomic: parseDecimalToAtomic(input.amount, source.asset.scale),
      fee: fee
        ? { account: accountRef(fee.account), amountAtomic: fee.amountAtomic }
        : null,
    }),
  };
}

function prepareExchange(
  executor: DatabaseExecutor,
  input: ExchangeInput,
  existing: ExistingArchivedReferences,
): PreparedCommand {
  const source = requireAccount(executor, input.sourceAccountId);
  const destination = requireAccount(executor, input.destinationAccountId);
  const fee = prepareFee(executor, input.fee);
  const accounts = fee
    ? [source, destination, fee.account]
    : [source, destination];
  requireSameBook(source.account.bookId, accounts);

  const common = commonInput(input);
  validateTags(executor, common.tagIds, source.account.bookId, existing.tagIds);

  return {
    bookId: source.account.bookId,
    eventType: "exchange",
    occurredAt: common.occurredAt,
    categoryId: null,
    payee: null,
    note: common.note,
    tagIds: common.tagIds,
    entries: buildExchangeEntries({
      sourceAccount: accountRef(source),
      sourceAmountAtomic: parseDecimalToAtomic(
        input.sourceAmount,
        source.asset.scale,
      ),
      destinationAccount: accountRef(destination),
      destinationAmountAtomic: parseDecimalToAtomic(
        input.destinationAmount,
        destination.asset.scale,
      ),
      fee: fee
        ? { account: accountRef(fee.account), amountAtomic: fee.amountAtomic }
        : null,
    }),
  };
}

function prepareCommand(
  executor: DatabaseExecutor,
  command: LedgerMutationInput,
  existing: ExistingArchivedReferences = {},
): PreparedCommand {
  switch (command.eventType) {
    case "expense":
    case "income":
      return prepareExpenseOrIncome(
        executor,
        command.eventType,
        command.input,
        existing,
      );
    case "transfer":
      return prepareTransfer(executor, command.input, existing);
    case "exchange":
      return prepareExchange(executor, command.input, existing);
  }
}

function writeRelations(
  executor: DatabaseExecutor,
  runtime: ServiceRuntime,
  eventId: string,
  prepared: PreparedCommand,
  createdAt: string,
): void {
  insertLedgerEntries(
    executor,
    prepared.entries.map((entry) => ({
      id: runtime.id(),
      eventId,
      accountId: entry.accountId,
      entryRole: entry.role,
      amountAtomic: atomicToDb(entry.amountAtomic),
      createdAt,
    })),
  );
  insertEventTags(
    executor,
    prepared.tagIds.map((tagId) => ({ eventId, tagId })),
  );
}

export function createLedgerEventIn(
  executor: DatabaseExecutor,
  runtime: ServiceRuntime,
  command: LedgerMutationInput,
): string {
  const prepared = prepareCommand(executor, command);
  const eventId = runtime.id();
  const now = runtimeNow(runtime);

  insertLedgerEvent(executor, {
    id: eventId,
    bookId: prepared.bookId,
    eventType: prepared.eventType,
    occurredAt: prepared.occurredAt,
    categoryId: prepared.categoryId,
    payee: prepared.payee,
    note: prepared.note,
    createdAt: now,
    updatedAt: now,
  });
  writeRelations(executor, runtime, eventId, prepared, now);
  return eventId;
}

export class LedgerCommandService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async createExpense(input: ExpenseInput): Promise<string> {
    return this.create({ eventType: "expense", input });
  }

  async createIncome(input: IncomeInput): Promise<string> {
    return this.create({ eventType: "income", input });
  }

  async createTransfer(input: TransferInput): Promise<string> {
    return this.create({ eventType: "transfer", input });
  }

  async createExchange(input: ExchangeInput): Promise<string> {
    return this.create({ eventType: "exchange", input });
  }

  async updateEvent(
    eventId: string,
    command: LedgerMutationInput,
  ): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        const existing = findLedgerEventById(transaction, eventId);
        if (!existing) {
          throw new ServiceError(
            "EVENT_NOT_FOUND",
            `Event ${eventId} was not found.`,
          );
        }

        const prepared = prepareCommand(transaction, command, {
          categoryId: existing.categoryId,
          tagIds: findTagIdsForEvent(transaction, eventId),
        });
        assertService(
          prepared.bookId === existing.bookId,
          "EVENT_BOOK_CHANGE",
          "An event cannot be moved to another book.",
        );

        const now = runtimeNow(this.runtime);
        updateLedgerEvent(transaction, eventId, {
          eventType: prepared.eventType,
          occurredAt: prepared.occurredAt,
          categoryId: prepared.categoryId,
          payee: prepared.payee,
          note: prepared.note,
          updatedAt: now,
        });
        deleteEntriesForEvent(transaction, eventId);
        deleteTagsForEvent(transaction, eventId);
        writeRelations(transaction, this.runtime, eventId, prepared, now);
      },
      { behavior: "immediate" },
    );
  }

  async deleteEvent(eventId: string): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        if (!findLedgerEventById(transaction, eventId)) {
          throw new ServiceError(
            "EVENT_NOT_FOUND",
            `Event ${eventId} was not found.`,
          );
        }
        assertService(
          !findExternalImportLinkByLedgerEvent(transaction, eventId),
          "IMPORTED_EVENT_DELETE_FORBIDDEN",
          "Imported events retain provenance and cannot be deleted in V3.",
        );
        deleteLedgerEvent(transaction, eventId);
      },
      { behavior: "immediate" },
    );
  }

  private create(command: LedgerMutationInput): string {
    return this.context.db.transaction(
      (transaction) => createLedgerEventIn(transaction, this.runtime, command),
      { behavior: "immediate" },
    );
  }
}
