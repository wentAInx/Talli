import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { appSettings } from "../schema";

export function findAppSetting(executor: DatabaseExecutor, key: string) {
  return executor
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
}

export function listAppSettings(executor: DatabaseExecutor) {
  return executor
    .select()
    .from(appSettings)
    .orderBy(asc(appSettings.key))
    .all();
}

export function upsertAppSetting(
  executor: DatabaseExecutor,
  value: typeof appSettings.$inferInsert,
): void {
  executor
    .insert(appSettings)
    .values(value)
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: value.valueJson, updatedAt: value.updatedAt },
    })
    .run();
}
