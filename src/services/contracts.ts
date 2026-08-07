import type { AccountType } from "../domain/types";

export interface OptionalFeeInput {
  accountId: string;
  amount: string;
}

export interface ExpenseInput {
  accountId: string;
  amount: string;
  occurredAt: string;
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  tagIds?: string[];
}

export type IncomeInput = ExpenseInput;

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

export type LedgerMutationInput =
  | { eventType: "expense"; input: ExpenseInput }
  | { eventType: "income"; input: IncomeInput }
  | { eventType: "transfer"; input: TransferInput }
  | { eventType: "exchange"; input: ExchangeInput };

export interface CreateAccountInput {
  bookId: string;
  assetId: string;
  name: string;
  accountType: AccountType;
  institutionName?: string | null;
  note?: string | null;
  initialBalance?: string | null;
}

export interface UpdateAccountInput {
  name: string;
  accountType: AccountType;
  institutionName?: string | null;
  note?: string | null;
}

export interface ReconcileInput {
  accountId: string;
  actualBalance: string;
  asOf: string;
  note?: string | null;
}

export interface UpdateSnapshotInput {
  actualBalance: string;
  asOf: string;
  note?: string | null;
}
