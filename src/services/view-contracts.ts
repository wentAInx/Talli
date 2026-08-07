import type { AccountType, EventType } from "../domain/types";

export interface AssetView {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  type: "fiat" | "crypto" | "custom";
  scale: number;
  isArchived: boolean;
}

export interface AccountView {
  id: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  note: string | null;
  isArchived: boolean;
  canChangeAsset: boolean;
  asset: AssetView;
  balanceAtomic: string;
  balanceDisplay: string;
  balanceInput: string;
}

export interface CategoryView {
  id: string;
  name: string;
  type: "expense" | "income" | "both";
}

export interface TagView {
  id: string;
  name: string;
}

export interface EventEntryView {
  id: string;
  role: "main" | "source" | "destination" | "fee";
  accountId: string;
  accountName: string;
  asset: AssetView;
  amountAtomic: string;
  amountInput: string;
  amountDisplay: string;
}

export interface LedgerEventView {
  id: string;
  type: EventType;
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  payee: string | null;
  note: string | null;
  title: string;
  entries: EventEntryView[];
  tagIds: string[];
}

export interface LedgerEventListInput {
  startInclusive?: string;
  endExclusive?: string;
  eventType?: EventType;
  accountId?: string;
  assetId?: string;
  categoryId?: string;
  tagId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface LedgerEventPageView {
  events: LedgerEventView[];
  nextCursor: string | null;
}

export interface LedgerFilterOptionView {
  id: string;
  label: string;
  isArchived: boolean;
}

export interface LedgerFilterReferenceView {
  accounts: LedgerFilterOptionView[];
  assets: LedgerFilterOptionView[];
  categories: LedgerFilterOptionView[];
  tags: LedgerFilterOptionView[];
}

export interface ReportCategoryView {
  key: string;
  id: string | null;
  name: string;
  incomeAtomic: string;
  expenseAtomic: string;
  incomeDisplay: string;
  expenseDisplay: string;
}

export interface MonthlyAssetReportView {
  asset: AssetView;
  incomeAtomic: string;
  expenseAtomic: string;
  incomeDisplay: string;
  expenseDisplay: string;
  categories: ReportCategoryView[];
}

export interface MonthlyReportView {
  bookId: string;
  month: string;
  timeZone: string;
  startInclusive: string;
  endExclusive: string;
  assets: MonthlyAssetReportView[];
}

export interface SnapshotView {
  id: string;
  asOf: string;
  balanceAtomic: string;
  balanceInput: string;
  balanceDisplay: string;
  note: string | null;
}

export interface AccountDetailView {
  account: AccountView;
  recentEvents: LedgerEventView[];
  snapshots: SnapshotView[];
}

export interface DashboardAssetGroupView {
  asset: AssetView;
  totalAtomic: string;
  totalDisplay: string;
  accounts: AccountView[];
}

export interface DashboardView {
  queryTime: string;
  activeAccountCount: number;
  assetCount: number;
  assetGroups: DashboardAssetGroupView[];
  recentEvents: LedgerEventView[];
}

export interface LedgerReferenceView {
  bookId: string;
  assets: AssetView[];
  accounts: AccountView[];
  categories: CategoryView[];
  tags: TagView[];
}
