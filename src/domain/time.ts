import { assertDomain } from "./errors";

const CANONICAL_UTC_ISO_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;

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
