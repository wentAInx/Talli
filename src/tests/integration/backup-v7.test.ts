import { afterEach, describe, expect, it } from "vitest";

import { insertAccount, readBackupData } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { BackupValidationError } from "../../domain/backup";
import { AutomationRuleService } from "../../services/automation-rule-service";
import { BackupService } from "../../services/backup-service";
import { RecurringItemService } from "../../services/recurring-item-service";
import { ReferenceDataService } from "../../services/reference-data-service";
import {
  createTestDatabase,
  deterministicRuntime,
  type TestDatabase,
} from "./test-database";

const NOW = "2026-08-15T08:00:00.000Z";
const BOOK_ID = "seed-book-default";
const ACCOUNT_ID = "backup-v7-usd";
const CATEGORY_ID = "seed-category-expense-subscriptions";

describe("Backup schemaVersion 7 automation and recurring facts", () => {
  const databases: TestDatabase[] = [];

  afterEach(() => {
    for (const database of databases.splice(0).reverse()) database.close();
  });

  function sourceFixture() {
    const source = createTestDatabase();
    databases.push(source);
    seedDatabase(source.context);
    insertAccount(source.context.db, {
      id: ACCOUNT_ID,
      bookId: BOOK_ID,
      assetId: "seed-asset-usd",
      name: "Backup V7 checking",
      accountType: "bank",
      institutionName: null,
      note: null,
      isArchived: false,
      sortOrder: 10,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const runtime = deterministicRuntime(NOW);
    const references = new ReferenceDataService(source.context, runtime);
    const tagId = references.createTag(BOOK_ID, "Backup V7");
    return Promise.resolve(tagId).then((resolvedTagId) => {
      new AutomationRuleService(source.context, runtime).save({
        bookId: BOOK_ID,
        name: "Subscription projection",
        stage: "default",
        matchMode: "all",
        isEnabled: true,
        sortOrder: 100,
        conditions: [{ field: "direction", operator: "equals", value: "out" }],
        actions: [
          { actionType: "set_payee", value: "Netflix" },
          { actionType: "set_category", value: CATEGORY_ID },
          { actionType: "add_tag", value: resolvedTagId },
          { actionType: "suggest_event_type", value: "expense" },
        ],
      });
      const recurring = new RecurringItemService(source.context, runtime);
      const recurringItemId = recurring.save({
        bookId: BOOK_ID,
        accountId: ACCOUNT_ID,
        name: "Daily backup fixture",
        eventType: "expense",
        payeeText: "Netflix",
        payeeMatchMode: "exact",
        categoryId: CATEGORY_ID,
        tagIds: [resolvedTagId],
        note: "Definition, not Ledger truth",
        amountMode: "range",
        minAmount: "15.00",
        maxAmount: "18.00",
        frequency: "daily",
        intervalCount: 1,
        anchorDate: "2026-08-15",
        dateWindowBeforeDays: 2,
        dateWindowAfterDays: 2,
        isActive: true,
      });
      recurring.postOccurrence({
        recurringItemId,
        occurrenceDate: "2026-08-15",
        actualAmount: "16.49",
        occurredAt: "2026-08-15T04:00:00.000Z",
        confirmed: true,
      });
      recurring.skip({
        recurringItemId,
        occurrenceDate: "2026-08-16",
        note: "Explicit skip",
      });
      return { source, recurringItemId, tagId: resolvedTagId };
    });
  }

  it("round-trips definitions, tags, links, and skips while excluding derived data", async () => {
    const { source } = await sourceFixture();
    const payload = new BackupService(source.context).exportBackup();
    expect(payload.schemaVersion).toBe(7);
    expect(payload.data.automationRules).toHaveLength(1);
    expect(payload.data.automationRuleConditions).toHaveLength(1);
    expect(payload.data.automationRuleActions).toHaveLength(4);
    expect(payload.data.recurringItems).toHaveLength(1);
    expect(payload.data.recurringItemTags).toHaveLength(1);
    expect(payload.data.recurringOccurrenceLinks).toHaveLength(1);
    expect(payload.data.recurringOccurrenceSkips).toHaveLength(1);
    expect(Object.keys(payload.data)).not.toEqual(
      expect.arrayContaining([
        "automationProjections",
        "rulePreviewResults",
        "recurringMatchSuggestions",
        "generatedOccurrences",
      ]),
    );

    const target = createTestDatabase();
    databases.push(target);
    const preview = new BackupService(target.context).restore(payload);
    expect(preview.schemaVersion).toBe(7);
    const restored = readBackupData(target.context.db);
    for (const key of [
      "automationRules",
      "automationRuleConditions",
      "automationRuleActions",
      "recurringItems",
      "recurringItemTags",
      "recurringOccurrenceLinks",
      "recurringOccurrenceSkips",
    ] as const) {
      expect(restored[key]).toEqual(payload.data[key]);
    }
  });

  it("upgrades an exact schemaVersion 6 payload with empty V7 arrays", async () => {
    const { source } = await sourceFixture();
    const current = new BackupService(source.context).exportBackup();
    const {
      automationRules: _rules,
      automationRuleConditions: _conditions,
      automationRuleActions: _actions,
      recurringItems: _items,
      recurringItemTags: _tags,
      recurringOccurrenceLinks: _links,
      recurringOccurrenceSkips: _skips,
      ...v6Data
    } = current.data;
    expect([
      _rules,
      _conditions,
      _actions,
      _items,
      _tags,
      _links,
      _skips,
    ]).toEqual(expect.arrayContaining([expect.any(Array)]));
    const parsed = new BackupService(source.context).parseJson(
      JSON.stringify({ ...current, schemaVersion: 6, data: v6Data }),
    );
    expect(parsed.schemaVersion).toBe(7);
    expect(parsed.data.automationRules).toEqual([]);
    expect(parsed.data.recurringItems).toEqual([]);
    expect(parsed.data.recurringOccurrenceLinks).toEqual([]);
  });

  it("rejects incompatible operators and cross-book or missing rule references", async () => {
    const { source } = await sourceFixture();
    const payload = new BackupService(source.context).exportBackup();
    const badOperator = structuredClone(payload);
    (
      badOperator.data.automationRuleConditions[0] as { operator: string }
    ).operator = "contains";
    const missingCategory = structuredClone(payload);
    const categoryAction = missingCategory.data.automationRuleActions.find(
      (action) => action.actionType === "set_category",
    )!;
    categoryAction.valueJson = JSON.stringify("missing-category");
    for (const invalid of [badOperator, missingCategory]) {
      expect(() =>
        new BackupService(source.context).parseJson(JSON.stringify(invalid)),
      ).toThrow(BackupValidationError);
    }
  });

  it("rejects invalid atomic definitions, occurrence dates, and link-skip conflicts", async () => {
    const { source } = await sourceFixture();
    const payload = new BackupService(source.context).exportBackup();
    const zeroAmount = structuredClone(payload);
    zeroAmount.data.recurringItems[0]!.minAmountAtomicText = "0";
    const badOccurrence = structuredClone(payload);
    badOccurrence.data.recurringOccurrenceLinks[0]!.occurrenceDate =
      "2026-02-30";
    const conflict = structuredClone(payload);
    conflict.data.recurringOccurrenceSkips.push({
      recurringItemId:
        conflict.data.recurringOccurrenceLinks[0]!.recurringItemId,
      occurrenceDate: conflict.data.recurringOccurrenceLinks[0]!.occurrenceDate,
      skippedAt: NOW,
      note: "Conflicting decision",
    });
    for (const invalid of [zeroAmount, badOccurrence, conflict]) {
      expect(() =>
        new BackupService(source.context).parseJson(JSON.stringify(invalid)),
      ).toThrow(BackupValidationError);
    }
  });

  it("rolls every V1-V7 row back after a late recurring insert failure", async () => {
    const { source } = await sourceFixture();
    const payload = new BackupService(source.context).exportBackup();
    const target = createTestDatabase();
    databases.push(target);
    target.context.sqlite.exec(`
      CREATE TRIGGER force_final_v7_restore_failure
      BEFORE INSERT ON recurring_occurrence_skips
      BEGIN
        SELECT RAISE(ABORT, 'forced final V7 restore failure');
      END;
    `);
    expect(() => new BackupService(target.context).restore(payload)).toThrow(
      "forced final V7 restore failure",
    );
    const restored = readBackupData(target.context.db);
    expect(restored.books).toEqual([]);
    expect(restored.ledgerEvents).toEqual([]);
    expect(restored.automationRules).toEqual([]);
    expect(restored.recurringItems).toEqual([]);
    expect(restored.recurringOccurrenceLinks).toEqual([]);
    expect(restored.recurringOccurrenceSkips).toEqual([]);
  });
});
