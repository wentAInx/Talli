import { z } from "zod";

import {
  buildExchangeEntries,
  buildExpenseEntries,
  buildIncomeEntries,
  buildTransferEntries,
} from "./ledger";
import { assertIanaTimeZone, canonicalUtcInstantValue } from "./time";
import type { LedgerEntryDraft } from "./types";

export const BACKUP_FORMAT = "multi-asset-ledger-backup";
export const BACKUP_SCHEMA_VERSION = 1;

export class BackupValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BackupValidationError";
  }
}

const id = z.string().trim().min(1).max(255);
const nullableText = z.string().nullable();
const canonicalInstant = z.string().refine((value) => {
  try {
    canonicalUtcInstantValue(value);
    return true;
  } catch {
    return false;
  }
}, "Timestamp must use canonical UTC ISO format.");
const atomicText = z
  .string()
  .regex(/^-?\d+$/, "Atomic amount must be signed integer text.");
const jsonText = z.string().refine((value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}, "Setting valueJson must contain valid JSON.");

const bookSchema = z
  .object({
    id,
    name: z.string(),
    isDefault: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const assetSchema = z
  .object({
    id,
    code: z.string().trim().min(1).max(30),
    name: z.string(),
    symbol: nullableText,
    assetType: z.enum(["fiat", "crypto", "custom"]),
    scale: z.number().int().min(0).max(30),
    isArchived: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const accountSchema = z
  .object({
    id,
    bookId: id,
    assetId: id,
    name: z.string(),
    accountType: z.enum([
      "cash",
      "bank",
      "ewallet",
      "exchange",
      "crypto_wallet",
      "credit",
      "loan",
      "other",
    ]),
    institutionName: nullableText,
    note: nullableText,
    isArchived: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const categorySchema = z
  .object({
    id,
    bookId: id,
    parentId: id.nullable(),
    name: z.string(),
    categoryType: z.enum(["expense", "income", "both"]),
    isArchived: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const tagSchema = z
  .object({
    id,
    bookId: id,
    name: z.string(),
    isArchived: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const ledgerEventSchema = z
  .object({
    id,
    bookId: id,
    eventType: z.enum(["expense", "income", "transfer", "exchange"]),
    occurredAt: canonicalInstant,
    categoryId: id.nullable(),
    payee: nullableText,
    note: nullableText,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const ledgerEntrySchema = z
  .object({
    id,
    eventId: id,
    accountId: id,
    entryRole: z.enum(["main", "source", "destination", "fee"]),
    amountAtomic: atomicText,
    createdAt: canonicalInstant,
  })
  .strict();

const eventTagSchema = z.object({ eventId: id, tagId: id }).strict();

const snapshotSchema = z
  .object({
    id,
    accountId: id,
    asOf: canonicalInstant,
    balanceAtomic: atomicText,
    note: nullableText,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const settingSchema = z
  .object({ key: id, valueJson: jsonText, updatedAt: canonicalInstant })
  .strict();

export const backupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: z
      .object({
        books: z.array(bookSchema),
        assets: z.array(assetSchema),
        accounts: z.array(accountSchema),
        categories: z.array(categorySchema),
        tags: z.array(tagSchema),
        ledgerEvents: z.array(ledgerEventSchema),
        ledgerEntries: z.array(ledgerEntrySchema),
        eventTags: z.array(eventTagSchema),
        balanceSnapshots: z.array(snapshotSchema),
        settings: z.array(settingSchema),
      })
      .strict(),
  })
  .strict();

export type BackupPayload = z.infer<typeof backupPayloadSchema>;
export type BackupData = BackupPayload["data"];

function fail(code: string, message: string): never {
  throw new BackupValidationError(code, message);
}

function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const candidate = key(value);
    if (seen.has(candidate)) {
      fail(
        "BACKUP_DUPLICATE_KEY",
        `Backup contains duplicate ${label}: ${candidate}.`,
      );
    }
    seen.add(candidate);
  }
}

function sameEntries(
  actual: readonly BackupData["ledgerEntries"][number][],
  expected: readonly LedgerEntryDraft[],
): boolean {
  const key = (entry: {
    accountId: string;
    entryRole?: string;
    role?: string;
    amountAtomic: string | bigint;
  }) =>
    `${entry.entryRole ?? entry.role}\u0000${entry.accountId}\u0000${entry.amountAtomic}`;
  return (
    actual.length === expected.length &&
    actual.map(key).sort().join("\n") === expected.map(key).sort().join("\n")
  );
}

function validateEventEntries(data: BackupData): void {
  const accounts = new Map(
    data.accounts.map((account) => [account.id, account]),
  );
  const grouped = new Map<string, BackupData["ledgerEntries"]>();
  for (const entry of data.ledgerEntries) {
    const entries = grouped.get(entry.eventId) ?? [];
    entries.push(entry);
    grouped.set(entry.eventId, entries);
  }

  for (const event of data.ledgerEvents) {
    const entries = grouped.get(event.id) ?? [];
    const byRole = (role: BackupData["ledgerEntries"][number]["entryRole"]) =>
      entries.filter((entry) => entry.entryRole === role);
    try {
      let expected: LedgerEntryDraft[];
      if (event.eventType === "expense" || event.eventType === "income") {
        const main = byRole("main");
        if (main.length !== 1 || entries.length !== 1) {
          fail(
            "BACKUP_EVENT_INVARIANT",
            `${event.eventType} event ${event.id} must contain one main entry.`,
          );
        }
        const account = accounts.get(main[0].accountId)!;
        const amount = BigInt(main[0].amountAtomic);
        expected =
          event.eventType === "expense"
            ? buildExpenseEntries({
                account: { id: account.id, assetId: account.assetId },
                amountAtomic: -amount,
              })
            : buildIncomeEntries({
                account: { id: account.id, assetId: account.assetId },
                amountAtomic: amount,
              });
      } else {
        const source = byRole("source");
        const destination = byRole("destination");
        const fees = byRole("fee");
        if (
          source.length !== 1 ||
          destination.length !== 1 ||
          fees.length > 1 ||
          entries.length !== 2 + fees.length
        ) {
          fail(
            "BACKUP_EVENT_INVARIANT",
            `${event.eventType} event ${event.id} has invalid role cardinality.`,
          );
        }
        const sourceAccount = accounts.get(source[0].accountId)!;
        const destinationAccount = accounts.get(destination[0].accountId)!;
        const fee = fees[0];
        const feeAccount = fee ? accounts.get(fee.accountId)! : null;
        const feeDraft =
          fee && feeAccount
            ? {
                account: { id: feeAccount.id, assetId: feeAccount.assetId },
                amountAtomic: -BigInt(fee.amountAtomic),
              }
            : undefined;
        expected =
          event.eventType === "transfer"
            ? buildTransferEntries({
                sourceAccount: {
                  id: sourceAccount.id,
                  assetId: sourceAccount.assetId,
                },
                destinationAccount: {
                  id: destinationAccount.id,
                  assetId: destinationAccount.assetId,
                },
                amountAtomic: BigInt(destination[0].amountAtomic),
                fee: feeDraft,
              })
            : buildExchangeEntries({
                sourceAccount: {
                  id: sourceAccount.id,
                  assetId: sourceAccount.assetId,
                },
                sourceAmountAtomic: -BigInt(source[0].amountAtomic),
                destinationAccount: {
                  id: destinationAccount.id,
                  assetId: destinationAccount.assetId,
                },
                destinationAmountAtomic: BigInt(destination[0].amountAtomic),
                fee: feeDraft,
              });
      }
      if (!sameEntries(entries, expected)) {
        fail(
          "BACKUP_EVENT_INVARIANT",
          `Event ${event.id} entries do not match its ledger invariants.`,
        );
      }
    } catch (error) {
      if (error instanceof BackupValidationError) {
        throw error;
      }
      fail(
        "BACKUP_EVENT_INVARIANT",
        `Event ${event.id} entries do not match its ledger invariants.`,
      );
    }
  }
}

function validateRelations(data: BackupData): void {
  uniqueBy(data.books, (row) => row.id, "book id");
  uniqueBy(data.assets, (row) => row.id, "asset id");
  uniqueBy(
    data.assets,
    (row) => row.code.toLocaleLowerCase("en-US"),
    "asset code",
  );
  uniqueBy(data.accounts, (row) => row.id, "account id");
  uniqueBy(data.categories, (row) => row.id, "category id");
  uniqueBy(data.tags, (row) => row.id, "tag id");
  uniqueBy(data.tags, (row) => `${row.bookId}\u0000${row.name}`, "tag name");
  uniqueBy(data.ledgerEvents, (row) => row.id, "event id");
  uniqueBy(data.ledgerEntries, (row) => row.id, "entry id");
  uniqueBy(
    data.eventTags,
    (row) => `${row.eventId}\u0000${row.tagId}`,
    "event-tag pair",
  );
  uniqueBy(data.balanceSnapshots, (row) => row.id, "snapshot id");
  uniqueBy(
    data.balanceSnapshots,
    (row) => `${row.accountId}\u0000${row.asOf}`,
    "account snapshot time",
  );
  uniqueBy(data.settings, (row) => row.key, "setting key");

  if (data.books.filter((book) => book.isDefault).length !== 1) {
    fail(
      "BACKUP_DEFAULT_BOOK",
      "Backup must contain exactly one default book.",
    );
  }
  const books = new Map(data.books.map((row) => [row.id, row]));
  const assets = new Map(data.assets.map((row) => [row.id, row]));
  const accounts = new Map(data.accounts.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  const tags = new Map(data.tags.map((row) => [row.id, row]));
  const events = new Map(data.ledgerEvents.map((row) => [row.id, row]));

  for (const category of data.categories) {
    if (!books.has(category.bookId)) {
      fail(
        "BACKUP_RELATION",
        `Category ${category.id} references a missing book.`,
      );
    }
    if (category.parentId) {
      const parent = categories.get(category.parentId);
      if (
        !parent ||
        parent.bookId !== category.bookId ||
        parent.id === category.id
      ) {
        fail(
          "BACKUP_CATEGORY_TREE",
          `Category ${category.id} has an invalid parent.`,
        );
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitCategory = (categoryId: string): void => {
    if (visiting.has(categoryId)) {
      fail(
        "BACKUP_CATEGORY_TREE",
        "Backup category hierarchy contains a cycle.",
      );
    }
    if (visited.has(categoryId)) {
      return;
    }
    visiting.add(categoryId);
    const parentId = categories.get(categoryId)?.parentId;
    if (parentId) {
      visitCategory(parentId);
    }
    visiting.delete(categoryId);
    visited.add(categoryId);
  };
  for (const category of data.categories) {
    visitCategory(category.id);
  }

  for (const tag of data.tags) {
    if (!books.has(tag.bookId)) {
      fail("BACKUP_RELATION", `Tag ${tag.id} references a missing book.`);
    }
  }
  for (const account of data.accounts) {
    if (!books.has(account.bookId) || !assets.has(account.assetId)) {
      fail(
        "BACKUP_RELATION",
        `Account ${account.id} has a missing book or asset.`,
      );
    }
  }
  for (const event of data.ledgerEvents) {
    if (!books.has(event.bookId)) {
      fail("BACKUP_RELATION", `Event ${event.id} references a missing book.`);
    }
    if (event.categoryId) {
      const category = categories.get(event.categoryId);
      if (!category || category.bookId !== event.bookId) {
        fail("BACKUP_RELATION", `Event ${event.id} has an invalid category.`);
      }
      if (
        (event.eventType === "expense" && category.categoryType === "income") ||
        (event.eventType === "income" && category.categoryType === "expense") ||
        event.eventType === "transfer" ||
        event.eventType === "exchange"
      ) {
        fail(
          "BACKUP_EVENT_INVARIANT",
          `Event ${event.id} category is not applicable.`,
        );
      }
    }
  }
  for (const entry of data.ledgerEntries) {
    const event = events.get(entry.eventId);
    const account = accounts.get(entry.accountId);
    if (!event || !account || event.bookId !== account.bookId) {
      fail(
        "BACKUP_RELATION",
        `Entry ${entry.id} has an invalid event or account.`,
      );
    }
  }
  for (const eventTag of data.eventTags) {
    const event = events.get(eventTag.eventId);
    const tag = tags.get(eventTag.tagId);
    if (!event || !tag || event.bookId !== tag.bookId) {
      fail(
        "BACKUP_RELATION",
        "Event-tag relation crosses a book or is missing.",
      );
    }
  }
  for (const snapshot of data.balanceSnapshots) {
    if (!accounts.has(snapshot.accountId)) {
      fail(
        "BACKUP_RELATION",
        `Snapshot ${snapshot.id} references a missing account.`,
      );
    }
  }
  for (const setting of data.settings) {
    if (setting.key === "app_timezone") {
      const value = JSON.parse(setting.valueJson) as unknown;
      if (typeof value !== "string") {
        fail(
          "BACKUP_SETTING_INVALID",
          "app_timezone setting must contain a JSON string.",
        );
      }
      try {
        assertIanaTimeZone(value);
      } catch {
        fail(
          "BACKUP_SETTING_INVALID",
          "app_timezone setting must contain a valid IANA timezone.",
        );
      }
    }
  }
  validateEventEntries(data);
}

export function parseBackupPayload(value: unknown): BackupPayload {
  const result = backupPayloadSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BackupValidationError(
      "BACKUP_SCHEMA_INVALID",
      `Backup schema is invalid at ${issue?.path.join(".") || "root"}: ${
        issue?.message ?? "unknown error"
      }`,
    );
  }
  validateRelations(result.data.data);
  return result.data;
}

export function categoriesParentFirst(
  categories: readonly BackupData["categories"][number][],
): BackupData["categories"] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const ordered: BackupData["categories"] = [];
  const visited = new Set<string>();
  const visit = (category: BackupData["categories"][number]): void => {
    if (visited.has(category.id)) {
      return;
    }
    if (category.parentId) {
      visit(byId.get(category.parentId)!);
    }
    visited.add(category.id);
    ordered.push(category);
  };
  for (const category of categories) {
    visit(category);
  }
  return ordered;
}
