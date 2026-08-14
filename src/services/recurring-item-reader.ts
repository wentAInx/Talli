import type { DatabaseExecutor } from "../db/connection";
import { findRecurringItemRow, listRecurringItemTagIds } from "../db/queries";
import {
  parsePositiveAtomicText,
  validateRecurringItem,
  type RecurringItem,
} from "../domain/recurring";
import { assertService } from "./errors";

export function hydrateRecurringItem(
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
