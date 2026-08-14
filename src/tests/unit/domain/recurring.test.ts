import { describe, expect, it } from "vitest";

import {
  generateOccurrenceDates,
  recurringAmountBounds,
  recurringAmountMatches,
  scoreRecurringMatch,
  validateRecurringLinkCompatibility,
  type RecurringLinkEventState,
  type RecurringItem,
} from "../../../domain/recurring";

function item(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: "recurring-1",
    bookId: "book-1",
    accountId: "account-usd",
    assetId: "asset-usd",
    name: "Netflix",
    eventType: "expense",
    payeeText: "Netflix",
    payeeMatchMode: "contains",
    categoryId: null,
    tagIds: [],
    note: null,
    amountMode: "exact",
    amountAtomic: 1599n,
    toleranceBps: null,
    minAmountAtomic: null,
    maxAmountAtomic: null,
    frequency: "monthly",
    intervalCount: 1,
    anchorDate: "2026-01-31",
    monthlyDayMode: "fixed",
    dateWindowBeforeDays: 2,
    dateWindowAfterDays: 2,
    startsOn: null,
    endsOn: null,
    isActive: true,
    ...overrides,
  };
}

function linkedEvent(
  overrides: Partial<RecurringLinkEventState> = {},
): RecurringLinkEventState {
  return {
    bookId: "book-1",
    eventType: "expense",
    entries: [{ accountId: "account-usd", role: "main", amountAtomic: -1599n }],
    ...overrides,
  };
}

describe("V5.1 date-only recurring engine", () => {
  it("skips missing fixed monthly dates", () => {
    expect(generateOccurrenceDates(item(), "2026-01-01", "2026-05-31")).toEqual(
      ["2026-01-31", "2026-03-31", "2026-05-31"],
    );
  });

  it("supports explicit monthly last day", () => {
    expect(
      generateOccurrenceDates(
        item({ monthlyDayMode: "last" }),
        "2026-01-01",
        "2026-05-31",
      ),
    ).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("skips Feb 29 in non-leap years", () => {
    expect(
      generateOccurrenceDates(
        item({
          frequency: "yearly",
          anchorDate: "2024-02-29",
          monthlyDayMode: null,
        }),
        "2024-01-01",
        "2029-12-31",
      ),
    ).toEqual(["2024-02-29", "2028-02-29"]);
  });

  it("supports daily/weekly intervals and active ranges", () => {
    expect(
      generateOccurrenceDates(
        item({
          frequency: "daily",
          intervalCount: 2,
          anchorDate: "2026-08-01",
          monthlyDayMode: null,
          startsOn: "2026-08-03",
          endsOn: "2026-08-07",
        }),
        "2026-08-01",
        "2026-08-10",
      ),
    ).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
    expect(
      generateOccurrenceDates(
        item({
          frequency: "weekly",
          intervalCount: 2,
          anchorDate: "2026-08-03",
          monthlyDayMode: null,
        }),
        "2026-08-01",
        "2026-09-15",
      ),
    ).toEqual(["2026-08-03", "2026-08-17", "2026-08-31", "2026-09-14"]);
  });
});

describe("V5.1 recurring bigint expectations", () => {
  it("computes inclusive approximate bounds with bigint floor/ceil", () => {
    const approximate = item({
      amountMode: "approx",
      amountAtomic: 1599n,
      toleranceBps: 500,
    });
    expect(recurringAmountBounds(approximate)).toEqual({
      min: 1519n,
      max: 1679n,
    });
    expect(recurringAmountMatches(approximate, 1519n)).toBe(true);
    expect(recurringAmountMatches(approximate, 1679n)).toBe(true);
    expect(recurringAmountMatches(approximate, 1680n)).toBe(false);
  });

  it("matches inclusive bigint ranges", () => {
    const range = item({
      amountMode: "range",
      amountAtomic: null,
      minAmountAtomic: 1500n,
      maxAmountAtomic: 1700n,
    });
    expect(recurringAmountMatches(range, 1500n)).toBe(true);
    expect(recurringAmountMatches(range, 1700n)).toBe(true);
    expect(recurringAmountMatches(range, 1499n)).toBe(false);
  });

  it("produces deterministic suggestions without linking", () => {
    expect(
      scoreRecurringMatch({
        item: item(),
        occurrenceDate: "2026-09-15",
        actualDate: "2026-09-16",
        actualPayee: "NETFLIX.COM",
        actualMagnitudeAtomic: 1599n,
      }),
    ).toEqual({
      score: 1225,
      reasons: [
        "date 1 day(s) away",
        "payee contains expected text",
        "exact expected amount",
      ],
    });
  });
});

describe("V5.1 recurring link compatibility", () => {
  it.each([
    {
      name: "missing recurring item",
      input: { item: null, event: linkedEvent() },
      reason: "item_missing",
    },
    {
      name: "invalid recurring definition",
      input: { item: item({ amountAtomic: null }), event: linkedEvent() },
      reason: "item_invalid",
    },
    {
      name: "non-generated occurrence",
      input: {
        item: item(),
        event: linkedEvent(),
        occurrenceDate: "2026-02-28",
      },
      reason: "occurrence_invalid",
    },
    {
      name: "missing Ledger event",
      input: { item: item(), event: null },
      reason: "event_missing",
    },
    {
      name: "different book",
      input: { item: item(), event: linkedEvent({ bookId: "book-2" }) },
      reason: "book_mismatch",
    },
    {
      name: "different event type",
      input: { item: item(), event: linkedEvent({ eventType: "income" }) },
      reason: "event_type_mismatch",
    },
    {
      name: "wrong main cardinality",
      input: { item: item(), event: linkedEvent({ entries: [] }) },
      reason: "main_entry_cardinality",
    },
    {
      name: "multiple main entries",
      input: {
        item: item(),
        event: linkedEvent({
          entries: [
            { accountId: "account-usd", role: "main", amountAtomic: -1599n },
            { accountId: "account-usd", role: "main", amountAtomic: -100n },
          ],
        }),
      },
      reason: "main_entry_cardinality",
    },
    {
      name: "different main account",
      input: {
        item: item(),
        event: linkedEvent({
          entries: [
            { accountId: "account-other", role: "main", amountAtomic: -1599n },
          ],
        }),
      },
      reason: "main_account_mismatch",
    },
    {
      name: "wrong Expense direction",
      input: {
        item: item(),
        event: linkedEvent({
          entries: [
            { accountId: "account-usd", role: "main", amountAtomic: 1599n },
          ],
        }),
      },
      reason: "direction_mismatch",
    },
    {
      name: "wrong Income direction",
      input: {
        item: item({ eventType: "income" }),
        event: linkedEvent({
          eventType: "income",
          entries: [
            { accountId: "account-usd", role: "main", amountAtomic: -1599n },
          ],
        }),
      },
      reason: "direction_mismatch",
    },
  ])("rejects $name", ({ input, reason }) => {
    expect(
      validateRecurringLinkCompatibility({
        occurrenceDate: "2026-01-31",
        ...input,
      }),
    ).toEqual({ ok: false, reason });
  });

  it("accepts one same-book, same-type main entry with the expected account and direction", () => {
    expect(
      validateRecurringLinkCompatibility({
        item: item(),
        occurrenceDate: "2026-01-31",
        event: linkedEvent(),
      }),
    ).toEqual({ ok: true });
    expect(
      validateRecurringLinkCompatibility({
        item: item({ eventType: "income" }),
        occurrenceDate: "2026-01-31",
        event: linkedEvent({
          eventType: "income",
          entries: [
            { accountId: "account-usd", role: "main", amountAtomic: 1599n },
          ],
        }),
      }),
    ).toEqual({ ok: true });
  });
});
