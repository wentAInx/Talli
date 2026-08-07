import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  assetHasAccounts,
  assetHasActiveAccounts,
  findAssetByCode,
  findAssetById,
  findCategoryById,
  findTagById,
  findTagByName,
  insertAsset,
  insertCategory,
  insertTag,
  listCategoriesForBook,
  listEventTypesForCategory,
  updateAsset,
  updateCategory,
  updateTag,
} from "../db/queries";
import type { AssetType } from "../domain/types";
import { assertService } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

interface AssetMutationInput {
  code: string;
  name: string;
  symbol?: string | null;
  assetType: AssetType;
  scale: number;
  sortOrder?: number;
}

interface CategoryMutationInput {
  bookId: string;
  name: string;
  categoryType: "expense" | "income" | "both";
  parentId?: string | null;
  sortOrder?: number;
}

function normalizedCode(code: string): string {
  const value = code.trim().toUpperCase();
  assertService(
    value.length > 0,
    "ASSET_CODE_REQUIRED",
    "Asset code is required.",
  );
  return value;
}

function normalizedName(name: string, code: string): string {
  const value = name.trim();
  assertService(value.length > 0, code, "Name is required.");
  return value;
}

function validateCategoryParent(
  executor: DatabaseExecutor,
  input: { bookId: string; categoryId?: string; parentId?: string | null },
): void {
  if (!input.parentId) {
    return;
  }
  assertService(
    input.parentId !== input.categoryId,
    "CATEGORY_PARENT_CYCLE",
    "Category cannot be its own parent.",
  );
  const categories = new Map(
    listCategoriesForBook(executor, input.bookId).map((category) => [
      category.id,
      category,
    ]),
  );
  assertService(
    categories.has(input.parentId),
    "CATEGORY_PARENT_NOT_FOUND",
    "Category parent was not found in this book.",
  );
  let current: string | null = input.parentId;
  const visited = new Set<string>();
  while (current) {
    assertService(
      !visited.has(current) && current !== input.categoryId,
      "CATEGORY_PARENT_CYCLE",
      "Category parent would create a cycle.",
    );
    visited.add(current);
    current = categories.get(current)?.parentId ?? null;
  }
}

export class ReferenceDataService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async createAsset(input: AssetMutationInput): Promise<string> {
    const code = normalizedCode(input.code);
    const name = normalizedName(input.name, "ASSET_NAME_REQUIRED");
    assertService(
      Number.isInteger(input.scale) && input.scale >= 0 && input.scale <= 30,
      "ASSET_SCALE_INVALID",
      "Asset scale must be an integer between 0 and 30.",
    );
    const id = this.runtime.id();
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        assertService(
          !findAssetByCode(transaction, code),
          "ASSET_CODE_EXISTS",
          "Asset code already exists.",
        );
        insertAsset(transaction, {
          id,
          code,
          name,
          symbol: input.symbol?.trim() || null,
          assetType: input.assetType,
          scale: input.scale,
          isArchived: false,
          sortOrder: input.sortOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
    return id;
  }

  async updateAsset(assetId: string, input: AssetMutationInput): Promise<void> {
    const code = normalizedCode(input.code);
    const name = normalizedName(input.name, "ASSET_NAME_REQUIRED");
    assertService(
      Number.isInteger(input.scale) && input.scale >= 0 && input.scale <= 30,
      "ASSET_SCALE_INVALID",
      "Asset scale must be an integer between 0 and 30.",
    );
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        const asset = findAssetById(transaction, assetId);
        assertService(asset, "ASSET_NOT_FOUND", "Asset was not found.");
        const codeOwner = findAssetByCode(transaction, code);
        assertService(
          !codeOwner || codeOwner.id === assetId,
          "ASSET_CODE_EXISTS",
          "Asset code already exists.",
        );
        if (assetHasAccounts(transaction, assetId)) {
          assertService(
            asset.assetType === input.assetType && asset.scale === input.scale,
            "ASSET_FACTS_LOCKED",
            "Asset type and scale are locked after an account references the asset.",
          );
        }
        updateAsset(transaction, assetId, {
          code,
          name,
          symbol: input.symbol?.trim() || null,
          assetType: input.assetType,
          scale: input.scale,
          sortOrder: input.sortOrder ?? 0,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
  }

  async setAssetArchived(assetId: string, isArchived: boolean): Promise<void> {
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        const asset = findAssetById(transaction, assetId);
        assertService(asset, "ASSET_NOT_FOUND", "Asset was not found.");
        if (isArchived) {
          assertService(
            !assetHasActiveAccounts(transaction, assetId),
            "ASSET_HAS_ACTIVE_ACCOUNTS",
            "Archive every account for this asset before archiving the asset.",
          );
        }
        updateAsset(transaction, assetId, { isArchived, updatedAt: now });
      },
      { behavior: "immediate" },
    );
  }

  async createCategory(input: CategoryMutationInput): Promise<string> {
    const name = normalizedName(input.name, "CATEGORY_NAME_REQUIRED");
    const id = this.runtime.id();
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        validateCategoryParent(transaction, {
          bookId: input.bookId,
          parentId: input.parentId,
        });
        insertCategory(transaction, {
          id,
          bookId: input.bookId,
          parentId: input.parentId ?? null,
          name,
          categoryType: input.categoryType,
          isArchived: false,
          sortOrder: input.sortOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
    return id;
  }

  async updateCategory(
    categoryId: string,
    input: CategoryMutationInput,
  ): Promise<void> {
    const name = normalizedName(input.name, "CATEGORY_NAME_REQUIRED");
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        const category = findCategoryById(transaction, categoryId);
        assertService(
          category,
          "CATEGORY_NOT_FOUND",
          "Category was not found.",
        );
        assertService(
          category.bookId === input.bookId,
          "CATEGORY_BOOK_MISMATCH",
          "Category belongs to another book.",
        );
        validateCategoryParent(transaction, {
          bookId: input.bookId,
          categoryId,
          parentId: input.parentId,
        });
        for (const usage of listEventTypesForCategory(
          transaction,
          categoryId,
        )) {
          assertService(
            input.categoryType === "both" ||
              usage.eventType === input.categoryType,
            "CATEGORY_FACTS_LOCKED",
            "Category type is incompatible with existing transactions.",
          );
        }
        updateCategory(transaction, categoryId, {
          parentId: input.parentId ?? null,
          name,
          categoryType: input.categoryType,
          sortOrder: input.sortOrder ?? 0,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
  }

  async setCategoryArchived(
    categoryId: string,
    isArchived: boolean,
  ): Promise<void> {
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        assertService(
          findCategoryById(transaction, categoryId),
          "CATEGORY_NOT_FOUND",
          "Category was not found.",
        );
        updateCategory(transaction, categoryId, { isArchived, updatedAt: now });
      },
      { behavior: "immediate" },
    );
  }

  async createTag(bookId: string, nameInput: string): Promise<string> {
    const name = normalizedName(nameInput, "TAG_NAME_REQUIRED");
    const id = this.runtime.id();
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        assertService(
          !findTagByName(transaction, bookId, name),
          "TAG_NAME_EXISTS",
          "Tag name already exists.",
        );
        insertTag(transaction, {
          id,
          bookId,
          name,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
    return id;
  }

  async updateTag(tagId: string, nameInput: string): Promise<void> {
    const name = normalizedName(nameInput, "TAG_NAME_REQUIRED");
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        const tag = findTagById(transaction, tagId);
        assertService(tag, "TAG_NOT_FOUND", "Tag was not found.");
        const owner = findTagByName(transaction, tag.bookId, name);
        assertService(
          !owner || owner.id === tagId,
          "TAG_NAME_EXISTS",
          "Tag name already exists.",
        );
        updateTag(transaction, tagId, { name, updatedAt: now });
      },
      { behavior: "immediate" },
    );
  }

  async setTagArchived(tagId: string, isArchived: boolean): Promise<void> {
    const now = runtimeNow(this.runtime);
    this.context.db.transaction(
      (transaction) => {
        assertService(
          findTagById(transaction, tagId),
          "TAG_NOT_FOUND",
          "Tag was not found.",
        );
        updateTag(transaction, tagId, { isArchived, updatedAt: now });
      },
      { behavior: "immediate" },
    );
  }
}
