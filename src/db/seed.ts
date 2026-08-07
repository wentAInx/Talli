import { eq } from "drizzle-orm";

import type { DatabaseContext, DatabaseExecutor } from "./connection";
import {
  findAssetByCode,
  findAssetById,
  findBookById,
  findCategoryByDefinition,
  findCategoryById,
  insertAsset,
  insertBook,
  insertCategory,
  listDefaultBooks,
} from "./queries";
import {
  SEED_ASSETS,
  SEED_BOOK_ID,
  SEED_CATEGORIES,
  SEED_SCHEMA_VERSION,
  SEED_TIMESTAMP,
} from "./seed-data";
import { appMeta } from "./schema";

export class SeedConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedConflictError";
  }
}

function seedDefaultBook(executor: DatabaseExecutor): string {
  const defaultBooks = listDefaultBooks(executor);
  if (defaultBooks.length > 1) {
    throw new SeedConflictError(
      "More than one default book exists; seed cannot choose implicitly.",
    );
  }
  if (defaultBooks.length === 1) {
    return defaultBooks[0].id;
  }

  const occupiedId = findBookById(executor, SEED_BOOK_ID);
  if (occupiedId) {
    throw new SeedConflictError(
      `Seed book id ${SEED_BOOK_ID} is occupied by a non-default book.`,
    );
  }

  insertBook(executor, {
    id: SEED_BOOK_ID,
    name: "Default Book",
    isDefault: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  });
  return SEED_BOOK_ID;
}

function seedAssets(executor: DatabaseExecutor): void {
  for (const definition of SEED_ASSETS) {
    const existingById = findAssetById(executor, definition.id);
    if (existingById) {
      if (
        existingById.assetType !== definition.assetType ||
        existingById.scale !== definition.scale
      ) {
        throw new SeedConflictError(
          `Seed asset ${definition.id} has incompatible type or scale.`,
        );
      }
      continue;
    }

    const existing = findAssetByCode(executor, definition.code);
    if (existing) {
      if (
        existing.assetType !== definition.assetType ||
        existing.scale !== definition.scale
      ) {
        throw new SeedConflictError(
          `Asset ${definition.code} exists with incompatible type or scale.`,
        );
      }
      continue;
    }

    insertAsset(executor, {
      ...definition,
      isArchived: false,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    });
  }
}

function seedCategories(executor: DatabaseExecutor, bookId: string): void {
  for (const definition of SEED_CATEGORIES) {
    const existingById = findCategoryById(executor, definition.id);
    if (existingById) {
      if (existingById.bookId !== bookId) {
        throw new SeedConflictError(
          `Seed category ${definition.id} belongs to another book.`,
        );
      }
      continue;
    }

    const existing = findCategoryByDefinition(executor, {
      bookId,
      name: definition.name,
      categoryType: definition.categoryType,
    });
    if (existing) {
      continue;
    }

    insertCategory(executor, {
      ...definition,
      bookId,
      parentId: null,
      isArchived: false,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    });
  }
}

function recordSeedVersion(executor: DatabaseExecutor): void {
  executor
    .insert(appMeta)
    .values({ key: "seed_schema_version", value: String(SEED_SCHEMA_VERSION) })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: String(SEED_SCHEMA_VERSION) },
    })
    .run();
}

export function seedDatabase(context: DatabaseContext): void {
  context.db.transaction(
    (transaction) => {
      const bookId = seedDefaultBook(transaction);
      seedAssets(transaction);
      seedCategories(transaction, bookId);
      recordSeedVersion(transaction);
    },
    { behavior: "immediate" },
  );
}

export function readSeedVersion(executor: DatabaseExecutor): string | null {
  return (
    executor
      .select({ value: appMeta.value })
      .from(appMeta)
      .where(eq(appMeta.key, "seed_schema_version"))
      .get()?.value ?? null
  );
}
