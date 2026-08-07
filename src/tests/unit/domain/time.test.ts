import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../../domain/errors";
import {
  localDateRangeToUtc,
  localDateTimeToUtc,
  monthInTimeZone,
  monthUtcRange,
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

  it("round-trips an instant for form display and derives its local month", () => {
    const instant = "2026-08-07T02:15:30.123Z";
    expect(utcInstantToLocalDateTime(instant, "Asia/Shanghai")).toBe(
      "2026-08-07T10:15:30.123",
    );
    expect(monthInTimeZone(instant, "Asia/Shanghai")).toBe("2026-08");
  });
});
