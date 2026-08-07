import { asc, eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { assets } from "../schema";

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
