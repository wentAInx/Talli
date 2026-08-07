import { assertDomain } from "./errors";
import type { AccountRef, LedgerEntryDraft, OptionalFeeDraft } from "./types";

function assertAccount(account: AccountRef, label: string): void {
  assertDomain(
    account.id.length > 0,
    "INVALID_ACCOUNT",
    `${label} account id is required.`,
  );
  assertDomain(
    account.assetId.length > 0,
    "INVALID_ASSET",
    `${label} asset id is required.`,
  );
}

function assertPositive(amount: bigint, label: string): void {
  assertDomain(
    amount > 0n,
    "AMOUNT_NOT_POSITIVE",
    `${label} amount must be greater than zero.`,
  );
}

function buildFeeEntry(
  fee: OptionalFeeDraft | null | undefined,
): LedgerEntryDraft[] {
  if (!fee) {
    return [];
  }

  assertAccount(fee.account, "Fee");
  assertPositive(fee.amountAtomic, "Fee");

  return [
    {
      accountId: fee.account.id,
      role: "fee",
      amountAtomic: -fee.amountAtomic,
    },
  ];
}

export function buildExpenseEntries(input: {
  account: AccountRef;
  amountAtomic: bigint;
}): LedgerEntryDraft[] {
  assertAccount(input.account, "Expense");
  assertPositive(input.amountAtomic, "Expense");

  return [
    {
      accountId: input.account.id,
      role: "main",
      amountAtomic: -input.amountAtomic,
    },
  ];
}

export function buildIncomeEntries(input: {
  account: AccountRef;
  amountAtomic: bigint;
}): LedgerEntryDraft[] {
  assertAccount(input.account, "Income");
  assertPositive(input.amountAtomic, "Income");

  return [
    {
      accountId: input.account.id,
      role: "main",
      amountAtomic: input.amountAtomic,
    },
  ];
}

export function buildTransferEntries(input: {
  sourceAccount: AccountRef;
  destinationAccount: AccountRef;
  amountAtomic: bigint;
  fee?: OptionalFeeDraft | null;
}): LedgerEntryDraft[] {
  assertAccount(input.sourceAccount, "Source");
  assertAccount(input.destinationAccount, "Destination");
  assertDomain(
    input.sourceAccount.id !== input.destinationAccount.id,
    "TRANSFER_SAME_ACCOUNT",
    "Transfer source and destination accounts must be different.",
  );
  assertDomain(
    input.sourceAccount.assetId === input.destinationAccount.assetId,
    "TRANSFER_ASSET_MISMATCH",
    "Transfer accounts must use the same asset; use exchange for different assets.",
  );
  assertPositive(input.amountAtomic, "Transfer");

  return [
    {
      accountId: input.sourceAccount.id,
      role: "source",
      amountAtomic: -input.amountAtomic,
    },
    {
      accountId: input.destinationAccount.id,
      role: "destination",
      amountAtomic: input.amountAtomic,
    },
    ...buildFeeEntry(input.fee),
  ];
}

export function buildExchangeEntries(input: {
  sourceAccount: AccountRef;
  sourceAmountAtomic: bigint;
  destinationAccount: AccountRef;
  destinationAmountAtomic: bigint;
  fee?: OptionalFeeDraft | null;
}): LedgerEntryDraft[] {
  assertAccount(input.sourceAccount, "Source");
  assertAccount(input.destinationAccount, "Destination");
  assertDomain(
    input.sourceAccount.id !== input.destinationAccount.id,
    "EXCHANGE_SAME_ACCOUNT",
    "Exchange source and destination accounts must be different.",
  );
  assertDomain(
    input.sourceAccount.assetId !== input.destinationAccount.assetId,
    "EXCHANGE_ASSET_MATCH",
    "Exchange accounts must use different assets; use transfer for the same asset.",
  );
  assertPositive(input.sourceAmountAtomic, "Exchange source");
  assertPositive(input.destinationAmountAtomic, "Exchange destination");

  return [
    {
      accountId: input.sourceAccount.id,
      role: "source",
      amountAtomic: -input.sourceAmountAtomic,
    },
    {
      accountId: input.destinationAccount.id,
      role: "destination",
      amountAtomic: input.destinationAmountAtomic,
    },
    ...buildFeeEntry(input.fee),
  ];
}
