import { canonicalUtcInstantValue } from "../domain/time";
import { assertService } from "./errors";

export function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  assertService(
    normalized.length > 0,
    "REQUIRED_TEXT",
    `${label} is required.`,
  );
  return normalized;
}

export function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function canonicalTimestamp(value: string): string {
  canonicalUtcInstantValue(value);
  return value;
}

export function uniqueTagIds(values: readonly string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  const normalized = values.map((value) => requiredText(value, "Tag id"));
  return [...new Set(normalized)].sort();
}
