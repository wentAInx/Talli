export type AtomicAmount = bigint;
export type AtomicAmountDb = string;

export type AssetType = "fiat" | "crypto" | "custom";

export type AccountType =
  | "cash"
  | "bank"
  | "ewallet"
  | "exchange"
  | "crypto_wallet"
  | "credit"
  | "loan"
  | "other";

export type EventType = "expense" | "income" | "transfer" | "exchange";
export type EntryRole = "main" | "source" | "destination" | "fee";

export interface AccountRef {
  id: string;
  assetId: string;
}

export interface LedgerEntryDraft {
  accountId: string;
  role: EntryRole;
  amountAtomic: AtomicAmount;
}

export interface OptionalFeeDraft {
  account: AccountRef;
  amountAtomic: AtomicAmount;
}

export interface TimedLedgerEntry {
  id: string;
  accountId: string;
  amountAtomic: AtomicAmount;
  occurredAt: string;
}

export interface BalanceSnapshotFact {
  id: string;
  accountId: string;
  asOf: string;
  balanceAtomic: AtomicAmount;
  createdAt: string;
}

export interface ReportEntryFact {
  assetId: string;
  eventType: EventType;
  role: EntryRole;
  amountAtomic: AtomicAmount;
}

export interface CategorizedReportEntryFact extends ReportEntryFact {
  categoryId: string | null;
  categoryName: string | null;
}

export interface AssetReportBucket {
  assetId: string;
  incomeAtomic: AtomicAmount;
  expenseAtomic: AtomicAmount;
}

export interface AssetCategoryReportBucket extends AssetReportBucket {
  categoryKey: string;
  categoryId: string | null;
  categoryName: string;
}
