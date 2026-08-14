import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import { atomicFromDb } from "../db/atomic";
import {
  deleteRecurringOccurrenceLink,
  deleteRecurringOccurrenceSkip,
  findAccountWithAsset,
  findBookById,
  findCategoryById,
  findEntriesForEvent,
  findLedgerEventById,
  findRecurringOccurrenceLink,
  findRecurringOccurrenceLinkByLedgerEvent,
  findRecurringOccurrenceSkip,
  findTagsByIds,
  insertRecurringItem,
  insertRecurringOccurrenceLink,
  insertRecurringOccurrenceSkip,
  listRecurringItemRowsForBook,
  listRecurringOccurrenceLinks,
  listRecurringOccurrenceSkips,
  replaceRecurringItemTags,
  updateRecurringItem,
} from "../db/queries";
import { parseDecimalToAtomic } from "../domain/money";
import {
  generateOccurrenceDates,
  isGeneratedOccurrence,
  recurringOccurrenceStatus,
  validateRecurringLinkCompatibility,
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
import {
  hydrateRecurringItem,
  requireRecurringItem,
} from "./recurring-item-reader";

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

function assertRecurringActivationReferences(
  executor: DatabaseExecutor,
  item: RecurringItem,
): void {
  validateRecurringItem({ ...item, isActive: true });
  assertService(
    findBookById(executor, item.bookId),
    "BOOK_NOT_FOUND",
    "Recurring item book was not found.",
  );
  const account = findAccountWithAsset(executor, item.accountId);
  assertService(
    account &&
      account.account.bookId === item.bookId &&
      account.asset.id === item.assetId &&
      !account.account.isArchived &&
      !account.asset.isArchived,
    "RECURRING_ACCOUNT_INVALID",
    "Active recurring items require an active same-book account and asset.",
  );
  if (item.categoryId) {
    const category = findCategoryById(executor, item.categoryId);
    assertService(
      category &&
        category.bookId === item.bookId &&
        !category.isArchived &&
        (category.categoryType === "both" ||
          category.categoryType === item.eventType),
      "RECURRING_CATEGORY_INVALID",
      "Active recurring items require an active, same-book, event-type compatible category.",
    );
  }
  const tags = findTagsByIds(executor, item.tagIds);
  assertService(
    tags.length === item.tagIds.length &&
      tags.every((tag) => tag.bookId === item.bookId && !tag.isArchived),
    "RECURRING_TAG_INVALID",
    "Active recurring items require active tags from the same book.",
  );
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
    account && account.account.bookId === draft.bookId,
    "RECURRING_ACCOUNT_INVALID",
    "Recurring account and asset must exist in the same book.",
  );
  const tagIds = uniqueTagIds(draft.tagIds);
  const tagRows = findTagsByIds(executor, tagIds);
  assertService(
    tagRows.length === tagIds.length &&
      tagRows.every((tag) => tag.bookId === draft.bookId),
    "RECURRING_TAG_INVALID",
    "Recurring tags must exist in the same book.",
  );
  const categoryId = draft.categoryId ?? null;
  if (categoryId) {
    const category = findCategoryById(executor, categoryId);
    assertService(
      category &&
        category.bookId === draft.bookId &&
        (category.categoryType === "both" ||
          category.categoryType === draft.eventType),
      "RECURRING_CATEGORY_INVALID",
      "Recurring category must exist, be same-book, and event-type compatible.",
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
  if (item.isActive) {
    assertRecurringActivationReferences(executor, item);
  }
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
  occurrenceDate: string,
): void {
  const event = findLedgerEventById(executor, ledgerEventId);
  const result = validateRecurringLinkCompatibility({
    item,
    occurrenceDate,
    event: event
      ? {
          bookId: event.bookId,
          eventType: event.eventType,
          entries: findEntriesForEvent(executor, ledgerEventId).map(
            (entry) => ({
              accountId: entry.accountId,
              role: entry.entryRole,
              amountAtomic: atomicFromDb(entry.amountAtomic),
            }),
          ),
        }
      : null,
  });
  if (!result.ok) {
    assertService(
      result.reason !== "main_account_mismatch" &&
        result.reason !== "main_entry_cardinality",
      "RECURRING_LEDGER_ACCOUNT_INVALID",
      "Ledger event main entry must use the recurring account.",
    );
    assertService(
      result.reason !== "direction_mismatch",
      "RECURRING_LEDGER_DIRECTION_INVALID",
      "Ledger event direction does not match the recurring item.",
    );
    assertService(
      false,
      "RECURRING_LEDGER_EVENT_INVALID",
      "Ledger event must be a compatible same-book Expense or Income occurrence.",
    );
  }
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
  validateLedgerEventForItem(
    executor,
    item,
    input.ledgerEventId,
    input.occurrenceDate,
  );
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
        const existing = draft.id
          ? requireRecurringItem(transaction, draft.id)
          : null;
        const links = existing
          ? listRecurringOccurrenceLinks(transaction, existing.id)
          : [];
        const skips = existing
          ? listRecurringOccurrenceSkips(transaction, existing.id)
          : [];
        if (existing) {
          assertService(
            links.length === 0 || existing.eventType === draft.eventType,
            "RECURRING_EVENT_TYPE_CHANGE_FORBIDDEN",
            "Recurring event type cannot change after a Ledger occurrence is linked.",
          );
        }
        const normalized = normalizeDraft(transaction, draft);
        if (existing) {
          assertService(
            existing.bookId === normalized.bookId,
            "RECURRING_BOOK_CHANGE_FORBIDDEN",
            "Recurring item cannot move to another book.",
          );
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
        const item = requireRecurringItem(transaction, recurringItemId);
        if (isActive) {
          assertRecurringActivationReferences(transaction, {
            ...item,
            isActive: true,
          });
        }
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
