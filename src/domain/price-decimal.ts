import Decimal from "decimal.js";

import { assertDomain } from "./errors";
import { validateScale } from "./money";

const POSITIVE_PLAIN_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export const PriceDecimal = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -1_000_000,
  toExpPos: 1_000_000,
});

export type PriceDecimalValue = InstanceType<typeof PriceDecimal>;

export function priceDecimalFromText(input: string): PriceDecimalValue {
  const normalized = input.trim();
  assertDomain(
    POSITIVE_PLAIN_DECIMAL_PATTERN.test(normalized),
    "INVALID_PRICE_DECIMAL",
    "Price must be positive plain decimal text without a sign, separators, or scientific notation.",
  );

  const value = new PriceDecimal(normalized);
  assertDomain(
    value.isFinite() && value.isPositive() && !value.isZero(),
    "INVALID_PRICE_DECIMAL",
    "Price must be greater than zero.",
  );
  return value;
}

export function decimalText(value: PriceDecimalValue): string {
  assertDomain(
    value.isFinite(),
    "INVALID_PRICE_DECIMAL",
    "Price calculation must produce a finite decimal.",
  );
  return value.isZero() ? "0" : value.toFixed();
}

export function normalizePositiveDecimalText(input: string): string {
  return decimalText(priceDecimalFromText(input));
}

export function normalizeExternalNumberDecimal(input: number): string {
  const value = new PriceDecimal(String(input));
  assertDomain(
    value.isFinite() && value.isPositive() && !value.isZero(),
    "INVALID_PRICE_DECIMAL",
    "External price numbers must be finite and greater than zero.",
  );
  return decimalText(value);
}

export function multiplyDecimalTexts(left: string, right: string): string {
  return decimalText(
    priceDecimalFromText(left).mul(priceDecimalFromText(right)),
  );
}

export function divideDecimalTexts(
  numerator: string,
  denominator: string,
): string {
  return decimalText(
    priceDecimalFromText(numerator).div(priceDecimalFromText(denominator)),
  );
}

export function invertDecimalText(input: string): string {
  return decimalText(new PriceDecimal(1).div(priceDecimalFromText(input)));
}

export function decimalQuantityFromAtomic(
  amountAtomic: bigint | string,
  scale: number,
): PriceDecimalValue {
  validateScale(scale);
  const atomicText =
    typeof amountAtomic === "bigint" ? amountAtomic.toString() : amountAtomic;
  assertDomain(
    /^-?\d+$/.test(atomicText),
    "INVALID_ATOMIC_DECIMAL_SOURCE",
    "Atomic quantity must be signed base-10 integer text.",
  );
  return new PriceDecimal(atomicText).div(new PriceDecimal(10).pow(scale));
}

export function roundDecimalText(input: string, scale: number): string {
  validateScale(scale);
  const value = new PriceDecimal(input);
  assertDomain(
    value.isFinite(),
    "INVALID_VALUATION_DECIMAL",
    "Valuation must be a finite decimal.",
  );
  return value
    .toDecimalPlaces(scale, PriceDecimal.ROUND_HALF_UP)
    .toFixed(scale);
}
