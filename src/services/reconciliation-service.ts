import { parseDecimalToAtomic } from "../domain/money";
import { atomicToDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import {
  deleteSnapshot,
  findAccountWithAsset,
  findSnapshotAtTime,
  findSnapshotById,
  insertSnapshot,
  queryBalanceAt,
  updateSnapshot,
} from "../db/queries";
import type { ReconcileInput, UpdateSnapshotInput } from "./contracts";
import { assertService, ServiceError } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { canonicalTimestamp, optionalText } from "./validation";

export class ReconciliationService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async reconcile(input: ReconcileInput): Promise<string> {
    const id = this.context.db.transaction(
      (transaction) => {
        const account = findAccountWithAsset(transaction, input.accountId);
        assertService(account, "ACCOUNT_NOT_FOUND", "Account was not found.");
        assertService(
          !account.account.isArchived,
          "ACCOUNT_ARCHIVED",
          "Archived account cannot be reconciled.",
        );
        assertService(
          !account.asset.isArchived,
          "ASSET_ARCHIVED",
          "Archived asset cannot be reconciled.",
        );

        const asOf = canonicalTimestamp(input.asOf);
        assertService(
          !findSnapshotAtTime(transaction, input.accountId, asOf),
          "SNAPSHOT_TIME_CONFLICT",
          "A snapshot already exists for this account at the same instant.",
        );
        const now = runtimeNow(this.runtime);
        const snapshotId = this.runtime.id();
        insertSnapshot(transaction, {
          id: snapshotId,
          accountId: input.accountId,
          asOf,
          balanceAtomic: atomicToDb(
            parseDecimalToAtomic(input.actualBalance, account.asset.scale),
          ),
          note: optionalText(input.note),
          createdAt: now,
          updatedAt: now,
        });
        return snapshotId;
      },
      { behavior: "immediate" },
    );

    return id;
  }

  async update(snapshotId: string, input: UpdateSnapshotInput): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        const snapshot = findSnapshotById(transaction, snapshotId);
        if (!snapshot) {
          throw new ServiceError(
            "SNAPSHOT_NOT_FOUND",
            `Snapshot ${snapshotId} was not found.`,
          );
        }
        const account = findAccountWithAsset(transaction, snapshot.accountId);
        assertService(
          account,
          "ACCOUNT_NOT_FOUND",
          "Snapshot account was not found.",
        );
        const asOf = canonicalTimestamp(input.asOf);
        assertService(
          !findSnapshotAtTime(
            transaction,
            snapshot.accountId,
            asOf,
            snapshotId,
          ),
          "SNAPSHOT_TIME_CONFLICT",
          "A snapshot already exists for this account at the same instant.",
        );
        updateSnapshot(transaction, snapshotId, {
          asOf,
          balanceAtomic: atomicToDb(
            parseDecimalToAtomic(input.actualBalance, account.asset.scale),
          ),
          note: optionalText(input.note),
          updatedAt: runtimeNow(this.runtime),
        });
      },
      { behavior: "immediate" },
    );
  }

  async delete(snapshotId: string): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        if (!findSnapshotById(transaction, snapshotId)) {
          throw new ServiceError(
            "SNAPSHOT_NOT_FOUND",
            `Snapshot ${snapshotId} was not found.`,
          );
        }
        deleteSnapshot(transaction, snapshotId);
      },
      { behavior: "immediate" },
    );
  }

  async balanceAt(accountId: string, queryTime: string): Promise<bigint> {
    const result = this.context.db.transaction((transaction) => {
      assertService(
        findAccountWithAsset(transaction, accountId),
        "ACCOUNT_NOT_FOUND",
        "Account was not found.",
      );
      return queryBalanceAt(
        transaction,
        accountId,
        canonicalTimestamp(queryTime),
      );
    });
    return result;
  }

  async currentBalance(accountId: string): Promise<bigint> {
    return this.balanceAt(accountId, runtimeNow(this.runtime));
  }
}
