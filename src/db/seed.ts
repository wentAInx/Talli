import { eq } from "drizzle-orm";

import type { DatabaseContext, DatabaseExecutor } from "./connection";
import {
  findAssetByCode,
  findAssetById,
  findBookById,
  findCategoryByDefinition,
  findCategoryById,
  findBookValuationSetting,
  findPriceProviderMapping,
  insertAsset,
  insertBook,
  insertCategory,
  listDefaultBooks,
  upsertBookValuationSetting,
  upsertPriceProviderMapping,
} from "./queries";
import {
  SEED_ASSETS,
  SEED_BOOK_ID,
  SEED_CATEGORIES,
  SEED_DEFAULT_HOME_ASSET_CODE,
  SEED_PROVIDER_MAPPINGS,
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

function seedValuationConfiguration(
  executor: DatabaseExecutor,
  bookId: string,
): void {
  if (!findBookValuationSetting(executor, bookId)) {
    const home = findAssetByCode(executor, SEED_DEFAULT_HOME_ASSET_CODE);
    if (home && home.assetType === "fiat" && !home.isArchived) {
      upsertBookValuationSetting(executor, {
        bookId,
        homeAssetId: home.id,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      });
    }
  }

  for (const definition of SEED_PROVIDER_MAPPINGS) {
    const asset = findAssetByCode(executor, definition.assetCode);
    if (!asset || asset.assetType !== definition.expectedAssetType) {
      continue;
    }
    if (findPriceProviderMapping(executor, asset.id, definition.provider)) {
      continue;
    }
    upsertPriceProviderMapping(executor, {
      assetId: asset.id,
      provider: definition.provider,
      providerAssetKey: definition.providerAssetKey,
      isEnabled: definition.isEnabled,
      priority: definition.priority,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    });
  }
}

export function seedDatabase(context: DatabaseContext): void {
  context.db.transaction(
    (transaction) => {
      const bookId = seedDefaultBook(transaction);
      seedAssets(transaction);
      seedCategories(transaction, bookId);
      seedValuationConfiguration(transaction, bookId);
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
