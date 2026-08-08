import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  listAssets,
  listLatestPriceQuotes,
  listManualPriceQuotes,
  listPriceProviderMappings,
  listPriceProviderStates,
} from "../db/queries";
import { resolveCurrentQuote } from "../domain/quote-math";
import type {
  QuoteResolution,
  QuoteResolverSnapshot,
} from "../domain/quote-types";

export function readQuoteResolverSnapshot(
  executor: DatabaseExecutor,
): QuoteResolverSnapshot {
  return {
    assets: listAssets(executor).map((asset) => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      symbol: asset.symbol,
      assetType: asset.assetType,
      scale: asset.scale,
      isArchived: asset.isArchived,
      sortOrder: asset.sortOrder,
    })),
    mappings: listPriceProviderMappings(executor),
    manualQuotes: listManualPriceQuotes(executor),
    providerQuotes: listLatestPriceQuotes(executor).map((quote) => ({
      baseAssetId: quote.baseAssetId,
      quoteAssetId: quote.quoteAssetId,
      provider: quote.provider,
      kind: quote.quoteKind,
      rateText: quote.rateText,
      providerObservedAt: quote.providerObservedAt,
      providerObservationDate: quote.providerObservationDate,
      fetchedAt: quote.fetchedAt,
      sourceMetadataJson: quote.sourceMetadataJson,
    })),
    providerStates: listPriceProviderStates(executor),
  };
}

export class QuoteResolverService {
  constructor(private readonly context: DatabaseContext) {}

  resolve(input: {
    baseAssetId: string;
    homeAssetId: string;
    queryTime: string;
  }): QuoteResolution {
    const snapshot = this.context.db.transaction((transaction) =>
      readQuoteResolverSnapshot(transaction),
    );
    return resolveCurrentQuote(snapshot, input);
  }
}
