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
  listEventHeaderRowsForAccount,
  listSnapshotReadRows,
  listTagsForBook,
  queryBalanceAt,
} from "../db/queries";
import { formatAtomic } from "../domain/money";
import type { EventType } from "../domain/types";
import { ServiceError } from "./errors";
import type {
  AccountDetailView,
  AccountView,
  AssetView,
  DashboardAssetGroupView,
  DashboardView,
  EventEntryView,
  LedgerEventView,
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

function formatAssetAmount(amount: bigint, asset: AssetView): string {
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

export class LedgerReadService {
  constructor(private readonly context: DatabaseContext) {}

  getReferenceData(queryTime: string): LedgerReferenceView {
    const bookId = defaultBookId(this.context);
    const accounts = this.accountViews(bookId, queryTime);
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
        .filter((category) => !category.isArchived)
        .map((category) => ({
          id: category.id,
          name: category.name,
          type: category.categoryType,
        })),
      tags: listTagsForBook(this.context.db, bookId)
        .filter((tag) => !tag.isArchived)
        .map((tag) => ({ id: tag.id, name: tag.name })),
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
    return listAccountReadRows(this.context.db, bookId).map((row) => {
      const asset = assetFromAccountRow(row);
      const balance = queryBalanceAt(this.context.db, row.id, queryTime);
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
