import { assertDomain } from "./errors";
import type {
  AssetCategoryReportBucket,
  AssetReportBucket,
  CategorizedReportEntryFact,
  ReportEntryFact,
} from "./types";

export const REPORT_FEE_CATEGORY_KEY = "fees";
export const REPORT_UNCATEGORIZED_KEY = "uncategorized";

type ReportImpact =
  | { kind: "income"; amountAtomic: bigint }
  | { kind: "expense"; amountAtomic: bigint }
  | null;

export function classifyReportEntry(entry: ReportEntryFact): ReportImpact {
  if (entry.eventType === "income" && entry.role === "main") {
    assertDomain(
      entry.amountAtomic > 0n,
      "INVALID_REPORT_ENTRY",
      "Income main entry must be positive.",
    );
    return { kind: "income", amountAtomic: entry.amountAtomic };
  }

  if (entry.eventType === "expense" && entry.role === "main") {
    assertDomain(
      entry.amountAtomic < 0n,
      "INVALID_REPORT_ENTRY",
      "Expense main entry must be negative.",
    );
    return { kind: "expense", amountAtomic: -entry.amountAtomic };
  }

  if (
    (entry.eventType === "transfer" || entry.eventType === "exchange") &&
    entry.role === "fee"
  ) {
    assertDomain(
      entry.amountAtomic < 0n,
      "INVALID_REPORT_ENTRY",
      "Fee entry must be negative.",
    );
    return { kind: "expense", amountAtomic: -entry.amountAtomic };
  }

  return null;
}

export function aggregateReportEntriesByAsset(
  entries: readonly ReportEntryFact[],
): AssetReportBucket[] {
  const buckets = new Map<string, AssetReportBucket>();

  for (const entry of entries) {
    const impact = classifyReportEntry(entry);
    if (!impact) {
      continue;
    }

    const bucket = buckets.get(entry.assetId) ?? {
      assetId: entry.assetId,
      incomeAtomic: 0n,
      expenseAtomic: 0n,
    };

    if (impact.kind === "income") {
      bucket.incomeAtomic += impact.amountAtomic;
    } else {
      bucket.expenseAtomic += impact.amountAtomic;
    }

    buckets.set(entry.assetId, bucket);
  }

  return [...buckets.values()].sort((left, right) =>
    left.assetId.localeCompare(right.assetId),
  );
}

export function aggregateReportEntriesByAssetAndCategory(
  entries: readonly CategorizedReportEntryFact[],
): AssetCategoryReportBucket[] {
  const buckets = new Map<string, AssetCategoryReportBucket>();

  for (const entry of entries) {
    const impact = classifyReportEntry(entry);
    if (!impact) {
      continue;
    }
    const isFee =
      (entry.eventType === "transfer" || entry.eventType === "exchange") &&
      entry.role === "fee";
    const categoryKey = isFee
      ? REPORT_FEE_CATEGORY_KEY
      : (entry.categoryId ?? REPORT_UNCATEGORIZED_KEY);
    const categoryId = isFee ? null : entry.categoryId;
    const categoryName = isFee ? "手续费" : (entry.categoryName ?? "未分类");
    const mapKey = `${entry.assetId}\u0000${categoryKey}`;
    const bucket = buckets.get(mapKey) ?? {
      assetId: entry.assetId,
      categoryKey,
      categoryId,
      categoryName,
      incomeAtomic: 0n,
      expenseAtomic: 0n,
    };
    if (impact.kind === "income") {
      bucket.incomeAtomic += impact.amountAtomic;
    } else {
      bucket.expenseAtomic += impact.amountAtomic;
    }
    buckets.set(mapKey, bucket);
  }

  return [...buckets.values()].sort(
    (left, right) =>
      left.assetId.localeCompare(right.assetId) ||
      left.categoryName.localeCompare(right.categoryName) ||
      left.categoryKey.localeCompare(right.categoryKey),
  );
}
