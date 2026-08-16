import {
  PriceDecimal,
  decimalQuantityFromAtomic,
  decimalText,
  priceDecimalFromText,
  type PriceDecimalValue,
} from "./price-decimal";
import type {
  AllocationSlice,
  HistoricalAllocationResult,
  HistoricalFlowBucket,
  HistoricalNetWorthPoint,
  HistoricalQuoteResolution,
  NetWorthBridgePoint,
} from "./historical-quote-types";
import type { ValuationAsset } from "./quote-types";

export interface HistoricalQuantity {
  asset: ValuationAsset;
  quantityAtomic: bigint;
}

export interface HistoricalEntryFact {
  entryId: string;
  eventId: string;
  occurredAt: string;
  eventType: "expense" | "income" | "transfer" | "exchange";
  entryRole: "main" | "source" | "destination" | "fee";
  assetId: string;
  amountAtomic: bigint;
}

type ResolveHistorical = (
  assetId: string,
  queryTime: string,
  localDate: string,
) => HistoricalQuoteResolution;

function zero(): PriceDecimalValue {
  return new PriceDecimal(0);
}

function valueOf(
  quantityAtomic: bigint,
  scale: number,
  rateText: string,
): PriceDecimalValue {
  return decimalQuantityFromAtomic(quantityAtomic, scale).mul(
    priceDecimalFromText(rateText),
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function calculateHistoricalNetWorthPoint(input: {
  localDate: string;
  cutoffUtc: string;
  quantities: readonly HistoricalQuantity[];
  resolve: ResolveHistorical;
}): HistoricalNetWorthPoint {
  let known = zero();
  let grossAssets = zero();
  let grossLiabilities = zero();
  let isDegraded = false;
  const missingAssetIds: string[] = [];

  for (const quantity of input.quantities) {
    if (quantity.quantityAtomic === 0n) continue;
    const resolution = input.resolve(
      quantity.asset.id,
      input.cutoffUtc,
      input.localDate,
    );
    if (!resolution.ok) {
      missingAssetIds.push(quantity.asset.id);
      continue;
    }
    const value = valueOf(
      quantity.quantityAtomic,
      quantity.asset.scale,
      resolution.rateText,
    );
    known = known.add(value);
    if (value.isPositive()) grossAssets = grossAssets.add(value);
    if (value.isNegative()) grossLiabilities = grossLiabilities.add(value);
    isDegraded ||= resolution.degraded;
  }

  const missing = sortedUnique(missingAssetIds);
  return {
    localDate: input.localDate,
    cutoffUtc: input.cutoffUtc,
    knownValueText: decimalText(known),
    completeValueText: missing.length === 0 ? decimalText(known) : null,
    grossAssetsKnownText: decimalText(grossAssets),
    grossLiabilitiesKnownText: decimalText(grossLiabilities),
    isComplete: missing.length === 0,
    isDegraded,
    missingAssetIds: missing,
  };
}

function allocationSlices(
  values: ReadonlyMap<string, { label: string; value: PriceDecimalValue }>,
  grossAssets: PriceDecimalValue,
  complete: boolean,
): AllocationSlice[] {
  return [...values.entries()]
    .filter(([, value]) => value.value.isPositive())
    .sort(
      (left, right) =>
        right[1].value.comparedTo(left[1].value) ||
        left[0].localeCompare(right[0]),
    )
    .map(([key, item]) => ({
      key,
      label: item.label,
      valueText: decimalText(item.value),
      shareText:
        complete && grossAssets.isPositive()
          ? decimalText(item.value.div(grossAssets))
          : null,
    }));
}

function liabilitySlices(
  values: ReadonlyMap<string, { label: string; value: PriceDecimalValue }>,
): AllocationSlice[] {
  return [...values.entries()]
    .filter(([, value]) => value.value.isNegative())
    .sort(
      (left, right) =>
        left[1].value.comparedTo(right[1].value) ||
        left[0].localeCompare(right[0]),
    )
    .map(([key, item]) => ({
      key,
      label: item.label,
      valueText: decimalText(item.value),
      shareText: null,
    }));
}

export function calculateHistoricalAllocation(input: {
  localDate: string;
  cutoffUtc: string;
  quantities: readonly HistoricalQuantity[];
  resolve: ResolveHistorical;
}): HistoricalAllocationResult {
  let grossAssets = zero();
  let grossLiabilities = zero();
  const missingAssetIds: string[] = [];
  const byAsset = new Map<
    string,
    { label: string; value: PriceDecimalValue }
  >();
  const byAssetClass = new Map<
    string,
    { label: string; value: PriceDecimalValue }
  >();
  const byFiatCurrency = new Map<
    string,
    { label: string; value: PriceDecimalValue }
  >();
  const liabilitiesByAsset = new Map<
    string,
    { label: string; value: PriceDecimalValue }
  >();

  for (const quantity of input.quantities) {
    if (quantity.quantityAtomic === 0n) continue;
    const resolution = input.resolve(
      quantity.asset.id,
      input.cutoffUtc,
      input.localDate,
    );
    if (!resolution.ok) {
      missingAssetIds.push(quantity.asset.id);
      continue;
    }
    const value = valueOf(
      quantity.quantityAtomic,
      quantity.asset.scale,
      resolution.rateText,
    );
    if (value.isNegative()) {
      grossLiabilities = grossLiabilities.add(value);
      const liability = liabilitiesByAsset.get(quantity.asset.id) ?? {
        label: quantity.asset.code,
        value: zero(),
      };
      liability.value = liability.value.add(value);
      liabilitiesByAsset.set(quantity.asset.id, liability);
      continue;
    }
    if (!value.isPositive()) continue;
    grossAssets = grossAssets.add(value);
    byAsset.set(quantity.asset.id, {
      label: quantity.asset.code,
      value,
    });
    const assetClass = byAssetClass.get(quantity.asset.assetType) ?? {
      label: quantity.asset.assetType,
      value: zero(),
    };
    assetClass.value = assetClass.value.add(value);
    byAssetClass.set(quantity.asset.assetType, assetClass);
    if (quantity.asset.assetType === "fiat") {
      byFiatCurrency.set(quantity.asset.code, {
        label: quantity.asset.code,
        value,
      });
    }
  }

  const missing = sortedUnique(missingAssetIds);
  const complete = missing.length === 0;
  return {
    localDate: input.localDate,
    isComplete: complete,
    grossAssetsText: complete ? decimalText(grossAssets) : null,
    grossLiabilitiesText: complete ? decimalText(grossLiabilities) : null,
    netWorthText: complete
      ? decimalText(grossAssets.add(grossLiabilities))
      : null,
    byAsset: allocationSlices(byAsset, grossAssets, complete),
    byAssetClass: allocationSlices(byAssetClass, grossAssets, complete),
    byFiatCurrency: allocationSlices(byFiatCurrency, grossAssets, complete),
    liabilitiesByAsset: liabilitySlices(liabilitiesByAsset),
    missingAssetIds: missing,
  };
}

type FlowKind = "income" | "expense" | "fees";

function flowKind(entry: HistoricalEntryFact): FlowKind | null {
  if (entry.eventType === "income" && entry.entryRole === "main") {
    return "income";
  }
  if (entry.eventType === "expense" && entry.entryRole === "main") {
    return "expense";
  }
  if (
    (entry.eventType === "transfer" || entry.eventType === "exchange") &&
    entry.entryRole === "fee"
  ) {
    return "fees";
  }
  return null;
}

export function calculateHistoricalCashFlow(input: {
  periods: readonly string[];
  entries: readonly HistoricalEntryFact[];
  assets: ReadonlyMap<string, ValuationAsset>;
  timeZoneDate: (instant: string) => string;
  resolve: ResolveHistorical;
}): HistoricalFlowBucket[] {
  const buckets = new Map(
    input.periods.map((period) => [
      period,
      {
        income: zero(),
        expense: zero(),
        fees: zero(),
        missingIncome: false,
        missingExpense: false,
        missingFees: false,
        missingCount: 0,
      },
    ]),
  );

  for (const entry of input.entries) {
    const kind = flowKind(entry);
    if (!kind) continue;
    const localDate = input.timeZoneDate(entry.occurredAt);
    const bucket = buckets.get(localDate.slice(0, 7));
    const asset = input.assets.get(entry.assetId);
    if (!bucket || !asset) continue;
    const resolution = input.resolve(
      entry.assetId,
      entry.occurredAt,
      localDate,
    );
    if (!resolution.ok) {
      bucket.missingCount += 1;
      if (kind === "income") bucket.missingIncome = true;
      if (kind === "expense") bucket.missingExpense = true;
      if (kind === "fees") bucket.missingFees = true;
      continue;
    }
    bucket[kind] = bucket[kind].add(
      valueOf(entry.amountAtomic, asset.scale, resolution.rateText),
    );
  }

  return input.periods.map((period) => {
    const bucket = buckets.get(period)!;
    const complete = bucket.missingCount === 0;
    return {
      period,
      incomeText: bucket.missingIncome ? null : decimalText(bucket.income),
      expenseText: bucket.missingExpense ? null : decimalText(bucket.expense),
      feesText: bucket.missingFees ? null : decimalText(bucket.fees),
      netFlowText: complete
        ? decimalText(bucket.income.add(bucket.expense).add(bucket.fees))
        : null,
      isComplete: complete,
      missingCount: bucket.missingCount,
    };
  });
}

function entryComponent(
  entry: HistoricalEntryFact,
):
  "income" | "expense" | "fees" | "internalTransfer" | "tradeRebalance" | null {
  const flow = flowKind(entry);
  if (flow) return flow;
  if (entry.entryRole === "fee") return null;
  if (entry.eventType === "transfer") return "internalTransfer";
  if (entry.eventType === "exchange") return "tradeRebalance";
  return null;
}

export function calculateNetWorthBridge(input: {
  localDate: string;
  startDate: string;
  startCutoffUtc: string;
  endCutoffUtc: string;
  startQuantities: ReadonlyMap<string, bigint>;
  endQuantities: ReadonlyMap<string, bigint>;
  entries: readonly HistoricalEntryFact[];
  assets: ReadonlyMap<string, ValuationAsset>;
  resolve: ResolveHistorical;
}): NetWorthBridgePoint {
  const entryDeltas = new Map<string, bigint>();
  const required = new Set<string>();
  for (const [assetId, amount] of input.startQuantities) {
    if (amount !== 0n) required.add(assetId);
  }
  for (const [assetId, amount] of input.endQuantities) {
    if (amount !== 0n) required.add(assetId);
  }
  for (const entry of input.entries) {
    entryDeltas.set(
      entry.assetId,
      (entryDeltas.get(entry.assetId) ?? 0n) + entry.amountAtomic,
    );
    if (entry.amountAtomic !== 0n) required.add(entry.assetId);
  }

  const rates = new Map<
    string,
    { start: PriceDecimalValue | null; end: PriceDecimalValue }
  >();
  const missingAssetIds: string[] = [];
  for (const assetId of required) {
    const q0Atomic = input.startQuantities.get(assetId) ?? 0n;
    let startRate: PriceDecimalValue | null = null;
    if (q0Atomic !== 0n) {
      const start = input.resolve(
        assetId,
        input.startCutoffUtc,
        input.startDate,
      );
      if (!start.ok) {
        missingAssetIds.push(assetId);
        continue;
      }
      startRate = priceDecimalFromText(start.rateText);
    }
    const end = input.resolve(assetId, input.endCutoffUtc, input.localDate);
    if (!end.ok) {
      missingAssetIds.push(assetId);
      continue;
    }
    rates.set(assetId, {
      start: startRate,
      end: priceDecimalFromText(end.rateText),
    });
  }
  const missing = sortedUnique(missingAssetIds);
  if (missing.length > 0) {
    return {
      localDate: input.localDate,
      startValueText: null,
      endValueText: null,
      deltaText: null,
      marketAndFxText: null,
      incomeText: null,
      expenseText: null,
      feesText: null,
      internalTransferText: null,
      tradeRebalanceText: null,
      reconciliationText: null,
      isComplete: false,
      missingAssetIds: missing,
    };
  }

  let startValue = zero();
  let endValue = zero();
  let marketAndFx = zero();
  const components = {
    income: zero(),
    expense: zero(),
    fees: zero(),
    internalTransfer: zero(),
    tradeRebalance: zero(),
  };
  let reconciliation = zero();

  for (const assetId of required) {
    const asset = input.assets.get(assetId);
    const rate = rates.get(assetId);
    if (!asset || !rate) continue;
    const q0 = decimalQuantityFromAtomic(
      input.startQuantities.get(assetId) ?? 0n,
      asset.scale,
    );
    const q1 = decimalQuantityFromAtomic(
      input.endQuantities.get(assetId) ?? 0n,
      asset.scale,
    );
    if (!q0.isZero()) {
      const startRate = rate.start!;
      startValue = startValue.add(q0.mul(startRate));
      marketAndFx = marketAndFx.add(q0.mul(rate.end.sub(startRate)));
    }
    endValue = endValue.add(q1.mul(rate.end));

    let classifiedDelta = 0n;
    for (const entry of input.entries) {
      if (entry.assetId !== assetId) continue;
      const kind = entryComponent(entry);
      if (!kind) continue;
      classifiedDelta += entry.amountAtomic;
      components[kind] = components[kind].add(
        decimalQuantityFromAtomic(entry.amountAtomic, asset.scale).mul(
          rate.end,
        ),
      );
    }
    const allEntryDelta = entryDeltas.get(assetId) ?? 0n;
    const unclassifiedDelta = allEntryDelta - classifiedDelta;
    const reconAtomic =
      (input.endQuantities.get(assetId) ?? 0n) -
      (input.startQuantities.get(assetId) ?? 0n) -
      allEntryDelta +
      unclassifiedDelta;
    reconciliation = reconciliation.add(
      decimalQuantityFromAtomic(reconAtomic, asset.scale).mul(rate.end),
    );
  }

  return {
    localDate: input.localDate,
    startValueText: decimalText(startValue),
    endValueText: decimalText(endValue),
    deltaText: decimalText(endValue.sub(startValue)),
    marketAndFxText: decimalText(marketAndFx),
    incomeText: decimalText(components.income),
    expenseText: decimalText(components.expense),
    feesText: decimalText(components.fees),
    internalTransferText: decimalText(components.internalTransfer),
    tradeRebalanceText: decimalText(components.tradeRebalance),
    reconciliationText: decimalText(reconciliation),
    isComplete: true,
    missingAssetIds: [],
  };
}
