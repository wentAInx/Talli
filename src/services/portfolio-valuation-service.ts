import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  findAssetById,
  findBookById,
  findBookValuationSetting,
  listAccountReadRows,
  queryBalancesAt,
} from "../db/queries";
import { resolveCurrentQuote } from "../domain/quote-math";
import type { ValuationAsset } from "../domain/quote-types";
import { canonicalUtcInstantValue } from "../domain/time";
import {
  calculatePortfolioValuation,
  type PortfolioValuationResult,
} from "../domain/valuation";
import { readQuoteResolverSnapshot } from "./quote-resolver-service";

function valuationAsset(
  asset: NonNullable<ReturnType<typeof findAssetById>>,
): ValuationAsset {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    symbol: asset.symbol,
    assetType: asset.assetType,
    scale: asset.scale,
    isArchived: asset.isArchived,
    sortOrder: asset.sortOrder,
  };
}

function currentPortfolio(
  executor: DatabaseExecutor,
  input: { bookId: string; queryTime: string },
): PortfolioValuationResult | null {
  if (!findBookById(executor, input.bookId)) return null;
  const setting = findBookValuationSetting(executor, input.bookId);
  if (!setting) return null;
  const homeRow = findAssetById(executor, setting.homeAssetId);
  if (!homeRow || homeRow.isArchived || homeRow.assetType !== "fiat") {
    return null;
  }

  const accountRows = listAccountReadRows(executor, input.bookId).filter(
    (account) => !account.isArchived && !account.assetIsArchived,
  );
  const balances = queryBalancesAt(
    executor,
    accountRows.map((account) => account.id),
    input.queryTime,
  );
  const grouped = new Map<string, { asset: ValuationAsset; atomic: bigint }>();
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
      atomic: 0n,
    };
    existing.atomic += balances.get(account.id) ?? 0n;
    grouped.set(account.assetId, existing);
  }

  const quoteSnapshot = readQuoteResolverSnapshot(executor);
  return calculatePortfolioValuation({
    queryTime: input.queryTime,
    homeAsset: valuationAsset(homeRow),
    quantities: [...grouped.values()].map((group) => ({
      asset: group.asset,
      quantityAtomic: group.atomic,
    })),
    resolve: (assetId) =>
      resolveCurrentQuote(quoteSnapshot, {
        baseAssetId: assetId,
        homeAssetId: homeRow.id,
        queryTime: input.queryTime,
      }),
  });
}

export class PortfolioValuationService {
  constructor(private readonly context: DatabaseContext) {}

  current(input: {
    bookId: string;
    queryTime: string;
  }): PortfolioValuationResult | null {
    canonicalUtcInstantValue(input.queryTime);
    return this.context.db.transaction((transaction) =>
      currentPortfolio(transaction, input),
    );
  }
}
