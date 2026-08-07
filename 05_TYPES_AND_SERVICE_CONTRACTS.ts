/**
 * V1 domain contracts. This file is specification material, not necessarily drop-in code.
 * Codex should preserve these semantics when implementing the actual project.
 */

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

/** Persisted amounts are never number/REAL. */
export type AtomicAmount = bigint;
export type AtomicAmountDb = string;

export interface Asset {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  type: AssetType;
  scale: number;
  isArchived: boolean;
}

export interface Account {
  id: string;
  bookId: string;
  assetId: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  note: string | null;
  isArchived: boolean;
}

export interface LedgerEvent {
  id: string;
  bookId: string;
  type: EventType;
  occurredAt: string; // ISO UTC
  categoryId: string | null;
  payee: string | null;
  note: string | null;
}

export interface LedgerEntry {
  id: string;
  eventId: string;
  accountId: string;
  role: EntryRole;
  amountAtomic: AtomicAmount;
}

export interface BalanceSnapshot {
  id: string;
  accountId: string;
  asOf: string; // ISO UTC
  balanceAtomic: AtomicAmount;
  note: string | null;
}

export interface ExpenseInput {
  accountId: string;
  amount: string; // unsigned user decimal text
  occurredAt: string;
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  tagIds?: string[];
}

export interface IncomeInput {
  accountId: string;
  amount: string;
  occurredAt: string;
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  tagIds?: string[];
}

export interface OptionalFeeInput {
  accountId: string;
  amount: string; // unsigned, > 0
}

export interface TransferInput {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  occurredAt: string;
  fee?: OptionalFeeInput | null;
  note?: string | null;
  tagIds?: string[];
}

export interface ExchangeInput {
  sourceAccountId: string;
  sourceAmount: string;
  destinationAccountId: string;
  destinationAmount: string;
  occurredAt: string;
  fee?: OptionalFeeInput | null;
  note?: string | null;
  tagIds?: string[];
}

export interface ReconcileInput {
  accountId: string;
  actualBalance: string; // signed decimal text allowed
  asOf: string;
  note?: string | null;
}

export interface AssetAmount {
  assetId: string;
  amountAtomic: AtomicAmount;
}

export interface AssetReportBucket {
  assetId: string;
  incomeAtomic: AtomicAmount;
  expenseAtomic: AtomicAmount;
}

/**
 * MONEY SERVICE
 * - Must not use Number() for monetary arithmetic.
 * - Must reject excess fractional digits; never silently round user input.
 */
export interface MoneyService {
  parseDecimalToAtomic(input: string, scale: number): AtomicAmount;
  formatAtomic(amount: AtomicAmount, scale: number, options?: { trimTrailingZeros?: boolean }): string;
}

/**
 * LEDGER COMMAND SERVICE
 * Each command must be atomic in the database.
 */
export interface LedgerCommandService {
  createExpense(input: ExpenseInput): Promise<string>;
  createIncome(input: IncomeInput): Promise<string>;
  createTransfer(input: TransferInput): Promise<string>;
  createExchange(input: ExchangeInput): Promise<string>;
  updateEvent(eventId: string, input: ExpenseInput | IncomeInput | TransferInput | ExchangeInput): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}

/**
 * BALANCE SERVICE
 * Snapshot is exclusive lower bound for later entries:
 * snapshot.balance + entries where occurredAt > snapshot.asOf && <= queryTime.
 */
export interface BalanceService {
  balanceAt(accountId: string, queryTime: string): Promise<AtomicAmount>;
  currentBalance(accountId: string): Promise<AtomicAmount>;
  reconcile(input: ReconcileInput): Promise<string>;
}

/**
 * REPORT SERVICE
 * Returns separate buckets by asset; it MUST NOT perform cross-asset conversion.
 */
export interface ReportService {
  monthlyIncomeExpense(input: {
    bookId: string;
    month: string; // YYYY-MM in app timezone
  }): Promise<AssetReportBucket[]>;
}

/**
 * EXCHANGE RATE DISPLAY HELPER
 * This is NOT a market price service.
 * It only derives an executed ratio from two user-entered quantities.
 * Use a decimal library; do not return a JS number.
 */
export interface ExecutedExchangeRate {
  baseAssetId: string;
  quoteAssetId: string;
  quotePerBase: string; // decimal string
}
