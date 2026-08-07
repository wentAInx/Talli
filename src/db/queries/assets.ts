import { and, asc, eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { accounts, assets } from "../schema";

export function findAssetById(executor: DatabaseExecutor, id: string) {
  return executor.select().from(assets).where(eq(assets.id, id)).get();
}

export function findAssetByCode(executor: DatabaseExecutor, code: string) {
  return executor
    .select()
    .from(assets)
    .where(sql`${assets.code} = ${code} collate nocase`)
    .get();
}

export function listAssets(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(assets)
    .orderBy(asc(assets.sortOrder), asc(assets.code))
    .all();
}

export function insertAsset(
  executor: DatabaseExecutor,
  value: typeof assets.$inferInsert,
): void {
  executor.insert(assets).values(value).run();
}

export function setAssetArchived(
  executor: DatabaseExecutor,
  id: string,
  isArchived: boolean,
  updatedAt: string,
): void {
  executor
    .update(assets)
    .set({ isArchived, updatedAt })
    .where(eq(assets.id, id))
    .run();
}

export function updateAsset(
  executor: DatabaseExecutor,
  id: string,
  value: Partial<
    Pick<
      typeof assets.$inferInsert,
      | "code"
      | "name"
      | "symbol"
      | "assetType"
      | "scale"
      | "isArchived"
      | "sortOrder"
      | "updatedAt"
    >
  >,
): void {
  executor.update(assets).set(value).where(eq(assets.id, id)).run();
}

export function assetHasAccounts(
  executor: DatabaseExecutor,
  assetId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.assetId, assetId))
      .limit(1)
      .get(),
  );
}

export function assetHasActiveAccounts(
  executor: DatabaseExecutor,
  assetId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.assetId, assetId), eq(accounts.isArchived, false)))
      .limit(1)
      .get(),
  );
}
