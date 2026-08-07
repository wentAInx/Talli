import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findAssetById, findCategoryById, findTagById } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { SEED_BOOK_ID, SEED_CATEGORIES, seedAssetId } from "../../db/seed-data";
import { AccountService } from "../../services/account-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { ReferenceDataService } from "../../services/reference-data-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("reference data settings service", () => {
  let database: TestDatabase;
  let references: ReferenceDataService;
  let accounts: AccountService;
  let ledger: LedgerCommandService;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
    const runtime = deterministicRuntime("2026-08-07T10:00:00.000Z");
    references = new ReferenceDataService(database.context, runtime);
    accounts = new AccountService(database.context, runtime);
    ledger = new LedgerCommandService(database.context, runtime);
  });

  afterEach(() => {
    database.close();
  });

  it("creates assets and locks type/scale after an account reference", async () => {
    const assetId = await references.createAsset({
      code: "jpy",
      name: "Japanese Yen",
      symbol: "¥",
      assetType: "fiat",
      scale: 0,
    });
    expect(findAssetById(database.context.db, assetId)).toMatchObject({
      code: "JPY",
      scale: 0,
    });
    await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId,
      name: "JPY cash",
      accountType: "cash",
    });

    await expect(
      references.updateAsset(assetId, {
        code: "JPY",
        name: "Yen",
        assetType: "fiat",
        scale: 2,
      }),
    ).rejects.toMatchObject({ code: "ASSET_FACTS_LOCKED" });
    await expect(
      references.setAssetArchived(assetId, true),
    ).rejects.toMatchObject({ code: "ASSET_HAS_ACTIVE_ACCOUNTS" });
    expect(findAssetById(database.context.db, assetId)?.scale).toBe(0);
  });

  it("rejects category cycles and incompatible historical type changes", async () => {
    const parent = await references.createCategory({
      bookId: SEED_BOOK_ID,
      name: "Parent",
      categoryType: "expense",
    });
    const child = await references.createCategory({
      bookId: SEED_BOOK_ID,
      name: "Child",
      categoryType: "expense",
      parentId: parent,
    });
    await expect(
      references.updateCategory(parent, {
        bookId: SEED_BOOK_ID,
        name: "Parent",
        categoryType: "expense",
        parentId: child,
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_PARENT_CYCLE" });

    const cny = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: seedAssetId("CNY"),
      name: "CNY",
      accountType: "cash",
    });
    const dining = SEED_CATEGORIES.find(
      (category) => category.name === "餐饮",
    )!.id;
    await ledger.createExpense({
      accountId: cny,
      amount: "1",
      categoryId: dining,
      occurredAt: "2026-08-08T00:00:00.000Z",
    });
    await expect(
      references.updateCategory(dining, {
        bookId: SEED_BOOK_ID,
        name: "餐饮",
        categoryType: "income",
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_FACTS_LOCKED" });
    expect(findCategoryById(database.context.db, dining)?.categoryType).toBe(
      "expense",
    );
  });

  it("enforces tag uniqueness and archives without deleting history", async () => {
    const tagId = await references.createTag(SEED_BOOK_ID, "差旅");
    await expect(
      references.createTag(SEED_BOOK_ID, "差旅"),
    ).rejects.toMatchObject({ code: "TAG_NAME_EXISTS" });
    await references.updateTag(tagId, "商务差旅");
    await references.setTagArchived(tagId, true);
    expect(findTagById(database.context.db, tagId)).toMatchObject({
      name: "商务差旅",
      isArchived: true,
    });
  });

  it("reports asset lock and archive preconditions for settings UI", async () => {
    const cnyId = seedAssetId("CNY");
    const before = references
      .getSettingsData()
      .assets.find((asset) => asset.id === cnyId);
    expect(before).toMatchObject({
      factsLocked: false,
      hasActiveAccounts: false,
    });

    const accountId = await accounts.createAccount({
      bookId: SEED_BOOK_ID,
      assetId: cnyId,
      name: "CNY settings lock",
      accountType: "cash",
    });
    expect(
      references.getSettingsData().assets.find((asset) => asset.id === cnyId),
    ).toMatchObject({ factsLocked: true, hasActiveAccounts: true });

    await accounts.setArchived(accountId, true);
    expect(
      references.getSettingsData().assets.find((asset) => asset.id === cnyId),
    ).toMatchObject({ factsLocked: true, hasActiveAccounts: false });
  });
});
