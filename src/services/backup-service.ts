import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  clearRestoreTarget,
  insertBackupData,
  readAppMetaRows,
  readBackupData,
  upsertAppMetaValue,
} from "../db/queries";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupValidationError,
  categoriesParentFirst,
  parseBackupPayload,
  type BackupData,
  type BackupPayload,
} from "../domain/backup";
import { formatAtomic } from "../domain/money";
import {
  SEED_ASSETS,
  SEED_BOOK_ID,
  SEED_CATEGORIES,
  SEED_DEFAULT_HOME_ASSET_CODE,
  SEED_PROVIDER_MAPPINGS,
  SEED_SCHEMA_VERSION,
  SEED_TIMESTAMP,
  seedAssetId,
} from "../db/seed-data";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { APP_TIMEZONE_KEY } from "./settings-service";

export class RestoreTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreTargetError";
  }
}

export interface BackupSummary {
  books: number;
  assets: number;
  accounts: number;
  categories: number;
  tags: number;
  events: number;
  entries: number;
  snapshots: number;
  settings: number;
  valuationSettings: number;
  providerMappings: number;
  manualQuotes: number;
  externalConnections: number;
  evmWallets: number;
  externalMappings: number;
  externalObservations: number;
  evmObservationDetails: number;
  externalSources: number;
  externalCandidates: number;
  evmCandidateDetails: number;
  evmL2GasFeeDetails: number;
  externalImportLinks: number;
  fileImportProfiles: number;
  fileImportBatches: number;
  fileImportSources: number;
  fileImportCandidates: number;
  externalMatchLinks: number;
  fileImportBalanceDetails: number;
  automationRules: number;
  automationRuleConditions: number;
  automationRuleActions: number;
  recurringItems: number;
  recurringItemTags: number;
  recurringOccurrenceLinks: number;
  recurringOccurrenceSkips: number;
}

export interface RestorePreview {
  schemaVersion: number;
  exportedAt: string;
  target: "empty" | "seed-only";
  summary: BackupSummary;
}

function summary(data: BackupData): BackupSummary {
  return {
    books: data.books.length,
    assets: data.assets.length,
    accounts: data.accounts.length,
    categories: data.categories.length,
    tags: data.tags.length,
    events: data.ledgerEvents.length,
    entries: data.ledgerEntries.length,
    snapshots: data.balanceSnapshots.length,
    settings: data.settings.length,
    valuationSettings: data.bookValuationSettings.length,
    providerMappings: data.priceProviderMappings.length,
    manualQuotes: data.manualPriceQuotes.length,
    externalConnections: data.externalConnections.length,
    evmWallets: data.evmWalletConnections.length,
    externalMappings:
      data.externalAssetMappings.length + data.externalAccountMappings.length,
    externalObservations: data.externalBalanceObservations.length,
    evmObservationDetails: data.evmBalanceObservationDetails.length,
    externalSources: data.externalSourceObjects.length,
    externalCandidates: data.externalTransactionCandidates.length,
    evmCandidateDetails: data.evmCandidateDetails.length,
    evmL2GasFeeDetails: data.evmL2GasFeeDetails.length,
    externalImportLinks: data.externalImportLinks.length,
    fileImportProfiles: data.fileImportProfiles.length,
    fileImportBatches: data.fileImportBatches.length,
    fileImportSources:
      data.fileImportSourceDetails.length +
      data.fileImportBatchSourceObjects.length,
    fileImportCandidates: data.fileImportCandidateDetails.length,
    externalMatchLinks: data.externalCandidateMatchLinks.length,
    fileImportBalanceDetails: data.fileImportBalanceObservationDetails.length,
    automationRules: data.automationRules.length,
    automationRuleConditions: data.automationRuleConditions.length,
    automationRuleActions: data.automationRuleActions.length,
    recurringItems: data.recurringItems.length,
    recurringItemTags: data.recurringItemTags.length,
    recurringOccurrenceLinks: data.recurringOccurrenceLinks.length,
    recurringOccurrenceSkips: data.recurringOccurrenceSkips.length,
  };
}

function sortedJson<T>(values: readonly T[]): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(canonical);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    }
    return value;
  };
  return JSON.stringify(
    values
      .map(canonical)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  );
}

function targetTimeZoneOnly(data: BackupData): boolean {
  return (
    data.settings.length <= 1 &&
    data.settings.every((setting) => setting.key === APP_TIMEZONE_KEY)
  );
}

function targetKind(executor: DatabaseExecutor): "empty" | "seed-only" {
  const data = readBackupData(executor);
  const meta = readAppMetaRows(executor);
  const userFactsAreEmpty =
    data.accounts.length === 0 &&
    data.tags.length === 0 &&
    data.ledgerEvents.length === 0 &&
    data.ledgerEntries.length === 0 &&
    data.eventTags.length === 0 &&
    data.balanceSnapshots.length === 0 &&
    data.manualPriceQuotes.length === 0 &&
    data.externalConnections.length === 0 &&
    data.externalAssetMappings.length === 0 &&
    data.externalAccountMappings.length === 0 &&
    data.externalBalanceObservations.length === 0 &&
    data.externalSourceObjects.length === 0 &&
    data.externalTransactionCandidates.length === 0 &&
    data.externalCandidateSourceObjects.length === 0 &&
    data.externalTransactionLegs.length === 0 &&
    data.externalImportLinks.length === 0 &&
    data.fileImportProfiles.length === 0 &&
    data.fileImportBatches.length === 0 &&
    data.fileImportSourceDetails.length === 0 &&
    data.fileImportBatchSourceObjects.length === 0 &&
    data.fileImportCandidateDetails.length === 0 &&
    data.externalCandidateMatchLinks.length === 0 &&
    data.fileImportBalanceObservationDetails.length === 0 &&
    data.automationRules.length === 0 &&
    data.automationRuleConditions.length === 0 &&
    data.automationRuleActions.length === 0 &&
    data.recurringItems.length === 0 &&
    data.recurringItemTags.length === 0 &&
    data.recurringOccurrenceLinks.length === 0 &&
    data.recurringOccurrenceSkips.length === 0 &&
    targetTimeZoneOnly(data);

  if (
    userFactsAreEmpty &&
    data.books.length === 0 &&
    data.assets.length === 0 &&
    data.categories.length === 0 &&
    data.bookValuationSettings.length === 0 &&
    data.priceProviderMappings.length === 0 &&
    meta.length === 0
  ) {
    return "empty";
  }

  const expectedBooks = [
    {
      id: SEED_BOOK_ID,
      name: "Default Book",
      isDefault: true,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
  ];
  const expectedAssets = SEED_ASSETS.map((asset) => ({
    ...asset,
    isArchived: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  }));
  const expectedCategories = SEED_CATEGORIES.map((category) => ({
    ...category,
    bookId: SEED_BOOK_ID,
    parentId: null,
    isArchived: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  }));
  const expectedValuationSettings = [
    {
      bookId: SEED_BOOK_ID,
      homeAssetId: seedAssetId(SEED_DEFAULT_HOME_ASSET_CODE),
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
  ];
  const expectedProviderMappings = SEED_PROVIDER_MAPPINGS.map((mapping) => ({
    assetId: seedAssetId(mapping.assetCode),
    provider: mapping.provider,
    providerAssetKey: mapping.providerAssetKey,
    isEnabled: mapping.isEnabled,
    priority: mapping.priority,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  }));
  const isSeedOnly =
    userFactsAreEmpty &&
    sortedJson(data.books) === sortedJson(expectedBooks) &&
    sortedJson(data.assets) === sortedJson(expectedAssets) &&
    sortedJson(data.categories) === sortedJson(expectedCategories) &&
    sortedJson(data.bookValuationSettings) ===
      sortedJson(expectedValuationSettings) &&
    sortedJson(data.priceProviderMappings) ===
      sortedJson(expectedProviderMappings) &&
    JSON.stringify(meta) ===
      JSON.stringify([
        { key: "seed_schema_version", value: String(SEED_SCHEMA_VERSION) },
      ]);
  if (isSeedOnly) {
    return "seed-only";
  }
  throw new RestoreTargetError(
    "Restore requires an empty database or an unchanged seed-only database. Talli does not merge backup data.",
  );
}

function csvCell(value: string | null): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export class BackupService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  exportBackup(): BackupPayload {
    return parseBackupPayload({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: runtimeNow(this.runtime),
      data: readBackupData(this.context.db),
    });
  }

  parseJson(text: string): BackupPayload {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new BackupValidationError(
        "BACKUP_JSON_INVALID",
        "Backup file is not valid JSON.",
      );
    }
    return parseBackupPayload(value);
  }

  previewRestore(value: unknown): RestorePreview {
    const payload = parseBackupPayload(value);
    return {
      schemaVersion: payload.schemaVersion,
      exportedAt: payload.exportedAt,
      target: targetKind(this.context.db),
      summary: summary(payload.data),
    };
  }

  restore(value: unknown): RestorePreview {
    const payload = parseBackupPayload(value);
    return this.context.db.transaction(
      (transaction) => {
        const target = targetKind(transaction);
        clearRestoreTarget(transaction);
        insertBackupData(transaction, {
          ...payload.data,
          categories: categoriesParentFirst(payload.data.categories),
        });
        upsertAppMetaValue(
          transaction,
          "seed_schema_version",
          String(SEED_SCHEMA_VERSION),
        );
        const violations = this.context.sqlite.pragma(
          "foreign_key_check",
        ) as unknown[];
        if (violations.length > 0) {
          throw new BackupValidationError(
            "BACKUP_FOREIGN_KEY_CHECK",
            "Restored data failed SQLite foreign key verification.",
          );
        }
        const restored = summary(readBackupData(transaction));
        const expected = summary(payload.data);
        if (JSON.stringify(restored) !== JSON.stringify(expected)) {
          throw new BackupValidationError(
            "BACKUP_ROW_COUNT_MISMATCH",
            "Restored row counts do not match the backup.",
          );
        }
        return {
          schemaVersion: payload.schemaVersion,
          exportedAt: payload.exportedAt,
          target,
          summary: expected,
        };
      },
      { behavior: "immediate" },
    );
  }

  exportCsv(): string {
    const payload = this.exportBackup();
    const data = payload.data;
    const accounts = new Map(data.accounts.map((row) => [row.id, row]));
    const assets = new Map(data.assets.map((row) => [row.id, row]));
    const categories = new Map(data.categories.map((row) => [row.id, row]));
    const tags = new Map(data.tags.map((row) => [row.id, row]));
    const tagIds = new Map<string, string[]>();
    for (const eventTag of data.eventTags) {
      const values = tagIds.get(eventTag.eventId) ?? [];
      values.push(eventTag.tagId);
      tagIds.set(eventTag.eventId, values);
    }
    const entries = new Map<string, BackupData["ledgerEntries"]>();
    for (const entry of data.ledgerEntries) {
      const values = entries.get(entry.eventId) ?? [];
      values.push(entry);
      entries.set(entry.eventId, values);
    }
    const header = [
      "eventId",
      "eventType",
      "occurredAt",
      "payee",
      "note",
      "category",
      "tags",
      "entryId",
      "entryRole",
      "accountId",
      "account",
      "assetId",
      "assetCode",
      "amountAtomic",
      "amountDecimal",
    ];
    const rows = [header.join(",")];
    for (const event of data.ledgerEvents) {
      const category = event.categoryId
        ? (categories.get(event.categoryId)?.name ?? "")
        : "";
      const eventTagNames = (tagIds.get(event.id) ?? [])
        .map((tagId) => tags.get(tagId)?.name ?? "")
        .join("|");
      for (const entry of entries.get(event.id) ?? []) {
        const account = accounts.get(entry.accountId)!;
        const asset = assets.get(account.assetId)!;
        rows.push(
          [
            event.id,
            event.eventType,
            event.occurredAt,
            event.payee,
            event.note,
            category,
            eventTagNames,
            entry.id,
            entry.entryRole,
            account.id,
            account.name,
            asset.id,
            asset.code,
            entry.amountAtomic,
            formatAtomic(BigInt(entry.amountAtomic), asset.scale),
          ]
            .map((value) => csvCell(value))
            .join(","),
        );
      }
    }
    return `${rows.join("\r\n")}\r\n`;
  }
}
