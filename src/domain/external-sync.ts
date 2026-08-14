import { DomainValidationError, assertDomain } from "./errors";
import { parseDecimalToAtomic } from "./money";

const EXTERNAL_DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

export type ExternalPrecisionStatus = "exact" | "excess_precision" | "unmapped";

export type ExternalObjectType =
  | "kraken_ledger"
  | "kraken_trade"
  | "evm_transaction"
  | "evm_transfer"
  | "file_transaction";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export interface ExternalAtomicConversion {
  amountAtomic: bigint | null;
  precisionStatus: ExternalPrecisionStatus;
}

export type ExternalCandidateStatus =
  | "pending"
  | "needs_mapping"
  | "ignored"
  | "imported"
  | "unsupported"
  | "source_changed";

export type ExternalCandidateEventType =
  "exchange" | "transfer" | "income" | "expense" | "unknown";

export type ExternalCandidateLegRole =
  "source" | "destination" | "fee" | "external_in" | "external_out" | "unknown";

export interface ExternalCandidateLegDraft {
  role: ExternalCandidateLegRole;
  providerAssetKey: string;
  amountText: string;
  note?: string | null;
}

export interface ExternalCandidateDraft {
  stableKey: string;
  suggestedEventType: ExternalCandidateEventType;
  initialStatus: Extract<
    ExternalCandidateStatus,
    "pending" | "needs_mapping" | "unsupported"
  >;
  occurredAt: string;
  title: string;
  normalizationVersion: number;
  sourceFingerprint: string;
  primarySourceExternalIds: string[];
  crossCheckSourceExternalIds: string[];
  legs: ExternalCandidateLegDraft[];
  warnings: string[];
}

export function validatedExternalDecimalText(input: string): string {
  const normalized = input.trim();
  assertDomain(
    EXTERNAL_DECIMAL_PATTERN.test(normalized),
    "INVALID_EXTERNAL_DECIMAL",
    "External amount must be plain decimal text without separators or scientific notation.",
  );
  return normalized;
}

export function canonicalExternalDecimalText(input: string): string {
  const validated = validatedExternalDecimalText(input);
  if (!validated.includes(".")) return validated;
  return validated.replace(/0+$/, "").replace(/\.$/, "");
}

export function externalDecimalToAtomic(
  input: string,
  scale: number | null,
): ExternalAtomicConversion {
  const amountText = canonicalExternalDecimalText(input);
  if (scale === null) {
    return { amountAtomic: null, precisionStatus: "unmapped" };
  }

  try {
    return {
      amountAtomic: parseDecimalToAtomic(amountText, scale),
      precisionStatus: "exact",
    };
  } catch (error) {
    if (
      error instanceof DomainValidationError &&
      error.code === "EXCESS_FRACTIONAL_DIGITS"
    ) {
      return { amountAtomic: null, precisionStatus: "excess_precision" };
    }
    throw error;
  }
}

export function externalBalanceDifference(
  externalAmountAtomic: bigint,
  ledgerBalanceAtomic: bigint,
): bigint {
  return externalAmountAtomic - ledgerBalanceAtomic;
}

export function externalStableKey(
  objectType: ExternalObjectType,
  externalId: string,
): string {
  const normalizedId = externalId.trim();
  assertDomain(
    normalizedId.length > 0,
    "INVALID_EXTERNAL_ID",
    "External object ID cannot be empty.",
  );
  assertDomain(
    objectType === "kraken_trade" || objectType === "kraken_ledger",
    "INVALID_EXTERNAL_OBJECT_TYPE",
    "Use the EVM transaction stable-key helpers for on-chain candidates.",
  );
  return objectType === "kraken_trade"
    ? `kraken:trade:${normalizedId}`
    : `kraken:ledger:${normalizedId}`;
}

function canonicalizeJson(value: CanonicalJsonValue): CanonicalJsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key]!)]),
    );
  }
  if (typeof value === "number") {
    assertDomain(
      Number.isFinite(value),
      "INVALID_EXTERNAL_JSON",
      "External JSON cannot contain non-finite numbers.",
    );
  }
  return value;
}

export function canonicalExternalJson(value: CanonicalJsonValue): string {
  return JSON.stringify(canonicalizeJson(value));
}
