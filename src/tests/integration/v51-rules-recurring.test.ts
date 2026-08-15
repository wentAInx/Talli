import { afterEach, describe, expect, it } from "vitest";

import {
  findCategoryById,
  insertAccount,
  readBackupData,
} from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import type { CsvImportConfig } from "../../domain/file-import";
import { AccountService } from "../../services/account-service";
import { AutomationProjectionService } from "../../services/automation-projection-service";
import { AutomationRuleService } from "../../services/automation-rule-service";
import { BackupService } from "../../services/backup-service";
import { ExternalImportService } from "../../services/external-import-service";
import { FileImportReadService } from "../../services/file-import-read-service";
import { FileImportService } from "../../services/file-import-service";
import { LedgerCommandService } from "../../services/ledger-command-service";
import { RecurringItemService } from "../../services/recurring-item-service";
import { RecurringMatchService } from "../../services/recurring-match-service";
import { ReferenceDataService } from "../../services/reference-data-service";
import { SettingsService } from "../../services/settings-service";
import {
  createTestDatabase,
  deterministicRuntime,
  type TestDatabase,
} from "./test-database";

const NOW = "2026-08-15T08:00:00.000Z";
const BOOK_ID = "seed-book-default";
const ACCOUNT_ID = "account-v51-usd";
const CATEGORY_ID = "seed-category-expense-subscriptions";
const CSV_CONFIG: CsvImportConfig = {
  hasHeader: true,
  encoding: "utf-8",
  delimiter: ",",
  dateColumn: "Date",
  dateFormat: "YYYY-MM-DD",
  timeColumn: null,
  timeFormat: null,
  amountMode: { kind: "signed", amountColumn: "Amount" },
  decimalSeparator: ".",
  thousandsSeparator: null,
  invertSign: false,
  idColumn: "ID",
  payeeColumn: "Payee",
  memoColumn: "Memo",
  currencyColumn: "Currency",
  timezone: "Asia/Shanghai",
};
const TIMESTAMP_CSV_CONFIG: CsvImportConfig = {
  ...CSV_CONFIG,
  timeColumn: "Time",
  timeFormat: "HH:mm:ss",
  timezone: "UTC",
};

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function count(database: TestDatabase, table: string): number {
  return (
    database.context.sqlite
      .prepare(`select count(*) as count from ${table}`)
      .get() as { count: number }
  ).count;
}

function scalar(
  database: TestDatabase,
  sql: string,
  ...parameters: unknown[]
): string {
  return (
    database.context.sqlite.prepare(sql).get(...parameters) as { value: string }
  ).value;
}

describe("V5.1 rules and recurring services", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  function setup() {
    database = createTestDatabase();
    seedDatabase(database.context);
    insertAccount(database.context.db, {
      id: ACCOUNT_ID,
      bookId: BOOK_ID,
      assetId: "seed-asset-usd",
      name: "V5.1 checking",
      accountType: "bank",
      institutionName: null,
      note: null,
      isArchived: false,
      sortOrder: 10,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const runtime = deterministicRuntime(NOW);
    return {
      runtime,
      accounts: new AccountService(database.context, runtime),
      references: new ReferenceDataService(database.context, runtime),
      recurring: new RecurringItemService(database.context, runtime),
      ledger: new LedgerCommandService(database.context, runtime),
    };
  }

  async function fileCandidates(
    runtime: ReturnType<typeof deterministicRuntime>,
  ) {
    const files = new FileImportService(database!.context, runtime);
    const connectionId = await files.createProfile({
      bookId: BOOK_ID,
      targetAccountId: ACCOUNT_ID,
      name: "V5.1 statement",
      format: "csv",
      parserConfig: CSV_CONFIG,
      confirmed: true,
    });
    await files.commit({
      connectionId,
      bytes: bytes(
        [
          "Date,Amount,ID,Payee,Memo,Currency",
          "2026-08-15,-16.49,netflix-1,NETFLIX.COM,August plan,USD",
          "2026-08-16,-17.49,netflix-2,NETFLIX.COM,September plan,USD",
        ].join("\n"),
      ),
      filename: "subscriptions.csv",
      confirmed: true,
    });
    const candidate = (stableKey: string) =>
      scalar(
        database!,
        "select id as value from external_transaction_candidates where stable_key = ?",
        stableKey,
      );
    return {
      connectionId,
      first: candidate("file:csv:id:netflix-1"),
      second: candidate("file:csv:id:netflix-2"),
    };
  }

  async function timestampFileCandidate(
    runtime: ReturnType<typeof deterministicRuntime>,
    input: { sourceDate: string; sourceTime: string; sourceId: string },
  ): Promise<string> {
    const files = new FileImportService(database!.context, runtime);
    const connectionId = await files.createProfile({
      bookId: BOOK_ID,
      targetAccountId: ACCOUNT_ID,
      name: `Timestamp ${input.sourceId}`,
      format: "csv",
      parserConfig: TIMESTAMP_CSV_CONFIG,
      confirmed: true,
    });
    await files.commit({
      connectionId,
      bytes: bytes(
        [
          "Date,Time,Amount,ID,Payee,Memo,Currency",
          `${input.sourceDate},${input.sourceTime},-16.49,${input.sourceId},Boundary merchant,Boundary memo,USD`,
        ].join("\n"),
      ),
      filename: `${input.sourceId}.csv`,
      confirmed: true,
    });
    return scalar(
      database!,
      "select id as value from external_transaction_candidates where stable_key = ?",
      `file:csv:id:${input.sourceId}`,
    );
  }

  it("lists stages in evaluator order and moves peers with equal sort values", () => {
    const { runtime } = setup();
    const rules = new AutomationRuleService(database!.context, runtime);
    const save = (name: string, stage: "pre" | "default" | "post") =>
      rules.save({
        bookId: BOOK_ID,
        name,
        stage,
        matchMode: "all",
        isEnabled: true,
        sortOrder: 100,
        conditions: [
          { field: "source_payee", operator: "contains", value: "merchant" },
        ],
        actions: [{ actionType: "set_payee", value: name }],
      });
    save("Post", "post");
    const firstId = save("First", "default");
    const secondId = save("Second", "default");
    save("Pre", "pre");

    expect(rules.list(BOOK_ID).map((rule) => rule.name)).toEqual([
      "Pre",
      "First",
      "Second",
      "Post",
    ]);
    rules.move(secondId, "up");
    expect(
      rules
        .list(BOOK_ID)
        .filter((rule) => rule.stage === "default")
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          order: rule.sortOrder,
        })),
    ).toEqual([
      { id: secondId, name: "Second", order: 100 },
      { id: firstId, name: "First", order: 200 },
    ]);
  });

  it("projects enabled rules without mutating source, candidate, legs, or Ledger", async () => {
    const { runtime, references } = setup();
    const tagId = await references.createTag(BOOK_ID, "Automated");
    const candidates = await fileCandidates(runtime);
    const rules = new AutomationRuleService(database!.context, runtime);
    rules.save({
      bookId: BOOK_ID,
      name: "Normalize Netflix",
      stage: "default",
      matchMode: "all",
      isEnabled: true,
      sortOrder: 100,
      conditions: [
        {
          field: "source_payee",
          operator: "contains",
          value: "netflix",
        },
        { field: "direction", operator: "equals", value: "out" },
      ],
      actions: [
        { actionType: "set_payee", value: "Netflix" },
        { actionType: "set_category", value: CATEGORY_ID },
        { actionType: "add_tag", value: tagId },
        { actionType: "set_note", value: "Streaming subscription" },
        { actionType: "suggest_event_type", value: "expense" },
      ],
    });
    const frozen = {
      source: database!.context.sqlite
        .prepare("select * from external_source_objects order by id")
        .all(),
      candidate: database!.context.sqlite
        .prepare("select * from external_transaction_candidates order by id")
        .all(),
      legs: database!.context.sqlite
        .prepare("select * from external_transaction_legs order by id")
        .all(),
      events: count(database!, "ledger_events"),
    };

    const projection = new AutomationProjectionService(
      database!.context,
    ).projectCandidate(candidates.first);
    expect(projection).toMatchObject({
      projectedPayee: "Netflix",
      projectedCategoryId: CATEGORY_ID,
      projectedTagIds: [tagId],
      projectedNote: "Streaming subscription",
      projectedEventType: "expense",
      warnings: [],
    });
    expect(
      database!.context.sqlite
        .prepare("select * from external_source_objects order by id")
        .all(),
    ).toEqual(frozen.source);
    expect(
      database!.context.sqlite
        .prepare("select * from external_transaction_candidates order by id")
        .all(),
    ).toEqual(frozen.candidate);
    expect(
      database!.context.sqlite
        .prepare("select * from external_transaction_legs order by id")
        .all(),
    ).toEqual(frozen.legs);
    expect(count(database!, "ledger_events")).toBe(frozen.events);

    await expect(references.setTagArchived(tagId, true)).rejects.toMatchObject({
      code: "TAG_AUTOMATION_ARCHIVE_BLOCKED",
    });
    await expect(
      references.setCategoryArchived(CATEGORY_ID, true),
    ).rejects.toMatchObject({ code: "CATEGORY_AUTOMATION_ARCHIVE_BLOCKED" });
  });

  it("generates date-only occurrences and keeps post/link/skip decisions explicit", async () => {
    const { accounts, references, recurring, ledger } = setup();
    const tagId = await references.createTag(BOOK_ID, "Subscription");
    const recurringItemId = recurring.save({
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Month-end subscription",
      eventType: "expense",
      payeeText: "Netflix",
      payeeMatchMode: "exact",
      categoryId: CATEGORY_ID,
      tagIds: [tagId],
      note: "Expected only",
      amountMode: "approx",
      amount: "15.99",
      toleranceBps: 1000,
      frequency: "monthly",
      intervalCount: 1,
      anchorDate: "2026-01-31",
      monthlyDayMode: "fixed",
      dateWindowBeforeDays: 2,
      dateWindowAfterDays: 2,
      isActive: true,
    });

    expect(
      recurring
        .occurrences({
          recurringItemId,
          fromDate: "2026-01-01",
          toDate: "2026-03-31",
          currentLocalDate: "2026-02-15",
        })
        .map((occurrence) => occurrence.occurrenceDate),
    ).toEqual(["2026-01-31", "2026-03-31"]);

    const eventId = recurring.postOccurrence({
      recurringItemId,
      occurrenceDate: "2026-03-31",
      actualAmount: "16.49",
      occurredAt: "2026-03-31T04:00:00.000Z",
      confirmed: true,
    });
    expect(
      scalar(
        database!,
        "select amount_atomic as value from ledger_entries where event_id = ? and entry_role = 'main'",
        eventId,
      ),
    ).toBe("-1649");
    expect(count(database!, "recurring_occurrence_links")).toBe(1);

    await ledger.updateEvent(eventId, {
      eventType: "expense",
      input: {
        accountId: ACCOUNT_ID,
        amount: "17.00",
        occurredAt: "2026-03-31T04:00:00.000Z",
        categoryId: CATEGORY_ID,
        tagIds: [tagId],
        payee: "Netflix",
      },
    });
    await expect(ledger.deleteEvent(eventId)).rejects.toMatchObject({
      code: "RECURRING_LINKED_EVENT_DELETE_FORBIDDEN",
    });
    recurring.unlink({ recurringItemId, occurrenceDate: "2026-03-31" });
    await ledger.deleteEvent(eventId);

    recurring.skip({
      recurringItemId,
      occurrenceDate: "2026-05-31",
      note: "Paused",
    });
    expect(count(database!, "recurring_occurrence_skips")).toBe(1);
    recurring.unskip({ recurringItemId, occurrenceDate: "2026-05-31" });
    expect(count(database!, "recurring_occurrence_skips")).toBe(0);

    database!.context.sqlite.exec(`
      CREATE TRIGGER force_post_link_failure
      BEFORE INSERT ON recurring_occurrence_links
      BEGIN
        SELECT RAISE(ABORT, 'forced post link failure');
      END;
    `);
    const eventsBeforeFailedPost = count(database!, "ledger_events");
    expect(() =>
      recurring.postOccurrence({
        recurringItemId,
        occurrenceDate: "2026-07-31",
        actualAmount: "18.00",
        occurredAt: "2026-07-31T04:00:00.000Z",
        confirmed: true,
      }),
    ).toThrow("forced post link failure");
    expect(count(database!, "ledger_events")).toBe(eventsBeforeFailedPost);

    await expect(accounts.setArchived(ACCOUNT_ID, true)).rejects.toMatchObject({
      code: "ACCOUNT_ACTIVE_RECURRING_ITEMS",
    });
    recurring.setActive(recurringItemId, false);
    await accounts.setArchived(ACCOUNT_ID, true);
    await accounts.setArchived(ACCOUNT_ID, false);
    await expect(
      accounts.updateAccount(ACCOUNT_ID, {
        assetId: "seed-asset-cny",
        name: "V5.1 checking",
        accountType: "bank",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_ASSET_LOCKED" });
  });

  it("suggests projected file candidates and Ledger events without auto-linking", async () => {
    const { runtime, recurring, ledger } = setup();
    const candidates = await fileCandidates(runtime);
    const recurringItemId = recurring.save({
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Netflix daily expectation",
      eventType: "expense",
      payeeText: "Netflix",
      payeeMatchMode: "exact",
      amountMode: "exact",
      amount: "16.49",
      frequency: "daily",
      intervalCount: 1,
      anchorDate: "2026-08-15",
      dateWindowBeforeDays: 2,
      dateWindowAfterDays: 2,
      isActive: true,
    });
    const matches = new RecurringMatchService(database!.context, runtime);
    expect(matches.suggestionsForFileCandidate(candidates.first)).toEqual([]);

    new AutomationRuleService(database!.context, runtime).save({
      bookId: BOOK_ID,
      name: "Project Netflix payee",
      stage: "default",
      matchMode: "all",
      isEnabled: true,
      sortOrder: 100,
      conditions: [
        { field: "source_payee", operator: "contains", value: "netflix" },
      ],
      actions: [{ actionType: "set_payee", value: "Netflix" }],
    });
    expect(matches.suggestionsForFileCandidate(candidates.first)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recurringItemId,
          occurrenceDate: "2026-08-15",
          candidateId: candidates.first,
        }),
      ]),
    );
    expect(count(database!, "recurring_occurrence_links")).toBe(0);

    const ledgerEventId = await ledger.createExpense({
      accountId: ACCOUNT_ID,
      amount: "16.49",
      occurredAt: "2026-08-15T04:00:00.000Z",
      payee: "Netflix",
    });
    expect(
      matches.suggestionsForOccurrence({
        recurringItemId,
        occurrenceDate: "2026-08-15",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ledgerEventId }),
        expect.objectContaining({ candidateId: candidates.first }),
      ]),
    );
    expect(count(database!, "recurring_occurrence_links")).toBe(0);

    recurring.linkExisting({
      recurringItemId,
      occurrenceDate: "2026-08-15",
      ledgerEventId,
      confirmed: true,
    });
    expect(
      matches.suggestionsForOccurrence({
        recurringItemId,
        occurrenceDate: "2026-08-15",
      }),
    ).toEqual([]);
    recurring.skip({
      recurringItemId,
      occurrenceDate: "2026-08-16",
    });
    expect(
      matches.suggestionsForOccurrence({
        recurringItemId,
        occurrenceDate: "2026-08-16",
      }),
    ).toEqual([]);
  });

  it("imports source facts plus confirmed metadata and recurring link in one transaction", async () => {
    const { runtime, references, recurring } = setup();
    const tagId = await references.createTag(BOOK_ID, "Imported subscription");
    const recurringItemId = recurring.save({
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Daily test subscription",
      eventType: "expense",
      payeeText: "Netflix",
      payeeMatchMode: "exact",
      categoryId: CATEGORY_ID,
      tagIds: [tagId],
      amountMode: "exact",
      amount: "15.99",
      frequency: "daily",
      intervalCount: 1,
      anchorDate: "2026-08-15",
      dateWindowBeforeDays: 2,
      dateWindowAfterDays: 2,
      isActive: true,
    });
    const candidates = await fileCandidates(runtime);
    const importer = new ExternalImportService(database!.context, runtime);
    const imported = await importer.importCandidate({
      candidateId: candidates.first,
      chosenEventType: "expense",
      mainAccountId: ACCOUNT_ID,
      payee: "Netflix",
      categoryId: CATEGORY_ID,
      tagIds: [tagId],
      note: "User confirmed projection",
      recurringItemId,
      occurrenceDate: "2026-08-15",
      confirmedRecurringLink: true,
      confirmed: true,
    });

    expect(
      database!.context.sqlite
        .prepare(
          "select event_type as eventType, occurred_at as occurredAt, payee, category_id as categoryId, note from ledger_events where id = ?",
        )
        .get(imported.ledgerEventId),
    ).toEqual({
      eventType: "expense",
      occurredAt: "2026-08-15T04:00:00.000Z",
      payee: "Netflix",
      categoryId: CATEGORY_ID,
      note: "User confirmed projection",
    });
    expect(
      scalar(
        database!,
        "select amount_atomic as value from ledger_entries where event_id = ? and account_id = ?",
        imported.ledgerEventId,
        ACCOUNT_ID,
      ),
    ).toBe("-1649");
    expect(count(database!, "event_tags")).toBe(1);
    expect(count(database!, "external_import_links")).toBe(1);
    expect(count(database!, "recurring_occurrence_links")).toBe(1);

    database!.context.sqlite.exec(`
      CREATE TRIGGER force_recurring_link_failure
      BEFORE INSERT ON recurring_occurrence_links
      BEGIN
        SELECT RAISE(ABORT, 'forced recurring link failure');
      END;
    `);
    const before = {
      events: count(database!, "ledger_events"),
      externalLinks: count(database!, "external_import_links"),
      recurringLinks: count(database!, "recurring_occurrence_links"),
    };
    await expect(
      importer.importCandidate({
        candidateId: candidates.second,
        chosenEventType: "expense",
        mainAccountId: ACCOUNT_ID,
        recurringItemId,
        occurrenceDate: "2026-08-16",
        confirmedRecurringLink: true,
        confirmed: true,
      }),
    ).rejects.toBeTruthy();
    expect({
      events: count(database!, "ledger_events"),
      externalLinks: count(database!, "external_import_links"),
      recurringLinks: count(database!, "recurring_occurrence_links"),
    }).toEqual(before);
    expect(
      scalar(
        database!,
        "select status as value from external_transaction_candidates where id = ?",
        candidates.second,
      ),
    ).toBe("pending");
  });

  it("preserves recurring link semantics across definition and normal Ledger edits", async () => {
    const { runtime, references, recurring, ledger } = setup();
    const accountB = "account-v51-usd-b";
    insertAccount(database!.context.db, {
      id: accountB,
      bookId: BOOK_ID,
      assetId: "seed-asset-usd",
      name: "V5.1 checking B",
      accountType: "bank",
      institutionName: null,
      note: null,
      isArchived: false,
      sortOrder: 20,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const tagId = await references.createTag(BOOK_ID, "Linked edit");
    const updatedCategoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Linked edit updated category",
      categoryType: "expense",
    });
    const updatedTagId = await references.createTag(
      BOOK_ID,
      "Linked edit updated tag",
    );
    const draft = {
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Linked recurring expense",
      eventType: "expense" as const,
      payeeText: "Original payee",
      payeeMatchMode: "exact" as const,
      categoryId: "seed-category-both-other",
      tagIds: [tagId],
      note: "Original recurring note",
      amountMode: "exact" as const,
      amount: "16.49",
      frequency: "daily" as const,
      intervalCount: 1,
      anchorDate: "2026-08-15",
      dateWindowBeforeDays: 0,
      dateWindowAfterDays: 0,
      isActive: true,
    };
    const recurringItemId = recurring.save(draft);
    const ledgerEventId = await ledger.createExpense({
      accountId: ACCOUNT_ID,
      amount: "16.49",
      occurredAt: "2026-08-15T04:00:00.000Z",
      payee: "Original payee",
      categoryId: "seed-category-both-other",
      tagIds: [tagId],
      note: "Original Ledger note",
    });
    recurring.linkExisting({
      recurringItemId,
      occurrenceDate: "2026-08-15",
      ledgerEventId,
      confirmed: true,
    });
    const backup = new BackupService(database!.context, runtime);

    const before = readBackupData(database!.context.db);
    expect(() =>
      recurring.save({
        ...draft,
        id: recurringItemId,
        eventType: "income",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "RECURRING_EVENT_TYPE_CHANGE_FORBIDDEN",
      }),
    );
    expect(readBackupData(database!.context.db)).toEqual(before);
    expect(() => backup.exportBackup()).not.toThrow();

    await expect(
      ledger.updateEvent(ledgerEventId, {
        eventType: "income",
        input: {
          accountId: ACCOUNT_ID,
          amount: "16.49",
          occurredAt: "2026-08-15T04:00:00.000Z",
          categoryId: "seed-category-both-other",
          tagIds: [tagId],
          payee: "Income attempt",
        },
      }),
    ).rejects.toMatchObject({
      code: "RECURRING_LINKED_EVENT_EDIT_INCOMPATIBLE",
    });
    expect(readBackupData(database!.context.db)).toEqual(before);

    await expect(
      ledger.updateEvent(ledgerEventId, {
        eventType: "expense",
        input: {
          accountId: accountB,
          amount: "16.49",
          occurredAt: "2026-08-15T04:00:00.000Z",
          categoryId: "seed-category-both-other",
          tagIds: [tagId],
          payee: "Account move attempt",
        },
      }),
    ).rejects.toMatchObject({
      code: "RECURRING_LINKED_EVENT_EDIT_INCOMPATIBLE",
    });
    expect(readBackupData(database!.context.db)).toEqual(before);

    const linkedBefore = before.recurringOccurrenceLinks;
    await ledger.updateEvent(ledgerEventId, {
      eventType: "expense",
      input: {
        accountId: ACCOUNT_ID,
        amount: "21.00",
        occurredAt: "2026-08-20T23:45:00.000Z",
        categoryId: updatedCategoryId,
        tagIds: [updatedTagId],
        payee: "Updated payee",
        note: "Updated amount/date/category/tags/payee/note",
      },
    });
    const compatible = readBackupData(database!.context.db);
    expect(compatible.recurringOccurrenceLinks).toEqual(linkedBefore);
    expect(
      compatible.ledgerEvents.find((event) => event.id === ledgerEventId),
    ).toMatchObject({
      eventType: "expense",
      occurredAt: "2026-08-20T23:45:00.000Z",
      categoryId: updatedCategoryId,
      payee: "Updated payee",
      note: "Updated amount/date/category/tags/payee/note",
    });
    expect(
      compatible.eventTags.filter(
        (eventTag) => eventTag.eventId === ledgerEventId,
      ),
    ).toEqual([{ eventId: ledgerEventId, tagId: updatedTagId }]);
    expect(
      compatible.ledgerEntries.find(
        (entry) =>
          entry.eventId === ledgerEventId && entry.entryRole === "main",
      ),
    ).toMatchObject({ accountId: ACCOUNT_ID, amountAtomic: "-2100" });

    const payload = backup.exportBackup();
    const target = createTestDatabase();
    try {
      new BackupService(target.context, runtime).restore(payload);
      expect(readBackupData(target.context.db)).toEqual(payload.data);
    } finally {
      target.close();
    }

    recurring.unlink({ recurringItemId, occurrenceDate: "2026-08-15" });
    await ledger.updateEvent(ledgerEventId, {
      eventType: "income",
      input: {
        accountId: accountB,
        amount: "22.00",
        occurredAt: "2026-08-21T01:00:00.000Z",
        categoryId: "seed-category-both-other",
        tagIds: [tagId],
        payee: "Allowed after unlink",
      },
    });
    const afterUnlink = readBackupData(database!.context.db);
    expect(afterUnlink.recurringOccurrenceLinks).toEqual([]);
    expect(
      afterUnlink.ledgerEvents.find((event) => event.id === ledgerEventId),
    ).toMatchObject({ eventType: "income", payee: "Allowed after unlink" });
    expect(
      afterUnlink.ledgerEntries.find(
        (entry) =>
          entry.eventId === ledgerEventId && entry.entryRole === "main",
      ),
    ).toMatchObject({ accountId: accountB, amountAtomic: "2200" });
  });

  it("revalidates every live recurring reference before reactivation", async () => {
    const { runtime, accounts, references, recurring } = setup();
    const categoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Reactivation category",
      categoryType: "expense",
    });
    const tagId = await references.createTag(BOOK_ID, "Reactivation tag");
    const draft = {
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Reactivation checks",
      eventType: "expense" as const,
      payeeMatchMode: "any" as const,
      categoryId,
      tagIds: [tagId],
      amountMode: "exact" as const,
      amount: "9.99",
      frequency: "monthly" as const,
      intervalCount: 1,
      anchorDate: "2026-08-15",
      monthlyDayMode: "fixed" as const,
      dateWindowBeforeDays: 1,
      dateWindowAfterDays: 1,
      isActive: true,
    };
    const recurringItemId = recurring.save(draft);
    recurring.setActive(recurringItemId, false);
    const inactive = recurring.get(recurringItemId);

    await accounts.setArchived(ACCOUNT_ID, true);
    expect(() => recurring.setActive(recurringItemId, true)).toThrowError(
      expect.objectContaining({ code: "RECURRING_ACCOUNT_INVALID" }),
    );
    expect(recurring.get(recurringItemId)).toEqual(inactive);
    expect(() =>
      recurring.save({
        ...draft,
        id: recurringItemId,
        isActive: true,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "RECURRING_ACCOUNT_INVALID" }),
    );
    expect(recurring.get(recurringItemId)).toEqual(inactive);
    await references.setAssetArchived("seed-asset-usd", true);
    expect(() => recurring.setActive(recurringItemId, true)).toThrowError(
      expect.objectContaining({ code: "RECURRING_ACCOUNT_INVALID" }),
    );
    expect(recurring.get(recurringItemId)).toEqual(inactive);
    await references.setAssetArchived("seed-asset-usd", false);
    await accounts.setArchived(ACCOUNT_ID, false);

    await references.setCategoryArchived(categoryId, true);
    expect(() => recurring.setActive(recurringItemId, true)).toThrowError(
      expect.objectContaining({ code: "RECURRING_CATEGORY_INVALID" }),
    );
    expect(recurring.get(recurringItemId)).toEqual(inactive);
    await references.setCategoryArchived(categoryId, false);

    await references.setTagArchived(tagId, true);
    expect(() => recurring.setActive(recurringItemId, true)).toThrowError(
      expect.objectContaining({ code: "RECURRING_TAG_INVALID" }),
    );
    expect(recurring.get(recurringItemId)).toEqual(inactive);
    await references.setTagArchived(tagId, false);

    database!.context.sqlite
      .prepare("update categories set category_type = ? where id = ?")
      .run("income", categoryId);
    expect(() => recurring.setActive(recurringItemId, true)).toThrowError(
      expect.objectContaining({ code: "RECURRING_CATEGORY_INVALID" }),
    );
    expect(recurring.get(recurringItemId)).toEqual(inactive);
    database!.context.sqlite
      .prepare("update categories set category_type = ? where id = ?")
      .run("expense", categoryId);

    recurring.setActive(recurringItemId, true);
    expect(recurring.get(recurringItemId)?.isActive).toBe(true);
    expect(
      new BackupService(database!.context, runtime).exportBackup(),
    ).toMatchObject({ schemaVersion: 8 });
  });

  it("rejects an incompatible category type change referenced by an inactive recurring item", async () => {
    const { runtime, references, recurring } = setup();
    const categoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Dormant recurring category",
      categoryType: "expense",
    });
    const recurringItemId = recurring.save({
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Dormant recurring expense",
      eventType: "expense",
      payeeMatchMode: "any",
      categoryId,
      amountMode: "exact",
      amount: "9.99",
      frequency: "monthly",
      intervalCount: 1,
      anchorDate: "2026-08-15",
      monthlyDayMode: "fixed",
      dateWindowBeforeDays: 1,
      dateWindowAfterDays: 1,
      isActive: true,
    });
    recurring.setActive(recurringItemId, false);

    await expect(
      references.updateCategory(categoryId, {
        bookId: BOOK_ID,
        name: "Dormant recurring category",
        categoryType: "income",
      }),
    ).rejects.toMatchObject({
      code: "CATEGORY_AUTOMATION_REFERENCE_LOCKED",
      message:
        "Edit rules or recurring definitions that reference this category before changing its type.",
    });
    expect(
      findCategoryById(database!.context.db, categoryId)?.categoryType,
    ).toBe("expense");
    expect(() =>
      new BackupService(database!.context, runtime).exportBackup(),
    ).not.toThrow();
  });

  it("allows a compatible category type widening referenced by an inactive recurring item", async () => {
    const { runtime, references, recurring } = setup();
    const categoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Widened recurring category",
      categoryType: "expense",
    });
    const recurringItemId = recurring.save({
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Widened recurring expense",
      eventType: "expense",
      payeeMatchMode: "any",
      categoryId,
      amountMode: "exact",
      amount: "9.99",
      frequency: "monthly",
      intervalCount: 1,
      anchorDate: "2026-08-15",
      monthlyDayMode: "fixed",
      dateWindowBeforeDays: 1,
      dateWindowAfterDays: 1,
      isActive: true,
    });
    recurring.setActive(recurringItemId, false);

    await references.updateCategory(categoryId, {
      bookId: BOOK_ID,
      name: "Widened recurring category",
      categoryType: "both",
    });

    expect(
      findCategoryById(database!.context.db, categoryId)?.categoryType,
    ).toBe("both");
    expect(() =>
      new BackupService(database!.context, runtime).exportBackup(),
    ).not.toThrow();
  });

  it("rejects an incompatible category type change referenced by a disabled rule", async () => {
    const { runtime, references } = setup();
    const categoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Dormant rule category",
      categoryType: "expense",
    });
    const rules = new AutomationRuleService(database!.context, runtime);
    const ruleId = rules.save({
      bookId: BOOK_ID,
      name: "Dormant expense rule",
      stage: "default",
      matchMode: "all",
      isEnabled: true,
      sortOrder: 100,
      conditions: [{ field: "direction", operator: "equals", value: "out" }],
      actions: [{ actionType: "set_category", value: categoryId }],
    });
    rules.setEnabled(ruleId, false);

    await expect(
      references.updateCategory(categoryId, {
        bookId: BOOK_ID,
        name: "Dormant rule category",
        categoryType: "income",
      }),
    ).rejects.toMatchObject({
      code: "CATEGORY_AUTOMATION_REFERENCE_LOCKED",
      message:
        "Edit rules or recurring definitions that reference this category before changing its type.",
    });
    expect(
      findCategoryById(database!.context.db, categoryId)?.categoryType,
    ).toBe("expense");
    expect(() =>
      new BackupService(database!.context, runtime).exportBackup(),
    ).not.toThrow();
  });

  it("allows a category type change after every dormant definition changes its reference and round-trips Backup V7", async () => {
    const { runtime, references, recurring } = setup();
    const categoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Released dormant category",
      categoryType: "expense",
    });
    const replacementCategoryId = await references.createCategory({
      bookId: BOOK_ID,
      name: "Replacement dormant category",
      categoryType: "both",
    });
    const recurringDraft = {
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
      name: "Released dormant recurring",
      eventType: "expense" as const,
      payeeMatchMode: "any" as const,
      categoryId,
      amountMode: "exact" as const,
      amount: "9.99",
      frequency: "monthly" as const,
      intervalCount: 1,
      anchorDate: "2026-08-15",
      monthlyDayMode: "fixed" as const,
      dateWindowBeforeDays: 1,
      dateWindowAfterDays: 1,
      isActive: true,
    };
    const recurringItemId = recurring.save(recurringDraft);
    recurring.setActive(recurringItemId, false);
    const rules = new AutomationRuleService(database!.context, runtime);
    const ruleDraft = {
      bookId: BOOK_ID,
      name: "Released dormant rule",
      stage: "default" as const,
      matchMode: "all" as const,
      isEnabled: true,
      sortOrder: 100,
      conditions: [
        {
          field: "direction" as const,
          operator: "equals" as const,
          value: "out",
        },
      ],
      actions: [{ actionType: "set_category" as const, value: categoryId }],
    };
    const ruleId = rules.save(ruleDraft);
    rules.setEnabled(ruleId, false);

    recurring.save({
      ...recurringDraft,
      id: recurringItemId,
      categoryId: replacementCategoryId,
      isActive: false,
    });
    rules.save({
      ...ruleDraft,
      id: ruleId,
      isEnabled: false,
      actions: [{ actionType: "set_category", value: replacementCategoryId }],
    });
    await references.updateCategory(categoryId, {
      bookId: BOOK_ID,
      name: "Released dormant category",
      categoryType: "income",
    });

    expect(
      findCategoryById(database!.context.db, categoryId)?.categoryType,
    ).toBe("income");
    const payload = new BackupService(
      database!.context,
      runtime,
    ).exportBackup();
    const target = createTestDatabase();
    try {
      new BackupService(target.context, runtime).restore(payload);
      expect(readBackupData(target.context.db)).toEqual(payload.data);
    } finally {
      target.close();
    }
  });

  it.each([
    {
      timeZone: "Asia/Shanghai",
      sourceDate: "2026-08-14",
      sourceTime: "16:30:00",
      instant: "2026-08-14T16:30:00.000Z",
      localDate: "2026-08-15",
    },
    {
      timeZone: "America/Los_Angeles",
      sourceDate: "2026-08-15",
      sourceTime: "06:30:00",
      instant: "2026-08-15T06:30:00.000Z",
      localDate: "2026-08-14",
    },
  ])(
    "uses the App timezone for file-candidate recurring matching in $timeZone",
    async ({ timeZone, sourceDate, sourceTime, instant, localDate }) => {
      const { runtime, recurring } = setup();
      await new SettingsService(database!.context, runtime).setTimeZone(
        timeZone,
      );
      const candidateId = await timestampFileCandidate(runtime, {
        sourceDate,
        sourceTime,
        sourceId: `boundary-${timeZone.replaceAll("/", "-")}`,
      });
      const recurringItemId = recurring.save({
        bookId: BOOK_ID,
        accountId: ACCOUNT_ID,
        name: `Boundary ${timeZone}`,
        eventType: "expense",
        payeeMatchMode: "any",
        amountMode: "exact",
        amount: "16.49",
        frequency: "daily",
        intervalCount: 1,
        anchorDate: localDate,
        dateWindowBeforeDays: 0,
        dateWindowAfterDays: 0,
        isActive: true,
      });
      const detail = new FileImportReadService(database!.context).candidate(
        candidateId,
      );
      expect(detail).toMatchObject({
        occurredAt: instant,
        sourceDateText: sourceDate,
      });
      expect(sourceDate).not.toBe(localDate);

      const matches = new RecurringMatchService(database!.context, runtime);
      expect(matches.suggestionsForFileCandidate(candidateId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recurringItemId,
            candidateId,
            occurrenceDate: localDate,
          }),
        ]),
      );
      expect(
        matches.suggestionsForOccurrence({
          recurringItemId,
          occurrenceDate: localDate,
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ candidateId, occurrenceDate: localDate }),
        ]),
      );
      expect(
        matches.suggestionsForOccurrence({
          recurringItemId,
          occurrenceDate: sourceDate,
        }),
      ).toEqual([]);
      expect(count(database!, "recurring_occurrence_links")).toBe(0);
    },
  );
});
