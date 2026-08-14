import { afterEach, describe, expect, it } from "vitest";

import { buildCandidateRecurringPrefill } from "../../app/automation/recurring-prefill";
import { insertAccount } from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import type { CsvImportConfig } from "../../domain/file-import";
import { FileImportReadService } from "../../services/file-import-read-service";
import { FileImportService } from "../../services/file-import-service";
import { RecurringCalendarService } from "../../services/recurring-calendar-service";
import { SettingsService } from "../../services/settings-service";
import {
  createTestDatabase,
  deterministicRuntime,
  type TestDatabase,
} from "./test-database";

const NOW = "2026-08-15T08:00:00.000Z";
const BOOK_ID = "seed-book-default";
const ACCOUNT_ID = "automation-page-timezone-usd";
const CSV_CONFIG: CsvImportConfig = {
  hasHeader: true,
  encoding: "utf-8",
  delimiter: ",",
  dateColumn: "Date",
  dateFormat: "YYYY-MM-DD",
  timeColumn: "Time",
  timeFormat: "HH:mm:ss",
  amountMode: { kind: "signed", amountColumn: "Amount" },
  decimalSeparator: ".",
  thousandsSeparator: null,
  invertSign: false,
  idColumn: "ID",
  payeeColumn: "Payee",
  memoColumn: "Memo",
  currencyColumn: "Currency",
  timezone: "UTC",
};

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("Recurring calendar App-timezone authority", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it.each([
    {
      timeZone: "Asia/Shanghai",
      instant: "2026-08-14T16:30:00.000Z",
      sourceDate: "2026-08-14",
      sourceTime: "16:30:00",
      expectedDate: "2026-08-15",
    },
    {
      timeZone: "America/Los_Angeles",
      instant: "2026-08-15T06:30:00.000Z",
      sourceDate: "2026-08-15",
      sourceTime: "06:30:00",
      expectedDate: "2026-08-14",
    },
  ])(
    "returns $expectedDate for new-item and candidate-prefill anchors in $timeZone",
    async ({ timeZone, instant, sourceDate, sourceTime, expectedDate }) => {
      database = createTestDatabase();
      seedDatabase(database.context);
      insertAccount(database.context.db, {
        id: ACCOUNT_ID,
        bookId: BOOK_ID,
        assetId: "seed-asset-usd",
        name: "Automation timezone checking",
        accountType: "bank",
        institutionName: null,
        note: null,
        isArchived: false,
        sortOrder: 10,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const runtime = deterministicRuntime(instant);
      await new SettingsService(database.context, runtime).setTimeZone(
        timeZone,
      );
      const files = new FileImportService(database.context, runtime);
      const connectionId = await files.createProfile({
        bookId: BOOK_ID,
        targetAccountId: ACCOUNT_ID,
        name: `Boundary ${timeZone}`,
        format: "csv",
        parserConfig: CSV_CONFIG,
        confirmed: true,
      });
      const sourceId = `page-boundary-${timeZone.replaceAll("/", "-")}`;
      await files.commit({
        connectionId,
        bytes: bytes(
          [
            "Date,Time,Amount,ID,Payee,Memo,Currency",
            `${sourceDate},${sourceTime},-16.49,${sourceId},Boundary merchant,Boundary memo,USD`,
          ].join("\n"),
        ),
        filename: `${sourceId}.csv`,
        confirmed: true,
      });
      const candidateId = (
        database.context.sqlite
          .prepare(
            "select id from external_transaction_candidates where stable_key = ?",
          )
          .get(`file:csv:id:${sourceId}`) as { id: string }
      ).id;
      const candidate = new FileImportReadService(database.context).candidate(
        candidateId,
      );
      expect(candidate).toMatchObject({
        occurredAt: instant,
        sourceDateText: sourceDate,
      });
      expect(sourceDate).not.toBe(expectedDate);

      const calendar = new RecurringCalendarService(database.context, runtime);
      expect(calendar.currentLocalDate()).toBe(expectedDate);
      const recurringPrefill = buildCandidateRecurringPrefill({
        candidate,
        account: {
          id: ACCOUNT_ID,
          assetScale: 2,
          isArchived: false,
        },
        calendar,
      });
      expect(recurringPrefill).toMatchObject({
        accountId: ACCOUNT_ID,
        anchorDate: expectedDate,
        amount: "16.49",
        eventType: "expense",
      });
    },
  );
});
