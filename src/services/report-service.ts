import { atomicFromDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import { listMonthlyReportRows } from "../db/queries";
import {
  aggregateReportEntriesByAsset,
  aggregateReportEntriesByAssetAndCategory,
} from "../domain/reports";
import { monthUtcRange } from "../domain/time";
import type { AssetView, MonthlyReportView } from "./view-contracts";
import { formatAssetAmount } from "./ledger-read-service";
import { SettingsService } from "./settings-service";

export class ReportService {
  constructor(private readonly context: DatabaseContext) {}

  monthlyIncomeExpense(input: {
    bookId: string;
    month: string;
  }): MonthlyReportView {
    const timeZone = new SettingsService(this.context).getTimeZoneOrDefault();
    const range = monthUtcRange(input.month, timeZone);
    const rows = listMonthlyReportRows(this.context.db, {
      bookId: input.bookId,
      ...range,
    });
    const facts = rows.map((row) => ({
      assetId: row.assetId,
      eventType: row.eventType,
      role: row.entryRole,
      amountAtomic: atomicFromDb(row.amountAtomic),
      categoryId: row.categoryId,
      categoryName: row.categoryName,
    }));
    const totals = new Map(
      aggregateReportEntriesByAsset(facts).map((bucket) => [
        bucket.assetId,
        bucket,
      ]),
    );
    const categories = new Map<
      string,
      ReturnType<typeof aggregateReportEntriesByAssetAndCategory>
    >();
    for (const bucket of aggregateReportEntriesByAssetAndCategory(facts)) {
      const assetCategories = categories.get(bucket.assetId) ?? [];
      assetCategories.push(bucket);
      categories.set(bucket.assetId, assetCategories);
    }
    const assetsById = new Map<string, AssetView>();
    for (const row of rows) {
      assetsById.set(row.assetId, {
        id: row.assetId,
        code: row.assetCode,
        name: row.assetName,
        symbol: row.assetSymbol,
        type: row.assetType,
        scale: row.assetScale,
        isArchived: row.assetIsArchived,
      });
    }

    const assets = [...totals.values()].map((total) => {
      const asset = assetsById.get(total.assetId)!;
      return {
        asset,
        incomeAtomic: total.incomeAtomic.toString(),
        expenseAtomic: total.expenseAtomic.toString(),
        incomeDisplay: formatAssetAmount(total.incomeAtomic, asset),
        expenseDisplay: formatAssetAmount(total.expenseAtomic, asset),
        categories: (categories.get(total.assetId) ?? []).map((bucket) => ({
          key: bucket.categoryKey,
          id: bucket.categoryId,
          name: bucket.categoryName,
          incomeAtomic: bucket.incomeAtomic.toString(),
          expenseAtomic: bucket.expenseAtomic.toString(),
          incomeDisplay: formatAssetAmount(bucket.incomeAtomic, asset),
          expenseDisplay: formatAssetAmount(bucket.expenseAtomic, asset),
        })),
      };
    });

    return {
      bookId: input.bookId,
      month: input.month,
      timeZone,
      ...range,
      assets,
    };
  }
}
