import { atomicFromDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import {
  accountHasLedgerEntries,
  accountHasSnapshots,
  findCategoryById,
  findLedgerEventById,
  findTagIdsForEvent,
  listAccountReadRows,
  listAssets,
  listCategoriesForBook,
  listDefaultBooks,
  listEntryReadRows,
  listEventHeaderRows,
  listEventHeaderPageRows,
  listEventHeaderRowsForAccount,
  listEventTagReadRows,
  listSnapshotReadRows,
  listTagsForBook,
  queryBalancesAt,
} from "../db/queries";
import { formatAtomic } from "../domain/money";
import type { EventType } from "../domain/types";
import { canonicalUtcInstantValue } from "../domain/time";
import { ServiceError } from "./errors";
import type {
  AccountDetailView,
  AccountView,
  AssetView,
  DashboardAssetGroupView,
  DashboardView,
  EventEntryView,
  LedgerEventView,
  LedgerEventListInput,
  LedgerEventPageView,
  LedgerFilterReferenceView,
  LedgerReferenceView,
} from "./view-contracts";

const EVENT_TITLES: Record<EventType, string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  exchange: "兑换",
};

function groupIntegerDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumberText(amount: bigint, scale: number): string {
  const exact = formatAtomic(amount, scale);
  const sign = exact.startsWith("-") ? "-" : "";
  const unsigned = sign ? exact.slice(1) : exact;
  const [whole, fraction] = unsigned.split(".");
  const grouped = groupIntegerDigits(whole);
  return `${sign}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function formatAssetAmount(amount: bigint, asset: AssetView): string {
  const value = formatNumberText(amount, asset.scale);
  if (asset.type === "fiat" && asset.symbol) {
    return `${value.startsWith("-") ? "-" : ""}${asset.symbol}${value.replace(
      /^-/,
      "",
    )} ${asset.code}`;
  }
  return `${value} ${asset.code}`;
}

function defaultBookId(context: DatabaseContext): string {
  const books = listDefaultBooks(context.db);
  if (books.length !== 1) {
    throw new ServiceError(
      "DEFAULT_BOOK_UNAVAILABLE",
      "Exactly one default book is required.",
    );
  }
  return books[0].id;
}

type AccountReadRow = ReturnType<typeof listAccountReadRows>[number];

function assetFromAccountRow(row: AccountReadRow): AssetView {
  return {
    id: row.assetId,
    code: row.assetCode,
    name: row.assetName,
    symbol: row.assetSymbol,
    type: row.assetType,
    scale: row.assetScale,
    isArchived: row.assetIsArchived,
  };
}

function entryViews(
  rows: ReturnType<typeof listEntryReadRows>,
): Map<string, EventEntryView[]> {
  const grouped = new Map<string, EventEntryView[]>();
  for (const row of rows) {
    const amount = atomicFromDb(row.amountAtomic);
    const asset: AssetView = {
      id: row.assetId,
      code: row.assetCode,
      name: row.assetName,
      symbol: row.assetSymbol,
      type: row.assetType,
      scale: row.assetScale,
      isArchived: row.assetIsArchived,
    };
    const entry: EventEntryView = {
      id: row.id,
      role: row.role,
      accountId: row.accountId,
      accountName: row.accountName,
      asset,
      amountAtomic: amount.toString(),
      amountInput: formatAtomic(amount < 0n ? -amount : amount, asset.scale),
      amountDisplay: formatAssetAmount(amount, asset),
    };
    const eventEntries = grouped.get(row.eventId) ?? [];
    eventEntries.push(entry);
    grouped.set(row.eventId, eventEntries);
  }
  return grouped;
}

type HeaderRow = ReturnType<typeof listEventHeaderRows>[number];

function eventViews(
  headers: readonly HeaderRow[],
  entries: Map<string, EventEntryView[]>,
  tagIds: ReadonlyMap<string, string[]> = new Map(),
): LedgerEventView[] {
  return headers.map((header) => ({
    id: header.id,
    type: header.eventType,
    occurredAt: header.occurredAt,
    categoryId: header.categoryId,
    categoryName: header.categoryName,
    payee: header.payee,
    note: header.note,
    title: header.payee ?? EVENT_TITLES[header.eventType],
    entries: entries.get(header.id) ?? [],
    tagIds: tagIds.get(header.id) ?? [],
  }));
}

function tagIdsByEvent(
  rows: ReturnType<typeof listEventTagReadRows>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const eventTagIds = grouped.get(row.eventId) ?? [];
    eventTagIds.push(row.tagId);
    grouped.set(row.eventId, eventTagIds);
  }
  return grouped;
}

interface CursorPayload {
  occurredAt: string;
  createdAt: string;
  id: string;
}

function encodeEventCursor(cursor: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeEventCursor(value: string): CursorPayload {
  try {
    if (value.length === 0 || value.length > 1024) {
      throw new Error("Cursor length is invalid.");
    }
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "createdAt,id,occurredAt"
    ) {
      throw new Error("Cursor shape is invalid.");
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.occurredAt !== "string" ||
      typeof candidate.createdAt !== "string" ||
      typeof candidate.id !== "string" ||
      candidate.id.length === 0
    ) {
      throw new Error("Cursor values are invalid.");
    }
    canonicalUtcInstantValue(candidate.occurredAt);
    canonicalUtcInstantValue(candidate.createdAt);
    return {
      occurredAt: candidate.occurredAt,
      createdAt: candidate.createdAt,
      id: candidate.id,
    };
  } catch {
    throw new ServiceError(
      "INVALID_EVENT_CURSOR",
      "The transaction page cursor is invalid.",
    );
  }
}

function normalizedEventListInput(input: LedgerEventListInput) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ServiceError(
      "INVALID_EVENT_PAGE_SIZE",
      "Transaction page size must be between 1 and 100.",
    );
  }
  if (input.startInclusive) {
    canonicalUtcInstantValue(input.startInclusive);
  }
  if (input.endExclusive) {
    canonicalUtcInstantValue(input.endExclusive);
  }
  if (
    input.startInclusive &&
    input.endExclusive &&
    input.startInclusive >= input.endExclusive
  ) {
    throw new ServiceError(
      "INVALID_EVENT_DATE_RANGE",
      "Transaction date range start must be before its end.",
    );
  }
  const query = input.query?.trim() || undefined;
  if (query && query.length > 100) {
    throw new ServiceError(
      "EVENT_QUERY_TOO_LONG",
      "Transaction search is limited to 100 characters.",
    );
  }
  return {
    ...input,
    query,
    limit,
    cursor: input.cursor ? decodeEventCursor(input.cursor) : undefined,
  };
}

export class LedgerReadService {
  constructor(private readonly context: DatabaseContext) {}

  getReferenceData(
    queryTime: string,
    include: {
      categoryIds?: readonly string[];
      tagIds?: readonly string[];
    } = {},
  ): LedgerReferenceView {
    const bookId = defaultBookId(this.context);
    const accounts = this.accountViews(bookId, queryTime);
    const includedCategoryIds = new Set(include.categoryIds ?? []);
    const includedTagIds = new Set(include.tagIds ?? []);
    return {
      bookId,
      assets: listAssets(this.context.db)
        .filter((asset) => !asset.isArchived)
        .map((asset) => ({
          id: asset.id,
          code: asset.code,
          name: asset.name,
          symbol: asset.symbol,
          type: asset.assetType,
          scale: asset.scale,
          isArchived: asset.isArchived,
        })),
      accounts: accounts.filter(
        (account) => !account.isArchived && !account.asset.isArchived,
      ),
      categories: listCategoriesForBook(this.context.db, bookId)
        .filter(
          (category) =>
            !category.isArchived || includedCategoryIds.has(category.id),
        )
        .map((category) => ({
          id: category.id,
          name: category.name,
          type: category.categoryType,
          isArchived: category.isArchived,
        })),
      tags: listTagsForBook(this.context.db, bookId)
        .filter((tag) => !tag.isArchived || includedTagIds.has(tag.id))
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          isArchived: tag.isArchived,
        })),
    };
  }

  listAccounts(queryTime: string): AccountView[] {
    return this.accountViews(defaultBookId(this.context), queryTime);
  }

  getAccountDetail(accountId: string, queryTime: string): AccountDetailView {
    const accountSummary = this.listAccounts(queryTime).find(
      (candidate) => candidate.id === accountId,
    );
    if (!accountSummary) {
      throw new ServiceError("ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    const account: AccountView = {
      ...accountSummary,
      canChangeAsset:
        !accountHasLedgerEntries(this.context.db, accountId) &&
        !accountHasSnapshots(this.context.db, accountId),
    };

    const headers = listEventHeaderRowsForAccount(
      this.context.db,
      accountId,
      10,
    );
    const entries = entryViews(
      listEntryReadRows(
        this.context.db,
        headers.map((header) => header.id),
      ),
    );
    const snapshots = listSnapshotReadRows(this.context.db, accountId).map(
      (snapshot) => {
        const amount = atomicFromDb(snapshot.balanceAtomic);
        return {
          id: snapshot.id,
          asOf: snapshot.asOf,
          balanceAtomic: amount.toString(),
          balanceInput: formatAtomic(amount, account.asset.scale),
          balanceDisplay: formatAssetAmount(amount, account.asset),
          note: snapshot.note,
        };
      },
    );

    return {
      account,
      recentEvents: eventViews(headers, entries),
      snapshots,
    };
  }

  listEvents(limit = 50): LedgerEventView[] {
    const bookId = defaultBookId(this.context);
    const headers = listEventHeaderRows(this.context.db, bookId, limit);
    const entries = entryViews(
      listEntryReadRows(
        this.context.db,
        headers.map((header) => header.id),
      ),
    );
    return eventViews(headers, entries);
  }

  listEventPage(input: LedgerEventListInput = {}): LedgerEventPageView {
    const normalized = normalizedEventListInput(input);
    const bookId = defaultBookId(this.context);
    const rows = listEventHeaderPageRows(this.context.db, {
      bookId,
      limit: normalized.limit + 1,
      cursor: normalized.cursor,
      startInclusive: normalized.startInclusive,
      endExclusive: normalized.endExclusive,
      eventType: normalized.eventType,
      accountId: normalized.accountId,
      assetId: normalized.assetId,
      categoryId: normalized.categoryId,
      tagId: normalized.tagId,
      query: normalized.query,
    });
    const hasMore = rows.length > normalized.limit;
    const headers = rows.slice(0, normalized.limit);
    const eventIds = headers.map((header) => header.id);
    const entries = entryViews(listEntryReadRows(this.context.db, eventIds));
    const tagIds = tagIdsByEvent(
      listEventTagReadRows(this.context.db, eventIds),
    );
    const last = headers.at(-1);
    return {
      events: eventViews(headers, entries, tagIds),
      nextCursor:
        hasMore && last
          ? encodeEventCursor({
              occurredAt: last.occurredAt,
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }

  getEventFilterReferences(): LedgerFilterReferenceView {
    const bookId = defaultBookId(this.context);
    return {
      accounts: listAccountReadRows(this.context.db, bookId).map((row) => ({
        id: row.id,
        label: `${row.name} · ${row.assetCode}`,
        isArchived: row.isArchived || row.assetIsArchived,
      })),
      assets: listAssets(this.context.db).map((asset) => ({
        id: asset.id,
        label: `${asset.code} · ${asset.name}`,
        isArchived: asset.isArchived,
      })),
      categories: listCategoriesForBook(this.context.db, bookId).map(
        (category) => ({
          id: category.id,
          label: category.name,
          isArchived: category.isArchived,
        }),
      ),
      tags: listTagsForBook(this.context.db, bookId).map((tag) => ({
        id: tag.id,
        label: tag.name,
        isArchived: tag.isArchived,
      })),
    };
  }

  getEvent(eventId: string): LedgerEventView {
    const event = findLedgerEventById(this.context.db, eventId);
    if (!event || event.bookId !== defaultBookId(this.context)) {
      throw new ServiceError("EVENT_NOT_FOUND", "Transaction was not found.");
    }
    const category = event.categoryId
      ? findCategoryById(this.context.db, event.categoryId)
      : null;
    const entries = entryViews(listEntryReadRows(this.context.db, [eventId]));
    return eventViews(
      [
        {
          id: event.id,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          categoryId: event.categoryId,
          categoryName: category?.name ?? null,
          payee: event.payee,
          note: event.note,
          createdAt: event.createdAt,
        },
      ],
      entries,
      new Map([[eventId, findTagIdsForEvent(this.context.db, eventId)]]),
    )[0];
  }

  getDashboard(queryTime: string): DashboardView {
    const bookId = defaultBookId(this.context);
    const accounts = this.accountViews(bookId, queryTime).filter(
      (account) => !account.isArchived,
    );
    const groups = new Map<
      string,
      { asset: AssetView; total: bigint; accounts: AccountView[] }
    >();
    for (const account of accounts) {
      const existing = groups.get(account.asset.id) ?? {
        asset: account.asset,
        total: 0n,
        accounts: [],
      };
      existing.total += BigInt(account.balanceAtomic);
      existing.accounts.push(account);
      groups.set(account.asset.id, existing);
    }
    const assetGroups: DashboardAssetGroupView[] = [...groups.values()].map(
      (group) => ({
        asset: group.asset,
        totalAtomic: group.total.toString(),
        totalDisplay: formatAssetAmount(group.total, group.asset),
        accounts: group.accounts,
      }),
    );
    const headers = listEventHeaderRows(this.context.db, bookId, 8);
    const entries = entryViews(
      listEntryReadRows(
        this.context.db,
        headers.map((header) => header.id),
      ),
    );

    return {
      queryTime,
      activeAccountCount: accounts.length,
      assetCount: assetGroups.length,
      assetGroups,
      recentEvents: eventViews(headers, entries),
    };
  }

  private accountViews(bookId: string, queryTime: string): AccountView[] {
    const rows = listAccountReadRows(this.context.db, bookId);
    const balances = queryBalancesAt(
      this.context.db,
      rows.map((row) => row.id),
      queryTime,
    );
    return rows.map((row) => {
      const asset = assetFromAccountRow(row);
      const balance = balances.get(row.id) ?? 0n;
      return {
        id: row.id,
        name: row.name,
        type: row.accountType,
        institutionName: row.institutionName,
        note: row.note,
        isArchived: row.isArchived,
        canChangeAsset: false,
        asset,
        balanceAtomic: balance.toString(),
        balanceDisplay: formatAssetAmount(balance, asset),
        balanceInput: formatAtomic(balance, asset.scale),
      };
    });
  }
}
