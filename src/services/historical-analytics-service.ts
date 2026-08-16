import { atomicFromDb } from "../db/atomic";
import type { DatabaseExecutor } from "../db/connection";
import {
  findAssetById,
  findBookById,
  findBookValuationSetting,
  historicalCoverage,
  listAccountReadRows,
  listAssets,
  listHistoricalFxObservations,
  listHistoricalLedgerEntryFacts,
  listHistoricalManualQuotes,
  listHistoricalPriceObservations,
  listHistoricalRefreshRuns,
  listPriceProviderMappings,
  queryBalancesAtInstants,
} from "../db/queries";
import {
  calculateHistoricalAllocation,
  calculateHistoricalCashFlow,
  calculateHistoricalNetWorthPoint,
  calculateNetWorthBridge,
  type HistoricalEntryFact,
  type HistoricalQuantity,
} from "../domain/historical-analytics";
import { createHistoricalQuoteResolver } from "../domain/historical-quote-math";
import type {
  HistoricalAllocationResult,
  HistoricalNetWorthSeriesResult,
  HistoricalQuoteResolverSnapshot,
  NetWorthBridgePoint,
} from "../domain/historical-quote-types";
import type { ValuationAsset } from "../domain/quote-types";
import {
  addLocalDateDays,
  canonicalUtcInstantValue,
  enumerateLocalDates,
  localDateEndInclusiveUtc,
  localDateRangeToUtc,
  utcInstantToLocalDate,
} from "../domain/time";
import { assertService } from "./errors";
import { readAppTimeZoneOrDefault } from "./settings-service";
import type { DatabaseContext } from "../db/connection";
import { historicalRefreshProgressFromRun } from "./historical-refresh-service";

const MAX_ANALYTICS_DAYS = 5_000;
const CRYPTO_LOOKBACK_MS = 26 * 60 * 60 * 1_000;

function valuationAsset(asset: NonNullable<ReturnType<typeof findAssetById>>) {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    symbol: asset.symbol,
    assetType: asset.assetType,
    scale: asset.scale,
    isArchived: asset.isArchived,
    sortOrder: asset.sortOrder,
  } satisfies ValuationAsset;
}

function requireBookContext(executor: DatabaseExecutor, bookId: string) {
  assertService(
    Boolean(findBookById(executor, bookId)),
    "BOOK_NOT_FOUND",
    "Book not found.",
  );
  const setting = findBookValuationSetting(executor, bookId);
  assertService(
    setting,
    "VALUATION_HOME_ASSET_REQUIRED",
    "Configure a Home Asset before using historical analytics.",
  );
  const home = findAssetById(executor, setting.homeAssetId);
  assertService(
    home && !home.isArchived && home.assetType === "fiat",
    "INVALID_HOME_ASSET",
    "Home Asset must be an active fiat asset.",
  );
  return {
    timeZone: readAppTimeZoneOrDefault(executor),
    homeAsset: valuationAsset(home),
    accountRows: listAccountReadRows(executor, bookId),
  };
}

function readHistoricalQuoteSnapshot(
  executor: DatabaseExecutor,
  input: {
    fromDate: string;
    toDate: string;
    fromUtc: string;
    toUtc: string;
  },
): HistoricalQuoteResolverSnapshot {
  const priceFrom = new Date(
    canonicalUtcInstantValue(input.fromUtc) - CRYPTO_LOOKBACK_MS,
  ).toISOString();
  return {
    assets: listAssets(executor).map(valuationAsset),
    mappings: listPriceProviderMappings(executor),
    manualQuotes: listHistoricalManualQuotes(executor, {
      fromDate: input.fromDate,
      toDate: input.toDate,
    }),
    priceObservations: listHistoricalPriceObservations(executor, {
      fromInclusive: priceFrom,
      toInclusive: input.toUtc,
    }),
    fxObservations: listHistoricalFxObservations(executor, {
      fromDate: addLocalDateDays(input.fromDate, -7),
      toDate: input.toDate,
    }),
  };
}

function groupQuantities(
  accountRows: ReturnType<typeof listAccountReadRows>,
  balances: ReadonlyMap<string, bigint>,
): HistoricalQuantity[] {
  const grouped = new Map<string, HistoricalQuantity>();
  for (const account of accountRows) {
    const existing = grouped.get(account.assetId) ?? {
      asset: {
        id: account.assetId,
        code: account.assetCode,
        name: account.assetName,
        symbol: account.assetSymbol,
        assetType: account.assetType,
        scale: account.assetScale,
        isArchived: account.assetIsArchived,
        sortOrder: account.assetSortOrder,
      },
      quantityAtomic: 0n,
    };
    existing.quantityAtomic += balances.get(account.id) ?? 0n;
    grouped.set(account.assetId, existing);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.asset.sortOrder - right.asset.sortOrder ||
      left.asset.code.localeCompare(right.asset.code) ||
      left.asset.id.localeCompare(right.asset.id),
  );
}

function quantitiesMap(quantities: readonly HistoricalQuantity[]) {
  return new Map(
    quantities.map((quantity) => [quantity.asset.id, quantity.quantityAtomic]),
  );
}

function entryFacts(
  rows: ReturnType<typeof listHistoricalLedgerEntryFacts>,
): HistoricalEntryFact[] {
  return rows.map((row) => ({
    ...row,
    amountAtomic: atomicFromDb(row.amountAtomic),
  }));
}

function resolver(
  snapshot: HistoricalQuoteResolverSnapshot,
  homeAssetId: string,
) {
  const prepared = createHistoricalQuoteResolver(snapshot);
  return (assetId: string, queryTime: string, localDate: string) =>
    prepared.resolve({
      baseAssetId: assetId,
      homeAssetId,
      queryTime,
      localDate,
    });
}

function monthPeriods(fromDate: string, toDate: string): string[] {
  return [
    ...new Set(
      enumerateLocalDates(fromDate, toDate, MAX_ANALYTICS_DAYS).map((date) =>
        date.slice(0, 7),
      ),
    ),
  ];
}

export class HistoricalAnalyticsService {
  constructor(private readonly context: DatabaseContext) {}

  netWorthSeries(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
  }): HistoricalNetWorthSeriesResult {
    const dates = enumerateLocalDates(
      input.fromDate,
      input.toDate,
      MAX_ANALYTICS_DAYS,
    );
    return this.context.db.transaction((transaction) => {
      const { timeZone, homeAsset, accountRows } = requireBookContext(
        transaction,
        input.bookId,
      );
      const cutoffs = dates.map((date) =>
        localDateEndInclusiveUtc(date, timeZone),
      );
      const balances = queryBalancesAtInstants(
        transaction,
        accountRows.map((account) => account.id),
        cutoffs,
      );
      const quoteSnapshot = readHistoricalQuoteSnapshot(transaction, {
        fromDate: dates[0]!,
        toDate: dates.at(-1)!,
        fromUtc: cutoffs[0]!,
        toUtc: cutoffs.at(-1)!,
      });
      const resolve = resolver(quoteSnapshot, homeAsset.id);
      return {
        homeAssetId: homeAsset.id,
        timeZone,
        fromDate: dates[0]!,
        toDate: dates.at(-1)!,
        points: dates.map((localDate, index) => {
          const cutoffUtc = cutoffs[index]!;
          return calculateHistoricalNetWorthPoint({
            localDate,
            cutoffUtc,
            quantities: groupQuantities(accountRows, balances.get(cutoffUtc)!),
            resolve,
          });
        }),
      };
    });
  }

  allocation(input: {
    bookId: string;
    localDate: string;
  }): HistoricalAllocationResult {
    const [localDate] = enumerateLocalDates(
      input.localDate,
      input.localDate,
      1,
    );
    return this.context.db.transaction((transaction) => {
      const { timeZone, homeAsset, accountRows } = requireBookContext(
        transaction,
        input.bookId,
      );
      const cutoffUtc = localDateEndInclusiveUtc(localDate!, timeZone);
      const balances = queryBalancesAtInstants(
        transaction,
        accountRows.map((account) => account.id),
        [cutoffUtc],
      );
      const quoteSnapshot = readHistoricalQuoteSnapshot(transaction, {
        fromDate: localDate!,
        toDate: localDate!,
        fromUtc: cutoffUtc,
        toUtc: cutoffUtc,
      });
      return calculateHistoricalAllocation({
        localDate: localDate!,
        cutoffUtc,
        quantities: groupQuantities(accountRows, balances.get(cutoffUtc)!),
        resolve: resolver(quoteSnapshot, homeAsset.id),
      });
    });
  }

  cashFlowTrend(input: {
    bookId: string;
    fromDate: string;
    toDate: string;
    bucket: "month";
  }): { buckets: ReturnType<typeof calculateHistoricalCashFlow> } {
    const dates = enumerateLocalDates(
      input.fromDate,
      input.toDate,
      MAX_ANALYTICS_DAYS,
    );
    return this.context.db.transaction((transaction) => {
      const { timeZone, homeAsset } = requireBookContext(
        transaction,
        input.bookId,
      );
      const range = localDateRangeToUtc(
        { from: dates[0]!, to: dates.at(-1)! },
        timeZone,
      );
      const toInclusive = new Date(
        canonicalUtcInstantValue(range.endExclusive!) - 1,
      ).toISOString();
      const quoteSnapshot = readHistoricalQuoteSnapshot(transaction, {
        fromDate: dates[0]!,
        toDate: dates.at(-1)!,
        fromUtc: range.startInclusive!,
        toUtc: toInclusive,
      });
      const entries = entryFacts(
        listHistoricalLedgerEntryFacts(transaction, {
          bookId: input.bookId,
          fromInclusive: range.startInclusive,
          toInclusive,
        }),
      );
      return {
        buckets: calculateHistoricalCashFlow({
          periods: monthPeriods(dates[0]!, dates.at(-1)!),
          entries,
          assets: new Map(
            quoteSnapshot.assets.map((asset) => [asset.id, asset]),
          ),
          timeZoneDate: (instant) => utcInstantToLocalDate(instant, timeZone),
          resolve: resolver(quoteSnapshot, homeAsset.id),
        }),
      };
    });
  }

  decomposition(input: { bookId: string; fromDate: string; toDate: string }): {
    points: NetWorthBridgePoint[];
  } {
    const dates = enumerateLocalDates(
      input.fromDate,
      input.toDate,
      MAX_ANALYTICS_DAYS,
    );
    return this.context.db.transaction((transaction) => {
      const { timeZone, homeAsset, accountRows } = requireBookContext(
        transaction,
        input.bookId,
      );
      const priorDate = addLocalDateDays(dates[0]!, -1);
      const allDates = [priorDate, ...dates];
      const cutoffs = allDates.map((date) =>
        localDateEndInclusiveUtc(date, timeZone),
      );
      const balances = queryBalancesAtInstants(
        transaction,
        accountRows.map((account) => account.id),
        cutoffs,
      );
      const quoteSnapshot = readHistoricalQuoteSnapshot(transaction, {
        fromDate: priorDate,
        toDate: dates.at(-1)!,
        fromUtc: cutoffs[0]!,
        toUtc: cutoffs.at(-1)!,
      });
      const facts = entryFacts(
        listHistoricalLedgerEntryFacts(transaction, {
          bookId: input.bookId,
          afterExclusive: cutoffs[0],
          toInclusive: cutoffs.at(-1)!,
        }),
      );
      const factsByDate = new Map<string, HistoricalEntryFact[]>();
      for (const fact of facts) {
        const localDate = utcInstantToLocalDate(fact.occurredAt, timeZone);
        const bucket = factsByDate.get(localDate) ?? [];
        bucket.push(fact);
        factsByDate.set(localDate, bucket);
      }
      const assets = new Map(
        quoteSnapshot.assets.map((asset) => [asset.id, asset]),
      );
      const resolve = resolver(quoteSnapshot, homeAsset.id);
      return {
        points: dates.map((localDate, index) => {
          const startCutoffUtc = cutoffs[index]!;
          const endCutoffUtc = cutoffs[index + 1]!;
          return calculateNetWorthBridge({
            localDate,
            startDate: allDates[index]!,
            startCutoffUtc,
            endCutoffUtc,
            startQuantities: quantitiesMap(
              groupQuantities(accountRows, balances.get(startCutoffUtc)!),
            ),
            endQuantities: quantitiesMap(
              groupQuantities(accountRows, balances.get(endCutoffUtc)!),
            ),
            entries: factsByDate.get(localDate) ?? [],
            assets,
            resolve,
          });
        }),
      };
    });
  }

  dashboard(input: { bookId: string; fromDate: string; toDate: string }) {
    const dates = enumerateLocalDates(
      input.fromDate,
      input.toDate,
      MAX_ANALYTICS_DAYS,
    );
    return this.context.db.transaction((transaction) => {
      const { timeZone, homeAsset, accountRows } = requireBookContext(
        transaction,
        input.bookId,
      );
      const priorDate = addLocalDateDays(dates[0]!, -1);
      const allDates = [priorDate, ...dates];
      const cutoffs = allDates.map((date) =>
        localDateEndInclusiveUtc(date, timeZone),
      );
      const balances = queryBalancesAtInstants(
        transaction,
        accountRows.map((account) => account.id),
        cutoffs,
      );
      const quoteSnapshot = readHistoricalQuoteSnapshot(transaction, {
        fromDate: priorDate,
        toDate: dates.at(-1)!,
        fromUtc: cutoffs[0]!,
        toUtc: cutoffs.at(-1)!,
      });
      const facts = entryFacts(
        listHistoricalLedgerEntryFacts(transaction, {
          bookId: input.bookId,
          afterExclusive: cutoffs[0],
          toInclusive: cutoffs.at(-1)!,
        }),
      );
      const factsByDate = new Map<string, HistoricalEntryFact[]>();
      for (const fact of facts) {
        const localDate = utcInstantToLocalDate(fact.occurredAt, timeZone);
        const bucket = factsByDate.get(localDate) ?? [];
        bucket.push(fact);
        factsByDate.set(localDate, bucket);
      }
      const assets = new Map(
        quoteSnapshot.assets.map((asset) => [asset.id, asset]),
      );
      const resolve = resolver(quoteSnapshot, homeAsset.id);
      const quantities = dates.map((date, index) => {
        const cutoff = cutoffs[index + 1]!;
        return {
          date,
          cutoff,
          values: groupQuantities(accountRows, balances.get(cutoff)!),
        };
      });
      const points = quantities.map((point) =>
        calculateHistoricalNetWorthPoint({
          localDate: point.date,
          cutoffUtc: point.cutoff,
          quantities: point.values,
          resolve,
        }),
      );
      const final = quantities.at(-1)!;
      const allocation = calculateHistoricalAllocation({
        localDate: final.date,
        cutoffUtc: final.cutoff,
        quantities: final.values,
        resolve,
      });
      const rangeFacts = facts.filter((fact) => {
        const localDate = utcInstantToLocalDate(fact.occurredAt, timeZone);
        return localDate >= dates[0]! && localDate <= dates.at(-1)!;
      });
      const cashFlow = {
        buckets: calculateHistoricalCashFlow({
          periods: monthPeriods(dates[0]!, dates.at(-1)!),
          entries: rangeFacts,
          assets,
          timeZoneDate: (instant) => utcInstantToLocalDate(instant, timeZone),
          resolve,
        }),
      };
      const decomposition = {
        points: dates.map((localDate, index) => {
          const startCutoffUtc = cutoffs[index]!;
          const endCutoffUtc = cutoffs[index + 1]!;
          return calculateNetWorthBridge({
            localDate,
            startDate: allDates[index]!,
            startCutoffUtc,
            endCutoffUtc,
            startQuantities: quantitiesMap(
              groupQuantities(accountRows, balances.get(startCutoffUtc)!),
            ),
            endQuantities: quantitiesMap(
              groupQuantities(accountRows, balances.get(endCutoffUtc)!),
            ),
            entries: factsByDate.get(localDate) ?? [],
            assets,
            resolve,
          });
        }),
      };
      return {
        homeAsset,
        timeZone,
        fromDate: dates[0]!,
        toDate: dates.at(-1)!,
        series: {
          homeAssetId: homeAsset.id,
          timeZone,
          fromDate: dates[0]!,
          toDate: dates.at(-1)!,
          points,
        },
        allocation,
        cashFlow,
        decomposition,
        assets: quoteSnapshot.assets,
        manualQuotes: quoteSnapshot.manualQuotes,
      };
    });
  }
}

export class HistoricalHistoryStatusService {
  constructor(private readonly context: DatabaseContext) {}

  read(input: { bookId: string }) {
    return this.context.db.transaction((transaction) => {
      const { homeAsset, accountRows } = requireBookContext(
        transaction,
        input.bookId,
      );
      const mappings = listPriceProviderMappings(transaction);
      const mapped = new Set(
        mappings
          .filter((mapping) => mapping.isEnabled)
          .map((mapping) => `${mapping.assetId}\u0000${mapping.provider}`),
      );
      const exposedAssets = new Map(
        accountRows.map((account) => [
          account.assetId,
          {
            id: account.assetId,
            code: account.assetCode,
            assetType: account.assetType,
            isArchived: account.assetIsArchived,
          },
        ]),
      );
      const missingMappings = [...exposedAssets.values()]
        .filter((asset) => {
          if (asset.id === homeAsset.id) return false;
          if (asset.assetType === "crypto") {
            return !mapped.has(`${asset.id}\u0000coingecko`);
          }
          if (asset.assetType === "fiat") {
            return !mapped.has(`${asset.id}\u0000ecb`);
          }
          return true;
        })
        .sort(
          (left, right) =>
            left.code.localeCompare(right.code) ||
            left.id.localeCompare(right.id),
        );
      const recentRuns = listHistoricalRefreshRuns(transaction, 10);
      return {
        coverage: historicalCoverage(transaction),
        manualQuotes: listHistoricalManualQuotes(transaction).length,
        recentRuns: recentRuns.map((run) => ({
          ...historicalRefreshProgressFromRun(run),
          requestedAt: run.requestedAt,
          updatedAt: run.updatedAt,
          completedAt: run.completedAt,
        })),
        missingMappings,
        sources: [
          "Data provided by CoinGecko",
          "Source: ECB statistics",
          "Cross-rates are derived with exact decimal arithmetic.",
        ],
      };
    });
  }
}
