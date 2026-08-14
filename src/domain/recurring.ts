import { assertDomain } from "./errors";
import { normalizeAutomationText } from "./automation";
import type { EventType, LedgerEntryDraft } from "./types";

export type RecurringEventType = "expense" | "income";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringAmountMode = "exact" | "approx" | "range";
export type RecurringPayeeMatchMode = "any" | "exact" | "contains";
export type MonthlyDayMode = "fixed" | "last";

export interface RecurringItem {
  id: string;
  bookId: string;
  accountId: string;
  assetId: string;
  name: string;
  eventType: RecurringEventType;
  payeeText: string | null;
  payeeMatchMode: RecurringPayeeMatchMode;
  categoryId: string | null;
  tagIds: string[];
  note: string | null;
  amountMode: RecurringAmountMode;
  amountAtomic: bigint | null;
  toleranceBps: number | null;
  minAmountAtomic: bigint | null;
  maxAmountAtomic: bigint | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  anchorDate: string;
  monthlyDayMode: MonthlyDayMode | null;
  dateWindowBeforeDays: number;
  dateWindowAfterDays: number;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
}

export interface GeneratedOccurrence {
  recurringItemId: string;
  occurrenceDate: string;
  status: "linked" | "skipped" | "upcoming" | "due" | "overdue";
  linkedLedgerEventId: string | null;
}

export interface RecurringMatchSuggestion {
  recurringItemId: string;
  occurrenceDate: string;
  ledgerEventId?: string;
  candidateId?: string;
  score: number;
  reasons: string[];
}

export interface RecurringLinkEventState {
  bookId: string;
  eventType: EventType;
  entries: readonly LedgerEntryDraft[];
}

export type RecurringLinkCompatibilityFailure =
  | "item_missing"
  | "item_invalid"
  | "occurrence_invalid"
  | "event_missing"
  | "book_mismatch"
  | "event_type_mismatch"
  | "main_entry_cardinality"
  | "main_account_mismatch"
  | "direction_mismatch";

export type RecurringLinkCompatibilityResult =
  { ok: true } | { ok: false; reason: RecurringLinkCompatibilityFailure };

interface DateParts {
  year: number;
  month: number;
  day: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
export const MAX_GENERATED_OCCURRENCES = 10_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(value: string): DateParts {
  const match = DATE_PATTERN.exec(value);
  assertDomain(
    match,
    "RECURRING_DATE_INVALID",
    "Recurring dates must use YYYY-MM-DD.",
  );
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  assertDomain(
    parts.year >= 1000 && parts.year <= 9999,
    "RECURRING_DATE_INVALID",
    "Recurring date year must be between 1000 and 9999.",
  );
  const instant = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  assertDomain(
    instant.getUTCFullYear() === parts.year &&
      instant.getUTCMonth() + 1 === parts.month &&
      instant.getUTCDate() === parts.day,
    "RECURRING_DATE_INVALID",
    "Recurring date must be a real calendar date.",
  );
  return parts;
}

function formatDate(parts: DateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}`;
}

function epochDay(value: string): number {
  const parts = parseDate(value);
  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

function dateFromEpochDay(value: number): string {
  const date = new Date(value * DAY_MS);
  return formatDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addLocalDays(value: string, days: number): string {
  assertDomain(
    Number.isInteger(days),
    "RECURRING_DATE_OFFSET_INVALID",
    "Date offset must be an integer number of days.",
  );
  return dateFromEpochDay(epochDay(value) + days);
}

export function dateDistanceDays(left: string, right: string): number {
  return epochDay(left) - epochDay(right);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function occurrenceForMonth(
  anchor: DateParts,
  monthIndex: number,
  mode: MonthlyDayMode,
): string | null {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = mode === "last" ? daysInMonth(year, month) : anchor.day;
  if (day > daysInMonth(year, month)) return null;
  return formatDate({ year, month, day });
}

function pushOccurrence(
  output: string[],
  candidate: string | null,
  start: string,
  end: string,
  anchorDate: string,
  cap: number,
): void {
  if (
    candidate === null ||
    candidate < start ||
    candidate > end ||
    candidate < anchorDate
  ) {
    return;
  }
  assertDomain(
    output.length < cap,
    "RECURRING_GENERATION_LIMIT",
    `Occurrence generation exceeds the ${cap} item limit.`,
  );
  output.push(candidate);
}

export function validateRecurringItem(item: RecurringItem): void {
  assertDomain(
    item.name.trim().length > 0 && item.name.trim().length <= 120,
    "RECURRING_NAME_INVALID",
    "Recurring item name is required and must not exceed 120 characters.",
  );
  assertDomain(
    item.eventType === "expense" || item.eventType === "income",
    "RECURRING_EVENT_TYPE_INVALID",
    "Recurring items support Expense or Income only.",
  );
  assertDomain(
    Number.isInteger(item.intervalCount) &&
      item.intervalCount >= 1 &&
      item.intervalCount <= 10_000,
    "RECURRING_INTERVAL_INVALID",
    "Recurring interval must be an integer between 1 and 10000.",
  );
  parseDate(item.anchorDate);
  if (item.startsOn) parseDate(item.startsOn);
  if (item.endsOn) parseDate(item.endsOn);
  assertDomain(
    !item.startsOn || !item.endsOn || item.startsOn <= item.endsOn,
    "RECURRING_ACTIVE_RANGE_INVALID",
    "Recurring start date must not be after its end date.",
  );
  assertDomain(
    item.frequency === "monthly"
      ? item.monthlyDayMode === "fixed" || item.monthlyDayMode === "last"
      : item.monthlyDayMode === null,
    "RECURRING_MONTHLY_MODE_INVALID",
    "Monthly day mode is required only for monthly recurrence.",
  );
  assertDomain(
    Number.isInteger(item.dateWindowBeforeDays) &&
      Number.isInteger(item.dateWindowAfterDays) &&
      item.dateWindowBeforeDays >= 0 &&
      item.dateWindowBeforeDays <= 31 &&
      item.dateWindowAfterDays >= 0 &&
      item.dateWindowAfterDays <= 31,
    "RECURRING_DATE_WINDOW_INVALID",
    "Recurring date windows must be integer days between 0 and 31.",
  );
  assertDomain(
    item.payeeMatchMode === "any" ||
      (item.payeeText !== null && item.payeeText.trim().length > 0),
    "RECURRING_PAYEE_INVALID",
    "Exact or contains payee matching requires payee text.",
  );
  const positive = (value: bigint | null) => value !== null && value > 0n;
  if (item.amountMode === "exact") {
    assertDomain(
      positive(item.amountAtomic) &&
        item.toleranceBps === null &&
        item.minAmountAtomic === null &&
        item.maxAmountAtomic === null,
      "RECURRING_AMOUNT_INVALID",
      "Exact amount mode requires one positive exact amount.",
    );
  } else if (item.amountMode === "approx") {
    assertDomain(
      positive(item.amountAtomic) &&
        item.toleranceBps !== null &&
        Number.isInteger(item.toleranceBps) &&
        item.toleranceBps >= 0 &&
        item.toleranceBps <= 10_000 &&
        item.minAmountAtomic === null &&
        item.maxAmountAtomic === null,
      "RECURRING_AMOUNT_INVALID",
      "Approximate amount mode requires a positive amount and explicit integer tolerance bps.",
    );
  } else {
    assertDomain(
      item.amountAtomic === null &&
        item.toleranceBps === null &&
        positive(item.minAmountAtomic) &&
        positive(item.maxAmountAtomic) &&
        item.minAmountAtomic! <= item.maxAmountAtomic!,
      "RECURRING_AMOUNT_INVALID",
      "Range amount mode requires positive min and max with min <= max.",
    );
  }
}

export function generateOccurrenceDates(
  item: RecurringItem,
  fromDate: string,
  toDate: string,
  cap = MAX_GENERATED_OCCURRENCES,
): string[] {
  validateRecurringItem(item);
  parseDate(fromDate);
  parseDate(toDate);
  assertDomain(
    fromDate <= toDate,
    "RECURRING_GENERATION_RANGE_INVALID",
    "Occurrence range start must not be after its end.",
  );
  assertDomain(
    Number.isInteger(cap) && cap >= 1 && cap <= MAX_GENERATED_OCCURRENCES,
    "RECURRING_GENERATION_LIMIT_INVALID",
    "Occurrence generation cap is invalid.",
  );
  if (!item.isActive) return [];
  const start = [fromDate, item.anchorDate, item.startsOn]
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1)!;
  const end = [toDate, item.endsOn]
    .filter((value): value is string => value !== null)
    .sort()[0]!;
  if (start > end) return [];

  const output: string[] = [];
  const anchor = parseDate(item.anchorDate);
  if (item.frequency === "daily" || item.frequency === "weekly") {
    const step = item.intervalCount * (item.frequency === "weekly" ? 7 : 1);
    const anchorDay = epochDay(item.anchorDate);
    const firstCycle = Math.max(
      0,
      Math.ceil((epochDay(start) - anchorDay) / step),
    );
    for (let cycle = firstCycle; ; cycle += 1) {
      const candidate = dateFromEpochDay(anchorDay + cycle * step);
      if (candidate > end) break;
      pushOccurrence(output, candidate, start, end, item.anchorDate, cap);
    }
    return output;
  }

  if (item.frequency === "monthly") {
    const anchorMonth = anchor.year * 12 + (anchor.month - 1);
    const from = parseDate(start);
    const fromMonth = from.year * 12 + (from.month - 1);
    const firstCycle = Math.max(
      0,
      Math.floor((fromMonth - anchorMonth) / item.intervalCount) - 1,
    );
    for (let cycle = firstCycle; ; cycle += 1) {
      const monthIndex = anchorMonth + cycle * item.intervalCount;
      const candidate = occurrenceForMonth(
        anchor,
        monthIndex,
        item.monthlyDayMode!,
      );
      const monthStart = occurrenceForMonth(anchor, monthIndex, "last")!;
      if (monthStart.slice(0, 7) > end.slice(0, 7)) break;
      pushOccurrence(output, candidate, start, end, item.anchorDate, cap);
    }
    return output;
  }

  const fromYear = parseDate(start).year;
  const firstCycle = Math.max(
    0,
    Math.floor((fromYear - anchor.year) / item.intervalCount) - 1,
  );
  for (let cycle = firstCycle; ; cycle += 1) {
    const year = anchor.year + cycle * item.intervalCount;
    if (year > parseDate(end).year) break;
    const validDay = anchor.day <= daysInMonth(year, anchor.month);
    const candidate = validDay
      ? formatDate({ year, month: anchor.month, day: anchor.day })
      : null;
    pushOccurrence(output, candidate, start, end, item.anchorDate, cap);
  }
  return output;
}

export function isGeneratedOccurrence(
  item: RecurringItem,
  occurrenceDate: string,
): boolean {
  return (
    generateOccurrenceDates(item, occurrenceDate, occurrenceDate, 1).length ===
    1
  );
}

export function validateRecurringLinkCompatibility(input: {
  item: RecurringItem | null | undefined;
  occurrenceDate: string;
  event: RecurringLinkEventState | null | undefined;
}): RecurringLinkCompatibilityResult {
  const { item, event } = input;
  if (!item) return { ok: false, reason: "item_missing" };
  try {
    validateRecurringItem(item);
  } catch {
    return { ok: false, reason: "item_invalid" };
  }
  try {
    if (
      !isGeneratedOccurrence({ ...item, isActive: true }, input.occurrenceDate)
    ) {
      return { ok: false, reason: "occurrence_invalid" };
    }
  } catch {
    return { ok: false, reason: "occurrence_invalid" };
  }
  if (!event) return { ok: false, reason: "event_missing" };
  if (event.bookId !== item.bookId) {
    return { ok: false, reason: "book_mismatch" };
  }
  if (event.eventType !== item.eventType) {
    return { ok: false, reason: "event_type_mismatch" };
  }
  const mainEntries = event.entries.filter((entry) => entry.role === "main");
  if (mainEntries.length !== 1) {
    return { ok: false, reason: "main_entry_cardinality" };
  }
  const main = mainEntries[0]!;
  if (main.accountId !== item.accountId) {
    return { ok: false, reason: "main_account_mismatch" };
  }
  if (
    item.eventType === "expense"
      ? main.amountAtomic >= 0n
      : main.amountAtomic <= 0n
  ) {
    return { ok: false, reason: "direction_mismatch" };
  }
  return { ok: true };
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function recurringAmountBounds(item: RecurringItem): {
  min: bigint;
  max: bigint;
} {
  validateRecurringItem(item);
  if (item.amountMode === "range") {
    return { min: item.minAmountAtomic!, max: item.maxAmountAtomic! };
  }
  if (item.amountMode === "exact") {
    return { min: item.amountAtomic!, max: item.amountAtomic! };
  }
  const basis = 10_000n;
  const tolerance = BigInt(item.toleranceBps!);
  const amount = item.amountAtomic!;
  return {
    min: (amount * (basis - tolerance)) / basis,
    max: ceilDivide(amount * (basis + tolerance), basis),
  };
}

export function recurringAmountMatches(
  item: RecurringItem,
  actualMagnitudeAtomic: bigint,
): boolean {
  if (actualMagnitudeAtomic < 0n) return false;
  const bounds = recurringAmountBounds(item);
  return (
    actualMagnitudeAtomic >= bounds.min && actualMagnitudeAtomic <= bounds.max
  );
}

export function recurringPayeeMatches(
  item: RecurringItem,
  actualPayee: string | null,
): boolean {
  if (item.payeeMatchMode === "any") return true;
  const actual = normalizeAutomationText(actualPayee);
  const expected = normalizeAutomationText(item.payeeText);
  return item.payeeMatchMode === "exact"
    ? actual === expected
    : actual.includes(expected);
}

export function recurringOccurrenceStatus(input: {
  occurrenceDate: string;
  currentLocalDate: string;
  afterWindowDays: number;
  linkedLedgerEventId?: string | null;
  skipped?: boolean;
}): GeneratedOccurrence["status"] {
  if (input.linkedLedgerEventId) return "linked";
  if (input.skipped) return "skipped";
  if (input.currentLocalDate < input.occurrenceDate) return "upcoming";
  return input.currentLocalDate <=
    addLocalDays(input.occurrenceDate, input.afterWindowDays)
    ? "due"
    : "overdue";
}

export function scoreRecurringMatch(input: {
  item: RecurringItem;
  occurrenceDate: string;
  actualDate: string;
  actualPayee: string | null;
  actualMagnitudeAtomic: bigint;
}): { score: number; reasons: string[] } | null {
  const { item } = input;
  const dayDelta = Math.abs(
    dateDistanceDays(input.actualDate, input.occurrenceDate),
  );
  if (
    input.actualDate <
      addLocalDays(input.occurrenceDate, -item.dateWindowBeforeDays) ||
    input.actualDate >
      addLocalDays(input.occurrenceDate, item.dateWindowAfterDays) ||
    !recurringAmountMatches(item, input.actualMagnitudeAtomic) ||
    !recurringPayeeMatches(item, input.actualPayee)
  ) {
    return null;
  }
  const reasons: string[] = [];
  let score = Math.max(0, 1000 - dayDelta * 100);
  reasons.push(dayDelta === 0 ? "exact date" : `date ${dayDelta} day(s) away`);
  if (item.payeeMatchMode !== "any") {
    const exact =
      normalizeAutomationText(input.actualPayee) ===
      normalizeAutomationText(item.payeeText);
    score += exact ? 250 : 125;
    reasons.push(exact ? "exact payee" : "payee contains expected text");
  }
  if (
    item.amountMode !== "range" &&
    input.actualMagnitudeAtomic === item.amountAtomic
  ) {
    score += 200;
    reasons.push("exact expected amount");
  } else {
    score += 100;
    reasons.push("amount inside expected bounds");
  }
  return { score, reasons };
}

export function parsePositiveAtomicText(value: string): bigint {
  assertDomain(
    /^[0-9]+$/.test(value),
    "RECURRING_ATOMIC_INVALID",
    "Recurring atomic amount must be an unsigned base-10 integer string.",
  );
  const parsed = BigInt(value);
  assertDomain(
    parsed > 0n,
    "RECURRING_ATOMIC_INVALID",
    "Recurring atomic amount must be positive.",
  );
  return parsed;
}
