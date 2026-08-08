import { formatAtomic } from "./money";
import {
  decimalQuantityFromAtomic,
  decimalText,
  PriceDecimal,
  roundDecimalText,
} from "./price-decimal";
import type { QuoteResolution, ValuationAsset } from "./quote-types";

export interface NativeAssetQuantity {
  asset: ValuationAsset;
  quantityAtomic: bigint;
}

export interface AssetValuationResult {
  asset: ValuationAsset;
  quantityAtomic: string;
  quantityDisplay: string;
  resolution: QuoteResolution;
  valueText: string | null;
  valueDisplay: string | null;
}

export interface PortfolioValuationResult {
  queryTime: string;
  homeAsset: ValuationAsset;
  totalValueText: string;
  totalValueDisplay: string;
  isComplete: boolean;
  valuedNonZeroAssetCount: number;
  missingNonZeroAssetCount: number;
  lines: AssetValuationResult[];
}

export function calculatePortfolioValuation(input: {
  queryTime: string;
  homeAsset: ValuationAsset;
  quantities: readonly NativeAssetQuantity[];
  resolve: (assetId: string) => QuoteResolution;
}): PortfolioValuationResult {
  let total = new PriceDecimal(0);
  let valuedNonZeroAssetCount = 0;
  let missingNonZeroAssetCount = 0;

  const lines = [...input.quantities]
    .sort(
      (left, right) =>
        left.asset.sortOrder - right.asset.sortOrder ||
        left.asset.code.localeCompare(right.asset.code) ||
        left.asset.id.localeCompare(right.asset.id),
    )
    .map((quantity) => {
      const resolution = input.resolve(quantity.asset.id);
      const isNonZero = quantity.quantityAtomic !== 0n;
      let valueText: string | null = null;
      let valueDisplay: string | null = null;
      if (resolution.ok) {
        const value = decimalQuantityFromAtomic(
          quantity.quantityAtomic,
          quantity.asset.scale,
        ).mul(resolution.rateText);
        valueText = decimalText(value);
        valueDisplay = roundDecimalText(valueText, input.homeAsset.scale);
        total = total.add(value);
        if (isNonZero) valuedNonZeroAssetCount += 1;
      } else if (isNonZero) {
        missingNonZeroAssetCount += 1;
      }
      return {
        asset: quantity.asset,
        quantityAtomic: quantity.quantityAtomic.toString(),
        quantityDisplay: `${formatAtomic(
          quantity.quantityAtomic,
          quantity.asset.scale,
        )} ${quantity.asset.code}`,
        resolution,
        valueText,
        valueDisplay,
      };
    });

  const totalValueText = decimalText(total);
  return {
    queryTime: input.queryTime,
    homeAsset: input.homeAsset,
    totalValueText,
    totalValueDisplay: roundDecimalText(totalValueText, input.homeAsset.scale),
    isComplete: missingNonZeroAssetCount === 0,
    valuedNonZeroAssetCount,
    missingNonZeroAssetCount,
    lines,
  };
}
