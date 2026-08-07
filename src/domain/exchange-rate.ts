import Decimal from "decimal.js";

import { assertDomain } from "./errors";
import { validateScale } from "./money";

const ExchangeDecimal = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
});

export interface ExecutedExchangeRateInput {
  sourceAmountAtomic: bigint;
  sourceScale: number;
  destinationAmountAtomic: bigint;
  destinationScale: number;
  significantDigits?: number;
}

export function deriveExecutedExchangeRate(
  input: ExecutedExchangeRateInput,
): string {
  validateScale(input.sourceScale);
  validateScale(input.destinationScale);
  assertDomain(
    input.sourceAmountAtomic > 0n,
    "INVALID_EXCHANGE_SOURCE",
    "Exchange source quantity must be greater than zero.",
  );
  assertDomain(
    input.destinationAmountAtomic > 0n,
    "INVALID_EXCHANGE_DESTINATION",
    "Exchange destination quantity must be greater than zero.",
  );

  const significantDigits = input.significantDigits ?? 24;
  assertDomain(
    Number.isInteger(significantDigits) &&
      significantDigits >= 1 &&
      significantDigits <= 60,
    "INVALID_EXCHANGE_RATE_PRECISION",
    "Executed rate precision must be an integer between 1 and 60.",
  );

  const numerator = new ExchangeDecimal(
    input.destinationAmountAtomic.toString(),
  ).mul(new ExchangeDecimal(10).pow(input.sourceScale));
  const denominator = new ExchangeDecimal(
    input.sourceAmountAtomic.toString(),
  ).mul(new ExchangeDecimal(10).pow(input.destinationScale));

  return numerator
    .div(denominator)
    .toSignificantDigits(significantDigits)
    .toFixed();
}
