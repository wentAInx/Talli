import { asc, desc, eq, inArray } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import {
  accounts,
  assets,
  balanceSnapshots,
  categories,
  ledgerEntries,
  ledgerEvents,
} from "../schema";

export function listAccountReadRows(
  executor: DatabaseExecutor,
  bookId: string,
) {
  return executor
    .select({
      id: accounts.id,
      bookId: accounts.bookId,
      assetId: accounts.assetId,
      name: accounts.name,
      accountType: accounts.accountType,
      institutionName: accounts.institutionName,
      note: accounts.note,
      isArchived: accounts.isArchived,
      assetCode: assets.code,
      assetName: assets.name,
      assetSymbol: assets.symbol,
      assetType: assets.assetType,
      assetScale: assets.scale,
      assetIsArchived: assets.isArchived,
      assetSortOrder: assets.sortOrder,
    })
    .from(accounts)
    .innerJoin(assets, eq(accounts.assetId, assets.id))
    .where(eq(accounts.bookId, bookId))
    .orderBy(
      asc(assets.sortOrder),
      asc(assets.code),
      asc(accounts.sortOrder),
      asc(accounts.name),
      asc(accounts.id),
    )
    .all();
}

export function listEventHeaderRows(
  executor: DatabaseExecutor,
  bookId: string,
  limit: number,
) {
  return executor
    .select({
      id: ledgerEvents.id,
      eventType: ledgerEvents.eventType,
      occurredAt: ledgerEvents.occurredAt,
      categoryId: ledgerEvents.categoryId,
      categoryName: categories.name,
      payee: ledgerEvents.payee,
      note: ledgerEvents.note,
      createdAt: ledgerEvents.createdAt,
    })
    .from(ledgerEvents)
    .leftJoin(categories, eq(ledgerEvents.categoryId, categories.id))
    .where(eq(ledgerEvents.bookId, bookId))
    .orderBy(
      desc(ledgerEvents.occurredAt),
      desc(ledgerEvents.createdAt),
      desc(ledgerEvents.id),
    )
    .limit(limit)
    .all();
}

export function listEventHeaderRowsForAccount(
  executor: DatabaseExecutor,
  accountId: string,
  limit: number,
) {
  return executor
    .selectDistinct({
      id: ledgerEvents.id,
      eventType: ledgerEvents.eventType,
      occurredAt: ledgerEvents.occurredAt,
      categoryId: ledgerEvents.categoryId,
      categoryName: categories.name,
      payee: ledgerEvents.payee,
      note: ledgerEvents.note,
      createdAt: ledgerEvents.createdAt,
    })
    .from(ledgerEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, ledgerEvents.id))
    .leftJoin(categories, eq(ledgerEvents.categoryId, categories.id))
    .where(eq(ledgerEntries.accountId, accountId))
    .orderBy(
      desc(ledgerEvents.occurredAt),
      desc(ledgerEvents.createdAt),
      desc(ledgerEvents.id),
    )
    .limit(limit)
    .all();
}

export function listEntryReadRows(
  executor: DatabaseExecutor,
  eventIds: readonly string[],
) {
  if (eventIds.length === 0) {
    return [];
  }

  return executor
    .select({
      id: ledgerEntries.id,
      eventId: ledgerEntries.eventId,
      role: ledgerEntries.entryRole,
      amountAtomic: ledgerEntries.amountAtomic,
      accountId: accounts.id,
      accountName: accounts.name,
      assetId: assets.id,
      assetCode: assets.code,
      assetName: assets.name,
      assetSymbol: assets.symbol,
      assetType: assets.assetType,
      assetScale: assets.scale,
      assetIsArchived: assets.isArchived,
    })
    .from(ledgerEntries)
    .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
    .innerJoin(assets, eq(accounts.assetId, assets.id))
    .where(inArray(ledgerEntries.eventId, [...eventIds]))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id))
    .all();
}

export function listSnapshotReadRows(
  executor: DatabaseExecutor,
  accountId: string,
) {
  return executor
    .select()
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.accountId, accountId))
    .orderBy(
      desc(balanceSnapshots.asOf),
      desc(balanceSnapshots.createdAt),
      desc(balanceSnapshots.id),
    )
    .all();
}
