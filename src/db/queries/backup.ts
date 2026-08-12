import { asc } from "drizzle-orm";

import type { BackupData } from "../../domain/backup";
import type { DatabaseExecutor } from "../connection";
import {
  accounts,
  appMeta,
  appSettings,
  assets,
  balanceSnapshots,
  bookValuationSettings,
  books,
  categories,
  eventTags,
  externalAccountMappings,
  externalAssetMappings,
  externalBalanceObservations,
  externalCandidateSourceObjects,
  externalConnections,
  externalImportLinks,
  externalSourceObjects,
  externalTransactionCandidates,
  externalTransactionLegs,
  evmBalanceObservationDetails,
  evmCandidateDetails,
  evmWalletConnectionState,
  evmWalletConnections,
  ledgerEntries,
  ledgerEvents,
  latestPriceQuotes,
  manualPriceQuotes,
  priceProviderMappings,
  priceProviderState,
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
    bookValuationSettings: executor
      .select()
      .from(bookValuationSettings)
      .orderBy(asc(bookValuationSettings.bookId))
      .all(),
    priceProviderMappings: executor
      .select()
      .from(priceProviderMappings)
      .orderBy(
        asc(priceProviderMappings.provider),
        asc(priceProviderMappings.priority),
        asc(priceProviderMappings.assetId),
      )
      .all(),
    manualPriceQuotes: executor
      .select()
      .from(manualPriceQuotes)
      .orderBy(asc(manualPriceQuotes.id))
      .all(),
    externalConnections: executor
      .select()
      .from(externalConnections)
      .orderBy(asc(externalConnections.id))
      .all(),
    evmWalletConnections: executor
      .select()
      .from(evmWalletConnections)
      .orderBy(asc(evmWalletConnections.connectionId))
      .all(),
    externalAssetMappings: executor
      .select()
      .from(externalAssetMappings)
      .orderBy(
        asc(externalAssetMappings.connectionId),
        asc(externalAssetMappings.providerAssetKey),
      )
      .all(),
    externalAccountMappings: executor
      .select()
      .from(externalAccountMappings)
      .orderBy(
        asc(externalAccountMappings.connectionId),
        asc(externalAccountMappings.providerAssetKey),
      )
      .all(),
    externalBalanceObservations: executor
      .select()
      .from(externalBalanceObservations)
      .orderBy(asc(externalBalanceObservations.id))
      .all(),
    evmBalanceObservationDetails: executor
      .select()
      .from(evmBalanceObservationDetails)
      .orderBy(asc(evmBalanceObservationDetails.observationId))
      .all(),
    externalSourceObjects: executor
      .select()
      .from(externalSourceObjects)
      .orderBy(asc(externalSourceObjects.id))
      .all(),
    externalTransactionCandidates: executor
      .select()
      .from(externalTransactionCandidates)
      .orderBy(asc(externalTransactionCandidates.id))
      .all(),
    evmCandidateDetails: executor
      .select()
      .from(evmCandidateDetails)
      .orderBy(asc(evmCandidateDetails.candidateId))
      .all(),
    externalCandidateSourceObjects: executor
      .select()
      .from(externalCandidateSourceObjects)
      .orderBy(
        asc(externalCandidateSourceObjects.candidateId),
        asc(externalCandidateSourceObjects.sourceObjectId),
      )
      .all(),
    externalTransactionLegs: executor
      .select()
      .from(externalTransactionLegs)
      .orderBy(asc(externalTransactionLegs.id))
      .all(),
    externalImportLinks: executor
      .select()
      .from(externalImportLinks)
      .orderBy(asc(externalImportLinks.candidateId))
      .all(),
  };
}

export function readAppMetaRows(executor: DatabaseExecutor) {
  return executor.select().from(appMeta).orderBy(asc(appMeta.key)).all();
}

export function upsertAppMetaValue(
  executor: DatabaseExecutor,
  key: string,
  value: string,
): void {
  executor
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } })
    .run();
}

export function clearRestoreTarget(executor: DatabaseExecutor): void {
  executor.delete(externalImportLinks).run();
  executor.delete(externalCandidateSourceObjects).run();
  executor.delete(externalTransactionLegs).run();
  executor.delete(evmCandidateDetails).run();
  executor.delete(externalTransactionCandidates).run();
  executor.delete(evmBalanceObservationDetails).run();
  executor.delete(externalBalanceObservations).run();
  executor.delete(externalSourceObjects).run();
  executor.delete(externalAccountMappings).run();
  executor.delete(externalAssetMappings).run();
  executor.delete(evmWalletConnectionState).run();
  executor.delete(evmWalletConnections).run();
  executor.delete(externalConnections).run();
  executor.delete(latestPriceQuotes).run();
  executor.delete(priceProviderState).run();
  executor.delete(manualPriceQuotes).run();
  executor.delete(priceProviderMappings).run();
  executor.delete(bookValuationSettings).run();
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
  if (data.bookValuationSettings.length > 0) {
    executor
      .insert(bookValuationSettings)
      .values(data.bookValuationSettings)
      .run();
  }
  if (data.priceProviderMappings.length > 0) {
    executor
      .insert(priceProviderMappings)
      .values(data.priceProviderMappings)
      .run();
  }
  if (data.manualPriceQuotes.length > 0) {
    executor.insert(manualPriceQuotes).values(data.manualPriceQuotes).run();
  }
  if (data.externalConnections.length > 0) {
    executor.insert(externalConnections).values(data.externalConnections).run();
  }
  if (data.evmWalletConnections.length > 0) {
    executor
      .insert(evmWalletConnections)
      .values(data.evmWalletConnections)
      .run();
  }
  if (data.externalAssetMappings.length > 0) {
    executor
      .insert(externalAssetMappings)
      .values(data.externalAssetMappings)
      .run();
  }
  if (data.externalAccountMappings.length > 0) {
    executor
      .insert(externalAccountMappings)
      .values(data.externalAccountMappings)
      .run();
  }
  if (data.externalBalanceObservations.length > 0) {
    executor
      .insert(externalBalanceObservations)
      .values(data.externalBalanceObservations)
      .run();
  }
  if (data.evmBalanceObservationDetails.length > 0) {
    executor
      .insert(evmBalanceObservationDetails)
      .values(data.evmBalanceObservationDetails)
      .run();
  }
  if (data.externalSourceObjects.length > 0) {
    executor
      .insert(externalSourceObjects)
      .values(data.externalSourceObjects)
      .run();
  }
  if (data.externalTransactionCandidates.length > 0) {
    executor
      .insert(externalTransactionCandidates)
      .values(data.externalTransactionCandidates)
      .run();
  }
  if (data.evmCandidateDetails.length > 0) {
    executor.insert(evmCandidateDetails).values(data.evmCandidateDetails).run();
  }
  if (data.externalCandidateSourceObjects.length > 0) {
    executor
      .insert(externalCandidateSourceObjects)
      .values(data.externalCandidateSourceObjects)
      .run();
  }
  if (data.externalTransactionLegs.length > 0) {
    executor
      .insert(externalTransactionLegs)
      .values(data.externalTransactionLegs)
      .run();
  }
  if (data.externalImportLinks.length > 0) {
    executor.insert(externalImportLinks).values(data.externalImportLinks).run();
  }
}
