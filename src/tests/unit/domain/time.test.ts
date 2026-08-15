import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../../domain/errors";
import {
  addLocalDateDays,
  enumerateLocalDates,
  lastCompletedLocalDate,
  localDateEndInclusiveUtc,
  localDateRangeToUtc,
  localDateTimeToUtc,
  monthInTimeZone,
  monthUtcRange,
  utcInstantToLocalDate,
  utcInstantToLocalDateTime,
} from "../../../domain/time";

describe("app timezone boundaries", () => {
  it("converts an Asia/Shanghai natural month to a UTC half-open range", () => {
    expect(monthUtcRange("2026-08", "Asia/Shanghai")).toEqual({
      startInclusive: "2026-07-31T16:00:00.000Z",
      endExclusive: "2026-08-31T16:00:00.000Z",
    });
  });

  it("uses the offset at each boundary across daylight saving time", () => {
    expect(monthUtcRange("2026-03", "America/New_York")).toEqual({
      startInclusive: "2026-03-01T05:00:00.000Z",
      endExclusive: "2026-04-01T04:00:00.000Z",
    });
  });

  it("rejects a nonexistent wall time and chooses the earlier repeated instant", () => {
    expect(() =>
      localDateTimeToUtc("2026-03-08T02:30:00.000", "America/New_York"),
    ).toThrowError(DomainValidationError);
    expect(
      localDateTimeToUtc("2026-11-01T01:30:00.000", "America/New_York"),
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("converts inclusive local dates to explicit UTC bounds", () => {
    expect(
      localDateRangeToUtc(
        { from: "2026-08-01", to: "2026-08-31" },
        "Asia/Shanghai",
      ),
    ).toEqual({
      startInclusive: "2026-07-31T16:00:00.000Z",
      endExclusive: "2026-08-31T16:00:00.000Z",
    });
  });

  it.each([
    {
      date: "2026-03-08",
      timeZone: "America/Los_Angeles",
      expected: "2026-03-09T06:59:59.999Z",
    },
    {
      date: "2026-11-01",
      timeZone: "America/Los_Angeles",
      expected: "2026-11-02T07:59:59.999Z",
    },
    {
      date: "2026-08-15",
      timeZone: "Asia/Shanghai",
      expected: "2026-08-15T15:59:59.999Z",
    },
  ])(
    "derives the inclusive day end across DST for $date in $timeZone",
    ({ date, timeZone, expected }) => {
      expect(localDateEndInclusiveUtc(date, timeZone)).toBe(expected);
    },
  );

  it("uses calendar arithmetic for ranges and the last completed day", () => {
    expect(addLocalDateDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(enumerateLocalDates("2026-08-13", "2026-08-15")).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    expect(
      lastCompletedLocalDate("2026-08-15T01:00:00.000Z", "America/Los_Angeles"),
    ).toBe("2026-08-13");
    expect(() =>
      enumerateLocalDates("2026-01-01", "2026-01-03", 2),
    ).toThrowError(DomainValidationError);
  });

  it("round-trips an instant for form display and derives its local month", () => {
    const instant = "2026-08-07T02:15:30.123Z";
    expect(utcInstantToLocalDateTime(instant, "Asia/Shanghai")).toBe(
      "2026-08-07T10:15:30.123",
    );
    expect(monthInTimeZone(instant, "Asia/Shanghai")).toBe("2026-08");
  });

  it.each([
    {
      timeZone: "Asia/Shanghai",
      instant: "2026-08-14T16:30:00.000Z",
      expected: "2026-08-15",
    },
    {
      timeZone: "America/Los_Angeles",
      instant: "2026-08-15T06:30:00.000Z",
      expected: "2026-08-14",
    },
  ])(
    "derives the App-local recurring date in $timeZone",
    ({ timeZone, instant, expected }) => {
      expect(utcInstantToLocalDate(instant, timeZone)).toBe(expected);
    },
  );

  it("assigns an event at exact next local midnight to the next day", () => {
    expect(
      utcInstantToLocalDate("2026-08-14T16:00:00.000Z", "Asia/Shanghai"),
    ).toBe("2026-08-15");
  });
});
