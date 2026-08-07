import { parseDecimalToAtomic } from "../domain/money";
import { atomicToDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import {
  accountHasLedgerEntries,
  accountHasSnapshots,
  findAccountById,
  findAssetById,
  findBookById,
  insertAccount,
  insertSnapshot,
  updateAccount,
} from "../db/queries";
import { accountTypes } from "../db/schema";
import type { CreateAccountInput, UpdateAccountInput } from "./contracts";
import { assertService, ServiceError } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { optionalText, requiredText } from "./validation";

export class AccountService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async createAccount(input: CreateAccountInput): Promise<string> {
    const id = this.context.db.transaction(
      (transaction) => {
        assertService(
          findBookById(transaction, input.bookId),
          "BOOK_NOT_FOUND",
          "Book was not found.",
        );
        const asset = findAssetById(transaction, input.assetId);
        assertService(asset, "ASSET_NOT_FOUND", "Asset was not found.");
        assertService(
          !asset.isArchived,
          "ASSET_ARCHIVED",
          "Archived asset cannot be selected.",
        );
        assertService(
          accountTypes.includes(input.accountType),
          "INVALID_ACCOUNT_TYPE",
          "Account type is invalid.",
        );

        const accountId = this.runtime.id();
        const now = runtimeNow(this.runtime);
        insertAccount(transaction, {
          id: accountId,
          bookId: input.bookId,
          assetId: input.assetId,
          name: requiredText(input.name, "Account name"),
          accountType: input.accountType,
          institutionName: optionalText(input.institutionName),
          note: optionalText(input.note),
          isArchived: false,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        });

        if (
          input.initialBalance !== undefined &&
          input.initialBalance !== null
        ) {
          const initialText = requiredText(
            input.initialBalance,
            "Initial balance",
          );
          insertSnapshot(transaction, {
            id: this.runtime.id(),
            accountId,
            asOf: now,
            balanceAtomic: atomicToDb(
              parseDecimalToAtomic(initialText, asset.scale),
            ),
            note: "Initial balance",
            createdAt: now,
            updatedAt: now,
          });
        }

        return accountId;
      },
      { behavior: "immediate" },
    );

    return id;
  }

  async updateAccount(
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        const account = findAccountById(transaction, accountId);
        if (!account) {
          throw new ServiceError(
            "ACCOUNT_NOT_FOUND",
            `Account ${accountId} was not found.`,
          );
        }
        assertService(
          accountTypes.includes(input.accountType),
          "INVALID_ACCOUNT_TYPE",
          "Account type is invalid.",
        );
        let assetId = account.assetId;
        if (input.assetId && input.assetId !== account.assetId) {
          const asset = findAssetById(transaction, input.assetId);
          assertService(asset, "ASSET_NOT_FOUND", "Asset was not found.");
          assertService(
            !asset.isArchived,
            "ASSET_ARCHIVED",
            "Archived asset cannot be selected.",
          );
          assertService(
            !accountHasLedgerEntries(transaction, accountId) &&
              !accountHasSnapshots(transaction, accountId),
            "ACCOUNT_ASSET_LOCKED",
            "An account asset cannot change after ledger or snapshot history exists.",
          );
          assetId = asset.id;
        }
        updateAccount(transaction, accountId, {
          assetId,
          name: requiredText(input.name, "Account name"),
          accountType: input.accountType,
          institutionName: optionalText(input.institutionName),
          note: optionalText(input.note),
          updatedAt: runtimeNow(this.runtime),
        });
      },
      { behavior: "immediate" },
    );
  }

  async setArchived(accountId: string, isArchived: boolean): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        if (!findAccountById(transaction, accountId)) {
          throw new ServiceError(
            "ACCOUNT_NOT_FOUND",
            `Account ${accountId} was not found.`,
          );
        }
        updateAccount(transaction, accountId, {
          isArchived,
          updatedAt: runtimeNow(this.runtime),
        });
      },
      { behavior: "immediate" },
    );
  }
}
