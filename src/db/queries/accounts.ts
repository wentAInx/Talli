import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { accounts, assets } from "../schema";

export function findAccountById(executor: DatabaseExecutor, id: string) {
  return executor.select().from(accounts).where(eq(accounts.id, id)).get();
}

export function findAccountWithAsset(executor: DatabaseExecutor, id: string) {
  return executor
    .select({ account: accounts, asset: assets })
    .from(accounts)
    .innerJoin(assets, eq(accounts.assetId, assets.id))
    .where(eq(accounts.id, id))
    .get();
}

export function listAccountsForBook(
  executor: DatabaseExecutor,
  bookId: string,
) {
  return executor
    .select()
    .from(accounts)
    .where(eq(accounts.bookId, bookId))
    .orderBy(asc(accounts.sortOrder), asc(accounts.name), asc(accounts.id))
    .all();
}

export function insertAccount(
  executor: DatabaseExecutor,
  value: typeof accounts.$inferInsert,
): void {
  executor.insert(accounts).values(value).run();
}

export function updateAccount(
  executor: DatabaseExecutor,
  id: string,
  value: Partial<
    Pick<
      typeof accounts.$inferInsert,
      | "name"
      | "accountType"
      | "institutionName"
      | "note"
      | "isArchived"
      | "updatedAt"
    >
  >,
): void {
  executor.update(accounts).set(value).where(eq(accounts.id, id)).run();
}
