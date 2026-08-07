import { asc } from "drizzle-orm";

import type { BackupData } from "../../domain/backup";
import type { DatabaseExecutor } from "../connection";
import {
  accounts,
  appMeta,
  appSettings,
  assets,
  balanceSnapshots,
  books,
  categories,
  eventTags,
  ledgerEntries,
  ledgerEvents,
  tags,
} from "../schema";

export function readBackupData(executor: DatabaseExecutor): BackupData {
  return {
    books: executor.select().from(books).orderBy(asc(books.id)).all(),
    assets: executor.select().from(assets).orderBy(asc(assets.id)).all(),
    accounts: executor.select().from(accounts).orderBy(asc(accounts.id)).all(),
    categories: executor
      .select()
      .from(categories)
      .orderBy(asc(categories.id))
      .all(),
    tags: executor.select().from(tags).orderBy(asc(tags.id)).all(),
    ledgerEvents: executor
      .select()
      .from(ledgerEvents)
      .orderBy(asc(ledgerEvents.id))
      .all(),
    ledgerEntries: executor
      .select()
      .from(ledgerEntries)
      .orderBy(asc(ledgerEntries.id))
      .all(),
    eventTags: executor
      .select()
      .from(eventTags)
      .orderBy(asc(eventTags.eventId), asc(eventTags.tagId))
      .all(),
    balanceSnapshots: executor
      .select()
      .from(balanceSnapshots)
      .orderBy(asc(balanceSnapshots.id))
      .all(),
    settings: executor
      .select()
      .from(appSettings)
      .orderBy(asc(appSettings.key))
      .all(),
  };
}

export function readAppMetaRows(executor: DatabaseExecutor) {
  return executor.select().from(appMeta).orderBy(asc(appMeta.key)).all();
}

export function clearRestoreTarget(executor: DatabaseExecutor): void {
  executor.delete(eventTags).run();
  executor.delete(ledgerEntries).run();
  executor.delete(ledgerEvents).run();
  executor.delete(balanceSnapshots).run();
  executor.delete(accounts).run();
  executor.delete(tags).run();
  executor.delete(categories).run();
  executor.delete(assets).run();
  executor.delete(books).run();
  executor.delete(appSettings).run();
  executor.delete(appMeta).run();
}

export function insertBackupData(
  executor: DatabaseExecutor,
  data: BackupData,
): void {
  if (data.books.length > 0) {
    executor.insert(books).values(data.books).run();
  }
  if (data.assets.length > 0) {
    executor.insert(assets).values(data.assets).run();
  }
  if (data.categories.length > 0) {
    executor.insert(categories).values(data.categories).run();
  }
  if (data.tags.length > 0) {
    executor.insert(tags).values(data.tags).run();
  }
  if (data.accounts.length > 0) {
    executor.insert(accounts).values(data.accounts).run();
  }
  if (data.ledgerEvents.length > 0) {
    executor.insert(ledgerEvents).values(data.ledgerEvents).run();
  }
  if (data.ledgerEntries.length > 0) {
    executor.insert(ledgerEntries).values(data.ledgerEntries).run();
  }
  if (data.balanceSnapshots.length > 0) {
    executor.insert(balanceSnapshots).values(data.balanceSnapshots).run();
  }
  if (data.eventTags.length > 0) {
    executor.insert(eventTags).values(data.eventTags).run();
  }
  if (data.settings.length > 0) {
    executor.insert(appSettings).values(data.settings).run();
  }
}
