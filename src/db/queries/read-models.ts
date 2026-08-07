import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import {
  accounts,
  assets,
  balanceSnapshots,
  categories,
  eventTags,
  ledgerEntries,
  ledgerEvents,
  tags,
} from "../schema";

export interface EventListCursor {
  occurredAt: string;
  createdAt: string;
  id: string;
}

export interface EventListQuery {
  bookId: string;
  limit: number;
  cursor?: EventListCursor;
  startInclusive?: string;
  endExclusive?: string;
  eventType?: "expense" | "income" | "transfer" | "exchange";
  accountId?: string;
  assetId?: string;
  categoryId?: string;
  tagId?: string;
  query?: string;
}

function escapedLikePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function eventEntryExists(
  executor: DatabaseExecutor,
  condition: SQL | undefined,
) {
  return exists(
    executor
      .select({ value: sql<number>`1` })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .innerJoin(assets, eq(accounts.assetId, assets.id))
      .where(and(eq(ledgerEntries.eventId, ledgerEvents.id), condition)),
  );
}

function eventTagExists(
  executor: DatabaseExecutor,
  condition: SQL | undefined,
) {
  return exists(
    executor
      .select({ value: sql<number>`1` })
      .from(eventTags)
      .innerJoin(tags, eq(eventTags.tagId, tags.id))
      .where(and(eq(eventTags.eventId, ledgerEvents.id), condition)),
  );
}

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

export function listEventHeaderPageRows(
  executor: DatabaseExecutor,
  query: EventListQuery,
) {
  const conditions: SQL[] = [eq(ledgerEvents.bookId, query.bookId)];

  if (query.startInclusive) {
    conditions.push(gte(ledgerEvents.occurredAt, query.startInclusive));
  }
  if (query.endExclusive) {
    conditions.push(lt(ledgerEvents.occurredAt, query.endExclusive));
  }
  if (query.eventType) {
    conditions.push(eq(ledgerEvents.eventType, query.eventType));
  }
  if (query.categoryId) {
    conditions.push(eq(ledgerEvents.categoryId, query.categoryId));
  }
  if (query.accountId) {
    conditions.push(
      eventEntryExists(executor, eq(ledgerEntries.accountId, query.accountId)),
    );
  }
  if (query.assetId) {
    conditions.push(
      eventEntryExists(executor, eq(accounts.assetId, query.assetId)),
    );
  }
  if (query.tagId) {
    conditions.push(eventTagExists(executor, eq(eventTags.tagId, query.tagId)));
  }
  if (query.query) {
    const pattern = escapedLikePattern(query.query);
    const directSearch = or(
      sql`${ledgerEvents.payee} like ${pattern} escape '\\'`,
      sql`${ledgerEvents.note} like ${pattern} escape '\\'`,
      sql`${categories.name} like ${pattern} escape '\\'`,
    );
    const entrySearch = eventEntryExists(
      executor,
      or(
        sql`${accounts.name} like ${pattern} escape '\\'`,
        sql`${assets.code} like ${pattern} escape '\\'`,
        sql`${assets.name} like ${pattern} escape '\\'`,
      ),
    );
    const tagSearch = eventTagExists(
      executor,
      sql`${tags.name} like ${pattern} escape '\\'`,
    );
    const search = or(directSearch, entrySearch, tagSearch);
    if (search) {
      conditions.push(search);
    }
  }
  if (query.cursor) {
    const beforeCursor = or(
      lt(ledgerEvents.occurredAt, query.cursor.occurredAt),
      and(
        eq(ledgerEvents.occurredAt, query.cursor.occurredAt),
        lt(ledgerEvents.createdAt, query.cursor.createdAt),
      ),
      and(
        eq(ledgerEvents.occurredAt, query.cursor.occurredAt),
        eq(ledgerEvents.createdAt, query.cursor.createdAt),
        lt(ledgerEvents.id, query.cursor.id),
      ),
    );
    if (beforeCursor) {
      conditions.push(beforeCursor);
    }
  }

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
    .where(and(...conditions))
    .orderBy(
      desc(ledgerEvents.occurredAt),
      desc(ledgerEvents.createdAt),
      desc(ledgerEvents.id),
    )
    .limit(query.limit)
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

export function listEventTagReadRows(
  executor: DatabaseExecutor,
  eventIds: readonly string[],
) {
  if (eventIds.length === 0) {
    return [];
  }

  return executor
    .select({
      eventId: eventTags.eventId,
      tagId: eventTags.tagId,
      tagName: tags.name,
    })
    .from(eventTags)
    .innerJoin(tags, eq(eventTags.tagId, tags.id))
    .where(inArray(eventTags.eventId, [...eventIds]))
    .orderBy(asc(eventTags.eventId), asc(tags.name), asc(tags.id))
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
