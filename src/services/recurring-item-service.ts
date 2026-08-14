import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  deleteRecurringOccurrenceLink,
  deleteRecurringOccurrenceSkip,
  findAccountWithAsset,
  findBookById,
  findCategoryById,
  findEntriesForEvent,
  findLedgerEventById,
  findRecurringItemRow,
  findRecurringOccurrenceLink,
  findRecurringOccurrenceLinkByLedgerEvent,
  findRecurringOccurrenceSkip,
  findTagsByIds,
  insertRecurringItem,
  insertRecurringOccurrenceLink,
  insertRecurringOccurrenceSkip,
  listRecurringItemRowsForBook,
  listRecurringItemTagIds,
  listRecurringOccurrenceLinks,
  listRecurringOccurrenceSkips,
  replaceRecurringItemTags,
  updateRecurringItem,
} from "../db/queries";
import { parseDecimalToAtomic } from "../domain/money";
import {
  generateOccurrenceDates,
  isGeneratedOccurrence,
  parsePositiveAtomicText,
  recurringOccurrenceStatus,
  validateRecurringItem,
  type GeneratedOccurrence,
  type MonthlyDayMode,
  type RecurringAmountMode,
  type RecurringEventType,
  type RecurringFrequency,
  type RecurringItem,
  type RecurringPayeeMatchMode,
} from "../domain/recurring";
import type { LedgerMutationInput } from "./contracts";
import { assertService } from "./errors";
import { createLedgerEventIn } from "./ledger-command-service";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { optionalText, requiredText, uniqueTagIds } from "./validation";

export interface RecurringItemDraft {
  id?: string;
  bookId: string;
  accountId: string;
  name: string;
  eventType: RecurringEventType;
  payeeText?: string | null;
  payeeMatchMode: RecurringPayeeMatchMode;
  categoryId?: string | null;
  tagIds?: string[];
  note?: string | null;
  amountMode: RecurringAmountMode;
  amount?: string | null;
  toleranceBps?: number | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  anchorDate: string;
  monthlyDayMode?: MonthlyDayMode | null;
  dateWindowBeforeDays: number;
  dateWindowAfterDays: number;
  startsOn?: string | null;
  endsOn?: string | null;
  isActive: boolean;
}

function hydrateRecurringItem(
  executor: DatabaseExecutor,
  recurringItemId: string,
): RecurringItem | null {
  const row = findRecurringItemRow(executor, recurringItemId);
  if (!row) return null;
  const item: RecurringItem = {
    id: row.id,
    bookId: row.bookId,
    accountId: row.accountId,
    assetId: row.assetId,
    name: row.name,
    eventType: row.eventType,
    payeeText: row.payeeText,
    payeeMatchMode: row.payeeMatchMode,
    categoryId: row.categoryId,
    tagIds: listRecurringItemTagIds(executor, row.id),
    note: row.note,
    amountMode: row.amountMode,
    amountAtomic:
      row.amountAtomicText === null
        ? null
        : parsePositiveAtomicText(row.amountAtomicText),
    toleranceBps: row.toleranceBps,
    minAmountAtomic:
      row.minAmountAtomicText === null
        ? null
        : parsePositiveAtomicText(row.minAmountAtomicText),
    maxAmountAtomic:
      row.maxAmountAtomicText === null
        ? null
        : parsePositiveAtomicText(row.maxAmountAtomicText),
    frequency: row.frequency,
    intervalCount: row.intervalCount,
    anchorDate: row.anchorDate,
    monthlyDayMode: row.monthlyDayMode,
    dateWindowBeforeDays: row.dateWindowBeforeDays,
    dateWindowAfterDays: row.dateWindowAfterDays,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    isActive: row.isActive,
  };
  validateRecurringItem(item);
  return item;
}

export function requireRecurringItem(
  executor: DatabaseExecutor,
  recurringItemId: string,
): RecurringItem {
  const item = hydrateRecurringItem(executor, recurringItemId);
  assertService(
    item,
    "RECURRING_ITEM_NOT_FOUND",
    "Recurring item was not found.",
  );
  return item;
}

function exactPositiveAmount(
  value: string | null | undefined,
  scale: number,
  label: string,
): bigint {
  const atomic = parseDecimalToAtomic(requiredText(value ?? "", label), scale);
  assertService(
    atomic > 0n,
    "RECURRING_AMOUNT_INVALID",
    `${label} must be positive.`,
  );
  return atomic;
}

function normalizeDraft(
  executor: DatabaseExecutor,
  draft: RecurringItemDraft,
): RecurringItem {
  assertService(
    findBookById(executor, draft.bookId),
    "BOOK_NOT_FOUND",
    "Recurring item book was not found.",
  );
  const account = findAccountWithAsset(executor, draft.accountId);
  assertService(
    account &&
      account.account.bookId === draft.bookId &&
      !account.account.isArchived &&
      !account.asset.isArchived,
    "RECURRING_ACCOUNT_INVALID",
    "Recurring account and asset must be active and in the same book.",
  );
  const tagIds = uniqueTagIds(draft.tagIds);
  const tagRows = findTagsByIds(executor, tagIds);
  assertService(
    tagRows.length === tagIds.length &&
      tagRows.every((tag) => tag.bookId === draft.bookId && !tag.isArchived),
    "RECURRING_TAG_INVALID",
    "Recurring tags must be active and in the same book.",
  );
  const categoryId = draft.categoryId ?? null;
  if (categoryId) {
    const category = findCategoryById(executor, categoryId);
    assertService(
      category &&
        category.bookId === draft.bookId &&
        !category.isArchived &&
        (category.categoryType === "both" ||
          category.categoryType === draft.eventType),
      "RECURRING_CATEGORY_INVALID",
      "Recurring category must be active, same-book, and event-type compatible.",
    );
  }
  let amountAtomic: bigint | null = null;
  let toleranceBps: number | null = null;
  let minAmountAtomic: bigint | null = null;
  let maxAmountAtomic: bigint | null = null;
  if (draft.amountMode === "exact" || draft.amountMode === "approx") {
    amountAtomic = exactPositiveAmount(
      draft.amount,
      account.asset.scale,
      "Expected amount",
    );
    toleranceBps =
      draft.amountMode === "approx" ? (draft.toleranceBps ?? null) : null;
  } else {
    minAmountAtomic = exactPositiveAmount(
      draft.minAmount,
      account.asset.scale,
      "Minimum expected amount",
    );
    maxAmountAtomic = exactPositiveAmount(
      draft.maxAmount,
      account.asset.scale,
      "Maximum expected amount",
    );
  }
  const item: RecurringItem = {
    id: draft.id ?? "draft-recurring-item",
    bookId: draft.bookId,
    accountId: account.account.id,
    assetId: account.asset.id,
    name: requiredText(draft.name, "Recurring item name"),
    eventType: draft.eventType,
    payeeText: optionalText(draft.payeeText),
    payeeMatchMode: draft.payeeMatchMode,
    categoryId,
    tagIds,
    note: optionalText(draft.note),
    amountMode: draft.amountMode,
    amountAtomic,
    toleranceBps,
    minAmountAtomic,
    maxAmountAtomic,
    frequency: draft.frequency,
    intervalCount: draft.intervalCount,
    anchorDate: draft.anchorDate,
    monthlyDayMode:
      draft.frequency === "monthly" ? (draft.monthlyDayMode ?? "fixed") : null,
    dateWindowBeforeDays: draft.dateWindowBeforeDays,
    dateWindowAfterDays: draft.dateWindowAfterDays,
    startsOn: optionalText(draft.startsOn),
    endsOn: optionalText(draft.endsOn),
    isActive: draft.isActive,
  };
  validateRecurringItem(item);
  assertService(
    item.name.length <= 120 &&
      (item.payeeText?.length ?? 0) <= 200 &&
      (item.note?.length ?? 0) <= 2000,
    "RECURRING_TEXT_TOO_LONG",
    "Recurring name, payee, or note exceeds its allowed length.",
  );
  return item;
}

function occurrencePatternIncludes(
  item: RecurringItem,
  occurrenceDate: string,
): boolean {
  return isGeneratedOccurrence({ ...item, isActive: true }, occurrenceDate);
}

function requireOpenOccurrence(
  executor: DatabaseExecutor,
  item: RecurringItem,
  occurrenceDate: string,
): void {
  assertService(
    item.isActive,
    "RECURRING_ITEM_INACTIVE",
    "Archived recurring items cannot receive new occurrence facts.",
  );
  assertService(
    occurrencePatternIncludes(item, occurrenceDate),
    "RECURRING_OCCURRENCE_INVALID",
    "Occurrence date is not generated by this recurring item.",
  );
  assertService(
    !findRecurringOccurrenceLink(executor, item.id, occurrenceDate),
    "RECURRING_OCCURRENCE_ALREADY_LINKED",
    "Occurrence is already linked.",
  );
  assertService(
    !findRecurringOccurrenceSkip(executor, item.id, occurrenceDate),
    "RECURRING_OCCURRENCE_SKIPPED",
    "Unskip this occurrence before linking or posting it.",
  );
}

function validateLedgerEventForItem(
  executor: DatabaseExecutor,
  item: RecurringItem,
  ledgerEventId: string,
): void {
  const event = findLedgerEventById(executor, ledgerEventId);
  assertService(
    event && event.bookId === item.bookId && event.eventType === item.eventType,
    "RECURRING_LEDGER_EVENT_INVALID",
    "Ledger event must be a same-book Expense or Income matching the recurring item.",
  );
  const entries = findEntriesForEvent(executor, ledgerEventId);
  const main = entries.filter((entry) => entry.entryRole === "main");
  assertService(
    main.length === 1 && main[0]!.accountId === item.accountId,
    "RECURRING_LEDGER_ACCOUNT_INVALID",
    "Ledger event main entry must use the recurring account.",
  );
  const amount = BigInt(main[0]!.amountAtomic);
  assertService(
    item.eventType === "expense" ? amount < 0n : amount > 0n,
    "RECURRING_LEDGER_DIRECTION_INVALID",
    "Ledger event direction does not match the recurring item.",
  );
  assertService(
    !findRecurringOccurrenceLinkByLedgerEvent(executor, ledgerEventId),
    "RECURRING_LEDGER_EVENT_ALREADY_LINKED",
    "One Ledger event cannot satisfy multiple recurring occurrences.",
  );
}

export function insertConfirmedRecurringLink(
  executor: DatabaseExecutor,
  runtime: ServiceRuntime,
  input: {
    recurringItemId: string;
    occurrenceDate: string;
    ledgerEventId: string;
  },
): void {
  const item = requireRecurringItem(executor, input.recurringItemId);
  requireOpenOccurrence(executor, item, input.occurrenceDate);
  validateLedgerEventForItem(executor, item, input.ledgerEventId);
  insertRecurringOccurrenceLink(executor, {
    recurringItemId: item.id,
    occurrenceDate: input.occurrenceDate,
    ledgerEventId: input.ledgerEventId,
    linkedAt: runtimeNow(runtime),
  });
}

export class RecurringItemService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  get(recurringItemId: string): RecurringItem | null {
    return hydrateRecurringItem(this.context.db, recurringItemId);
  }

  list(bookId: string): RecurringItem[] {
    return listRecurringItemRowsForBook(this.context.db, bookId).map((row) =>
      hydrateRecurringItem(this.context.db, row.id)!,
    );
  }

  save(draft: RecurringItemDraft): string {
    return this.context.db.transaction(
      (transaction) => {
        const normalized = normalizeDraft(transaction, draft);
        const existing = draft.id
          ? requireRecurringItem(transaction, draft.id)
          : null;
        if (existing) {
          assertService(
            existing.bookId === normalized.bookId,
            "RECURRING_BOOK_CHANGE_FORBIDDEN",
            "Recurring item cannot move to another book.",
          );
          const links = listRecurringOccurrenceLinks(transaction, existing.id);
          const skips = listRecurringOccurrenceSkips(transaction, existing.id);
          assertService(
            (links.length === 0 && skips.length === 0) ||
              (existing.accountId === normalized.accountId &&
                existing.assetId === normalized.assetId),
            "RECURRING_ACCOUNT_CHANGE_FORBIDDEN",
            "Recurring account cannot change after linked or skipped history exists.",
          );
          for (const fact of [...links, ...skips]) {
            assertService(
              occurrencePatternIncludes(normalized, fact.occurrenceDate),
              "RECURRING_HISTORY_INVALIDATED",
              "Edit would invalidate an existing linked or skipped occurrence.",
            );
          }
        }
        const itemId = existing?.id ?? this.runtime.id();
        const now = runtimeNow(this.runtime);
        const row = {
          bookId: normalized.bookId,
          accountId: normalized.accountId,
          assetId: normalized.assetId,
          name: normalized.name,
          eventType: normalized.eventType,
          payeeText: normalized.payeeText,
          payeeMatchMode: normalized.payeeMatchMode,
          categoryId: normalized.categoryId,
          note: normalized.note,
          amountMode: normalized.amountMode,
          amountAtomicText: normalized.amountAtomic?.toString() ?? null,
          toleranceBps: normalized.toleranceBps,
          minAmountAtomicText: normalized.minAmountAtomic?.toString() ?? null,
          maxAmountAtomicText: normalized.maxAmountAtomic?.toString() ?? null,
          frequency: normalized.frequency,
          intervalCount: normalized.intervalCount,
          anchorDate: normalized.anchorDate,
          monthlyDayMode: normalized.monthlyDayMode,
          dateWindowBeforeDays: normalized.dateWindowBeforeDays,
          dateWindowAfterDays: normalized.dateWindowAfterDays,
          startsOn: normalized.startsOn,
          endsOn: normalized.endsOn,
          isActive: normalized.isActive,
          updatedAt: now,
        };
        if (existing) {
          updateRecurringItem(transaction, itemId, row);
        } else {
          insertRecurringItem(transaction, {
            id: itemId,
            ...row,
            createdAt: now,
          });
        }
        replaceRecurringItemTags(transaction, itemId, normalized.tagIds);
        return itemId;
      },
      { behavior: "immediate" },
    );
  }

  setActive(recurringItemId: string, isActive: boolean): void {
    this.context.db.transaction(
      (transaction) => {
        requireRecurringItem(transaction, recurringItemId);
        updateRecurringItem(transaction, recurringItemId, {
          isActive,
          updatedAt: runtimeNow(this.runtime),
        });
      },
      { behavior: "immediate" },
    );
  }

  occurrences(input: {
    recurringItemId: string;
    fromDate: string;
    toDate: string;
    currentLocalDate: string;
  }): GeneratedOccurrence[] {
    const item = requireRecurringItem(this.context.db, input.recurringItemId);
    const links = new Map(
      listRecurringOccurrenceLinks(this.context.db, item.id).map((link) => [
        link.occurrenceDate,
        link.ledgerEventId,
      ]),
    );
    const skips = new Set(
      listRecurringOccurrenceSkips(this.context.db, item.id).map(
        (skip) => skip.occurrenceDate,
      ),
    );
    return generateOccurrenceDates(
      { ...item, isActive: true },
      input.fromDate,
      input.toDate,
    ).map((occurrenceDate) => {
      const linkedLedgerEventId = links.get(occurrenceDate) ?? null;
      return {
        recurringItemId: item.id,
        occurrenceDate,
        status: recurringOccurrenceStatus({
          occurrenceDate,
          currentLocalDate: input.currentLocalDate,
          afterWindowDays: item.dateWindowAfterDays,
          linkedLedgerEventId,
          skipped: skips.has(occurrenceDate),
        }),
        linkedLedgerEventId,
      };
    });
  }

  linkExisting(input: {
    recurringItemId: string;
    occurrenceDate: string;
    ledgerEventId: string;
    confirmed: true;
  }): void {
    assertService(
      input.confirmed === true,
      "RECURRING_CONFIRMATION_REQUIRED",
      "Recurring link requires explicit confirmation.",
    );
    this.context.db.transaction(
      (transaction) =>
        insertConfirmedRecurringLink(transaction, this.runtime, input),
      { behavior: "immediate" },
    );
  }

  unlink(input: { recurringItemId: string; occurrenceDate: string }): void {
    this.context.db.transaction(
      (transaction) => {
        assertService(
          findRecurringOccurrenceLink(
            transaction,
            input.recurringItemId,
            input.occurrenceDate,
          ),
          "RECURRING_LINK_NOT_FOUND",
          "Recurring occurrence link was not found.",
        );
        deleteRecurringOccurrenceLink(
          transaction,
          input.recurringItemId,
          input.occurrenceDate,
        );
      },
      { behavior: "immediate" },
    );
  }

  skip(input: {
    recurringItemId: string;
    occurrenceDate: string;
    note?: string | null;
  }): void {
    this.context.db.transaction(
      (transaction) => {
        const item = requireRecurringItem(transaction, input.recurringItemId);
        requireOpenOccurrence(transaction, item, input.occurrenceDate);
        const note = optionalText(input.note);
        assertService(
          (note?.length ?? 0) <= 2000,
          "RECURRING_SKIP_NOTE_TOO_LONG",
          "Recurring skip note cannot exceed 2000 characters.",
        );
        insertRecurringOccurrenceSkip(transaction, {
          recurringItemId: item.id,
          occurrenceDate: input.occurrenceDate,
          skippedAt: runtimeNow(this.runtime),
          note,
        });
      },
      { behavior: "immediate" },
    );
  }

  unskip(input: { recurringItemId: string; occurrenceDate: string }): void {
    this.context.db.transaction(
      (transaction) => {
        assertService(
          findRecurringOccurrenceSkip(
            transaction,
            input.recurringItemId,
            input.occurrenceDate,
          ),
          "RECURRING_SKIP_NOT_FOUND",
          "Recurring occurrence skip was not found.",
        );
        deleteRecurringOccurrenceSkip(
          transaction,
          input.recurringItemId,
          input.occurrenceDate,
        );
      },
      { behavior: "immediate" },
    );
  }

  postOccurrence(input: {
    recurringItemId: string;
    occurrenceDate: string;
    actualAmount: string;
    occurredAt: string;
    payee?: string | null;
    categoryId?: string | null;
    tagIds?: string[];
    note?: string | null;
    confirmed: true;
  }): string {
    assertService(
      input.confirmed === true,
      "RECURRING_CONFIRMATION_REQUIRED",
      "Posting an occurrence requires explicit confirmation.",
    );
    return this.context.db.transaction(
      (transaction) => {
        const item = requireRecurringItem(transaction, input.recurringItemId);
        requireOpenOccurrence(transaction, item, input.occurrenceDate);
        const account = findAccountWithAsset(transaction, item.accountId)!;
        exactPositiveAmount(
          input.actualAmount,
          account.asset.scale,
          "Actual amount",
        );
        const command: LedgerMutationInput = {
          eventType: item.eventType,
          input: {
            accountId: item.accountId,
            amount: input.actualAmount,
            occurredAt: input.occurredAt,
            payee: input.payee === undefined ? item.payeeText : input.payee,
            categoryId:
              input.categoryId === undefined
                ? item.categoryId
                : input.categoryId,
            tagIds: input.tagIds ?? item.tagIds,
            note: input.note === undefined ? item.note : input.note,
          },
        };
        const ledgerEventId = createLedgerEventIn(
          transaction,
          this.runtime,
          command,
        );
        insertConfirmedRecurringLink(transaction, this.runtime, {
          recurringItemId: item.id,
          occurrenceDate: input.occurrenceDate,
          ledgerEventId,
        });
        return ledgerEventId;
      },
      { behavior: "immediate" },
    );
  }
}
