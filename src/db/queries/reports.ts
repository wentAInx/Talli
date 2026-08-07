import { and, asc, eq, gte, lt } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import {
  accounts,
  assets,
  categories,
  ledgerEntries,
  ledgerEvents,
} from "../schema";

export function listMonthlyReportRows(
  executor: DatabaseExecutor,
  input: {
    bookId: string;
    startInclusive: string;
    endExclusive: string;
  },
) {
  return executor
    .select({
      entryId: ledgerEntries.id,
      eventId: ledgerEvents.id,
      eventType: ledgerEvents.eventType,
      entryRole: ledgerEntries.entryRole,
      amountAtomic: ledgerEntries.amountAtomic,
      categoryId: ledgerEvents.categoryId,
      categoryName: categories.name,
      assetId: assets.id,
      assetCode: assets.code,
      assetName: assets.name,
      assetSymbol: assets.symbol,
      assetType: assets.assetType,
      assetScale: assets.scale,
      assetIsArchived: assets.isArchived,
      assetSortOrder: assets.sortOrder,
    })
    .from(ledgerEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, ledgerEvents.id))
    .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
    .innerJoin(assets, eq(accounts.assetId, assets.id))
    .leftJoin(categories, eq(ledgerEvents.categoryId, categories.id))
    .where(
      and(
        eq(ledgerEvents.bookId, input.bookId),
        gte(ledgerEvents.occurredAt, input.startInclusive),
        lt(ledgerEvents.occurredAt, input.endExclusive),
      ),
    )
    .orderBy(
      asc(assets.sortOrder),
      asc(assets.code),
      asc(ledgerEvents.occurredAt),
      asc(ledgerEvents.id),
      asc(ledgerEntries.id),
    )
    .all();
}
