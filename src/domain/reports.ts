import { assertDomain } from "./errors";
import type { AssetReportBucket, ReportEntryFact } from "./types";

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
