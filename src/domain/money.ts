import { assertDomain, DomainValidationError } from "./errors";

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const MAX_ASSET_SCALE = 30;

export interface FormatAtomicOptions {
  trimTrailingZeros?: boolean;
}

export function validateScale(scale: number): void {
  assertDomain(
    Number.isInteger(scale) && scale >= 0 && scale <= MAX_ASSET_SCALE,
    "INVALID_SCALE",
    `Asset scale must be an integer between 0 and ${MAX_ASSET_SCALE}.`,
  );
}

export function parseDecimalToAtomic(input: string, scale: number): bigint {
  validateScale(scale);

  const normalized = input.trim();
  const match = DECIMAL_PATTERN.exec(normalized);
  if (!match) {
    throw new DomainValidationError(
      "INVALID_DECIMAL",
      "Amount must be plain decimal text without separators or scientific notation.",
    );
  }

  const [, sign, whole, fraction = ""] = match;
  assertDomain(
    fraction.length <= scale,
    "EXCESS_FRACTIONAL_DIGITS",
    `Amount has more than ${scale} fractional digits.`,
  );

  const digits = `${whole}${fraction.padEnd(scale, "0")}`;
  const magnitude = BigInt(digits);

  return sign === "-" ? -magnitude : magnitude;
}

export function formatAtomic(
  amount: bigint,
  scale: number,
  options: FormatAtomicOptions = {},
): string {
  validateScale(scale);

  const isNegative = amount < 0n;
  const absoluteDigits = (isNegative ? -amount : amount).toString();
  const sign = isNegative ? "-" : "";

  if (scale === 0) {
    return `${sign}${absoluteDigits}`;
  }

  const padded = absoluteDigits.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale);
  const rawFraction = padded.slice(-scale);
  const fraction = options.trimTrailingZeros
    ? rawFraction.replace(/0+$/, "")
    : rawFraction;

  return fraction.length > 0
    ? `${sign}${whole}.${fraction}`
    : `${sign}${whole}`;
}
