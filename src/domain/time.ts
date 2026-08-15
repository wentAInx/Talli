import { assertDomain } from "./errors";

const CANONICAL_UTC_ISO_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export interface UtcRange {
  startInclusive: string;
  endExclusive: string;
}

const ZONED_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = ZONED_FORMATTERS.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  });
  ZONED_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

export function assertIanaTimeZone(timeZone: string): string {
  const normalized = timeZone.trim();
  assertDomain(
    normalized.length > 0,
    "INVALID_TIME_ZONE",
    "App timezone is required.",
  );
  try {
    formatterFor(normalized).format(new Date(0));
  } catch {
    assertDomain(false, "INVALID_TIME_ZONE", "App timezone is not valid.");
  }
  return normalized;
}

function zonedPartsAt(epochMilliseconds: number, timeZone: string) {
  const values = new Map(
    formatterFor(timeZone)
      .formatToParts(new Date(epochMilliseconds))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
    millisecond: Number(values.get("fractionalSecond") ?? "0"),
  } satisfies LocalDateTimeParts;
}

function localPartsKey(parts: LocalDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

function sameLocalParts(
  left: LocalDateTimeParts,
  right: LocalDateTimeParts,
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second &&
    left.millisecond === right.millisecond
  );
}

function assertRealLocalParts(parts: LocalDateTimeParts): void {
  const iso = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour,
  )}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond, 3)}Z`;
  const parsed = new Date(iso);
  assertDomain(
    !Number.isNaN(parsed.getTime()) && parsed.toISOString() === iso,
    "INVALID_LOCAL_DATE_TIME",
    "Local date/time must be a real calendar value.",
  );
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  assertDomain(
    match,
    "INVALID_LOCAL_DATE_TIME",
    "Local date/time must use YYYY-MM-DDTHH:mm with optional seconds.",
  );
  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0"),
    millisecond: Number((match[7] ?? "0").padEnd(3, "0")),
  };
  assertRealLocalParts(parts);
  return parts;
}

function offsetAt(epochMilliseconds: number, timeZone: string): number {
  const instantAtWholeMillisecond = Math.trunc(epochMilliseconds);
  return (
    localPartsKey(zonedPartsAt(instantAtWholeMillisecond, timeZone)) -
    instantAtWholeMillisecond
  );
}

export function localDateTimeToUtc(
  value: string,
  timeZone: string,
  options: { disambiguation?: "reject" | "compatible" } = {},
): string {
  const zone = assertIanaTimeZone(timeZone);
  const desired = parseLocalDateTime(value);
  const naiveUtc = localPartsKey(desired);
  const offsets = new Set<number>();
  for (const hourDelta of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(offsetAt(naiveUtc + hourDelta * 60 * 60 * 1000, zone));
  }

  const candidates = [...offsets].map((offset) => naiveUtc - offset);
  const exact = candidates
    .filter((candidate) =>
      sameLocalParts(zonedPartsAt(candidate, zone), desired),
    )
    .sort((left, right) => left - right);
  if (exact.length > 0) {
    return new Date(exact[0]).toISOString();
  }

  if (options.disambiguation === "compatible") {
    const desiredKey = localPartsKey(desired);
    const shifted = candidates
      .map((candidate) => ({
        candidate,
        localKey: localPartsKey(zonedPartsAt(candidate, zone)),
      }))
      .filter((candidate) => candidate.localKey > desiredKey)
      .sort(
        (left, right) =>
          left.localKey - right.localKey || left.candidate - right.candidate,
      );
    if (shifted.length > 0) {
      return new Date(shifted[0].candidate).toISOString();
    }
  }

  assertDomain(
    false,
    "NONEXISTENT_LOCAL_DATE_TIME",
    "Local date/time does not exist in the configured app timezone.",
  );
}

export function utcInstantToLocalDateTime(
  value: string,
  timeZone: string,
): string {
  const epochMilliseconds = canonicalUtcInstantValue(value);
  const parts = zonedPartsAt(epochMilliseconds, assertIanaTimeZone(timeZone));
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour,
  )}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond, 3)}`;
}

export function utcInstantToLocalDate(value: string, timeZone: string): string {
  return utcInstantToLocalDateTime(value, timeZone).slice(0, 10);
}

function parseLocalDate(
  value: string,
): Pick<LocalDateTimeParts, "year" | "month" | "day"> {
  const match = LOCAL_DATE_PATTERN.exec(value);
  assertDomain(match, "INVALID_LOCAL_DATE", "Local date must use YYYY-MM-DD.");
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  assertRealLocalParts({
    ...parts,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  return parts;
}

export function canonicalLocalDate(value: string): string {
  const parts = parseLocalDate(value);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addLocalDateDays(value: string, days: number): string {
  assertDomain(
    Number.isSafeInteger(days),
    "INVALID_DATE_OFFSET",
    "Calendar-day offset must be a safe integer.",
  );
  const parts = parseLocalDate(value);
  const next = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(
    next.getUTCDate(),
  )}`;
}

export function localDateDistance(from: string, to: string): number {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  return Math.trunc(
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
      (24 * 60 * 60 * 1000),
  );
}

export function enumerateLocalDates(
  from: string,
  to: string,
  maxPoints = 5_000,
): string[] {
  const distance = localDateDistance(from, to);
  assertDomain(
    distance >= 0,
    "INVALID_DATE_RANGE",
    "Date range start must not be after its end.",
  );
  assertDomain(
    Number.isSafeInteger(maxPoints) && maxPoints > 0,
    "INVALID_RANGE_LIMIT",
    "Date range limit must be a positive safe integer.",
  );
  assertDomain(
    distance + 1 <= maxPoints,
    "DATE_RANGE_TOO_LARGE",
    `Date range may contain at most ${maxPoints} days.`,
  );
  return Array.from({ length: distance + 1 }, (_, index) =>
    addLocalDateDays(from, index),
  );
}

export function localDateRangeToUtc(
  input: { from?: string | null; to?: string | null },
  timeZone: string,
): Partial<UtcRange> {
  const zone = assertIanaTimeZone(timeZone);
  const startInclusive = input.from
    ? localDateTimeToUtc(`${input.from}T00:00:00.000`, zone, {
        disambiguation: "compatible",
      })
    : undefined;
  const endExclusive = input.to
    ? localDateTimeToUtc(
        `${addLocalDateDays(input.to, 1)}T00:00:00.000`,
        zone,
        {
          disambiguation: "compatible",
        },
      )
    : undefined;
  if (startInclusive && endExclusive) {
    assertDomain(
      startInclusive < endExclusive,
      "INVALID_DATE_RANGE",
      "Date range start must not be after its end.",
    );
  }
  return { startInclusive, endExclusive };
}

export function localDateEndInclusiveUtc(
  date: string,
  timeZone: string,
): string {
  const { endExclusive } = localDateRangeToUtc(
    { from: date, to: date },
    timeZone,
  );
  assertDomain(
    endExclusive,
    "INVALID_DATE_RANGE",
    "Local date end could not be resolved.",
  );
  return new Date(canonicalUtcInstantValue(endExclusive) - 1).toISOString();
}

export function lastCompletedLocalDate(now: string, timeZone: string): string {
  return addLocalDateDays(utcInstantToLocalDate(now, timeZone), -1);
}

export function monthUtcRange(month: string, timeZone: string): UtcRange {
  const match = MONTH_PATTERN.exec(month);
  assertDomain(
    match && Number(match[2]) >= 1 && Number(match[2]) <= 12,
    "INVALID_REPORT_MONTH",
    "Report month must use YYYY-MM.",
  );
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonthText = `${pad(nextMonth.getUTCFullYear(), 4)}-${pad(
    nextMonth.getUTCMonth() + 1,
  )}`;
  const zone = assertIanaTimeZone(timeZone);
  return {
    startInclusive: localDateTimeToUtc(`${month}-01T00:00:00.000`, zone, {
      disambiguation: "compatible",
    }),
    endExclusive: localDateTimeToUtc(`${nextMonthText}-01T00:00:00.000`, zone, {
      disambiguation: "compatible",
    }),
  };
}

export function monthInTimeZone(value: string, timeZone: string): string {
  const parts = zonedPartsAt(
    canonicalUtcInstantValue(value),
    assertIanaTimeZone(timeZone),
  );
  return `${pad(parts.year, 4)}-${pad(parts.month)}`;
}

export function canonicalUtcInstantValue(value: string): number {
  assertDomain(
    CANONICAL_UTC_ISO_PATTERN.test(value),
    "INVALID_UTC_TIMESTAMP",
    "Timestamp must use canonical UTC ISO format YYYY-MM-DDTHH:mm:ss.sssZ.",
  );

  const parsed = new Date(value);
  assertDomain(
    !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value,
    "INVALID_UTC_TIMESTAMP",
    "Timestamp must be a real calendar instant in canonical UTC ISO format.",
  );

  return parsed.getTime();
}
