import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteLatestPriceQuotes,
  findPriceProviderState,
  listLatestPriceQuotes,
  queryBalanceAt,
} from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { seedAssetId } from "../../db/seed-data";
import type { ProviderQuote } from "../../domain/quote-types";
import { PriceProviderError } from "../../providers/errors";
import type { PriceProviderAdapters } from "../../providers/types";
import { PriceRefreshService } from "../../services/price-refresh-service";
import { ProviderMappingService } from "../../services/valuation-config-service";
import type { ServiceRuntime } from "../../services/runtime";
import type { TestDatabase } from "./test-database";
import { createTestDatabase } from "./test-database";

function mutableRuntime(initial: string): ServiceRuntime & { value: string } {
  return {
    value: initial,
    id: () => "unused-id",
    now() {
      return this.value;
    },
  };
}

function adapters(input: {
  database: TestDatabase;
  fail?: PriceProviderError;
  failEcb?: PriceProviderError;
  onCoinGecko?: () => void;
  onEcb?: () => void;
}): PriceProviderAdapters {
  return {
    coingecko: {
      fetchCryptoUsdQuotes: async (request) => {
        expect(input.database.context.sqlite.inTransaction).toBe(false);
        input.onCoinGecko?.();
        if (input.fail) throw input.fail;
        return request.mappings.map<ProviderQuote>((mapping, index) => ({
          baseAssetId: mapping.assetId,
          quoteAssetId: request.usdAssetId,
          provider: "coingecko",
          kind: "spot",
          rateText:
            mapping.assetId === seedAssetId("USDT") ? "0.9972" : `${index + 1}`,
          providerObservedAt: request.fetchedAt,
          providerObservationDate: null,
          fetchedAt: request.fetchedAt,
          sourceMetadataJson: '{"fixture":true}',
        }));
      },
    },
    ecb: {
      fetchEurReferenceQuotes: async (request) => {
        expect(input.database.context.sqlite.inTransaction).toBe(false);
        input.onEcb?.();
        if (input.failEcb) throw input.failEcb;
        const rates = new Map([
          ["CNY", "7.7"],
          ["HKD", "8.5"],
          ["USD", "1.1"],
        ]);
        return request.mappings
          .filter((mapping) => mapping.assetId !== request.eurAssetId)
          .map<ProviderQuote>((mapping) => ({
            baseAssetId: request.eurAssetId,
            quoteAssetId: mapping.assetId,
            provider: "ecb",
            kind: "reference",
            rateText: rates.get(mapping.providerAssetKey) ?? "1",
            providerObservedAt: null,
            providerObservationDate: "2026-08-07",
            fetchedAt: request.fetchedAt,
            sourceMetadataJson: JSON.stringify({
              providerAssetKey: mapping.providerAssetKey,
            }),
          }));
      },
    },
  };
}

describe("PriceRefreshService", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
  });

  afterEach(() => database.close());

  it("stores one batched provider result while external I/O is outside transactions", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    let calls = 0;
    const service = new PriceRefreshService(
      database.context,
      adapters({ database, onCoinGecko: () => calls++ }),
      runtime,
    );
    const ledgerBefore = database.context.sqlite
      .prepare(
        "select (select count(*) from ledger_events) events, (select count(*) from ledger_entries) entries, (select count(*) from balance_snapshots) snapshots",
      )
      .get();

    await expect(
      service.refreshCurrent({ providers: ["coingecko"] }),
    ).resolves.toEqual({ refreshed: ["coingecko"], skipped: [], failed: [] });

    expect(calls).toBe(1);
    expect(listLatestPriceQuotes(database.context.db)).toHaveLength(5);
    expect(
      listLatestPriceQuotes(database.context.db).find(
        (quote) => quote.baseAssetId === seedAssetId("USDT"),
      )?.rateText,
    ).toBe("0.9972");
    expect(
      findPriceProviderState(database.context.db, "coingecko"),
    ).toMatchObject({
      lastAttemptAt: runtime.value,
      lastSuccessAt: runtime.value,
      lastErrorCode: null,
      cooldownUntil: "2026-08-08T12:01:00.000Z",
    });
    expect(
      database.context.sqlite
        .prepare(
          "select (select count(*) from ledger_events) events, (select count(*) from ledger_entries) entries, (select count(*) from balance_snapshots) snapshots",
        )
        .get(),
    ).toEqual(ledgerBefore);
  });

  it("skips fresh cache and force cannot bypass the minimum cooldown", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    let calls = 0;
    const service = new PriceRefreshService(
      database.context,
      adapters({ database, onCoinGecko: () => calls++ }),
      runtime,
    );
    await service.refreshCurrent({ providers: ["coingecko"] });

    runtime.value = "2026-08-08T12:00:30.000Z";
    await expect(
      service.refreshCurrent({ force: true, providers: ["coingecko"] }),
    ).resolves.toMatchObject({ skipped: ["coingecko"] });
    runtime.value = "2026-08-08T12:02:00.000Z";
    await expect(
      service.refreshCurrent({ providers: ["coingecko"] }),
    ).resolves.toMatchObject({ skipped: ["coingecko"] });
    expect(calls).toBe(1);
  });

  it("refreshes stale cache after the provider TTL", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    let calls = 0;
    const service = new PriceRefreshService(
      database.context,
      adapters({ database, onCoinGecko: () => calls++ }),
      runtime,
    );
    await service.refreshCurrent({ providers: ["coingecko"] });
    runtime.value = "2026-08-08T12:11:00.000Z";

    await expect(
      service.refreshCurrent({ providers: ["coingecko"] }),
    ).resolves.toMatchObject({ refreshed: ["coingecko"] });
    expect(calls).toBe(2);
  });

  it("preserves stale cache and applies Retry-After on failure", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    await new PriceRefreshService(
      database.context,
      adapters({ database }),
      runtime,
    ).refreshCurrent({ providers: ["coingecko"] });
    const before = listLatestPriceQuotes(database.context.db);
    runtime.value = "2026-08-08T12:11:00.000Z";
    const failing = new PriceRefreshService(
      database.context,
      adapters({
        database,
        fail: new PriceProviderError("RATE_LIMITED", "Rate limited.", 120),
      }),
      runtime,
    );

    await expect(
      failing.refreshCurrent({ providers: ["coingecko"] }),
    ).resolves.toMatchObject({
      failed: [{ provider: "coingecko", code: "RATE_LIMITED" }],
    });
    expect(listLatestPriceQuotes(database.context.db)).toEqual(before);
    expect(
      findPriceProviderState(database.context.db, "coingecko"),
    ).toMatchObject({
      lastSuccessAt: "2026-08-08T12:00:00.000Z",
      lastErrorCode: "RATE_LIMITED",
      cooldownUntil: "2026-08-08T12:13:00.000Z",
    });

    runtime.value = "2026-08-08T12:12:30.000Z";
    await expect(
      failing.refreshCurrent({ force: true, providers: ["coingecko"] }),
    ).resolves.toMatchObject({ skipped: ["coingecko"] });
  });

  it("C-004 refreshes ECB after six hours and preserves old reference rows on failure", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    let calls = 0;
    const service = new PriceRefreshService(
      database.context,
      adapters({ database, onEcb: () => calls++ }),
      runtime,
    );

    await expect(
      service.refreshCurrent({ providers: ["ecb"] }),
    ).resolves.toMatchObject({ refreshed: ["ecb"] });
    const before = listLatestPriceQuotes(database.context.db).filter(
      (quote) => quote.provider === "ecb",
    );
    expect(before).toHaveLength(3);
    expect(
      before.every((quote) => quote.baseAssetId === seedAssetId("EUR")),
    ).toBe(true);
    expect(
      before.some((quote) => quote.providerObservationDate === "2026-08-07"),
    ).toBe(true);

    runtime.value = "2026-08-08T17:59:00.000Z";
    await expect(
      service.refreshCurrent({ providers: ["ecb"] }),
    ).resolves.toMatchObject({ skipped: ["ecb"] });
    expect(calls).toBe(1);

    runtime.value = "2026-08-08T18:01:00.000Z";
    const failing = new PriceRefreshService(
      database.context,
      adapters({
        database,
        failEcb: new PriceProviderError(
          "UPSTREAM_ERROR",
          "ECB fixture unavailable.",
        ),
      }),
      runtime,
    );
    await expect(
      failing.refreshCurrent({ providers: ["ecb"] }),
    ).resolves.toMatchObject({
      failed: [{ provider: "ecb", code: "UPSTREAM_ERROR" }],
    });
    expect(
      listLatestPriceQuotes(database.context.db).filter(
        (quote) => quote.provider === "ecb",
      ),
    ).toEqual(before);
    expect(findPriceProviderState(database.context.db, "ecb")).toMatchObject({
      lastSuccessAt: "2026-08-08T12:00:00.000Z",
      lastErrorCode: "UPSTREAM_ERROR",
    });
  });

  it("missing cache makes refresh due without touching ledger facts", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    const service = new PriceRefreshService(
      database.context,
      adapters({ database }),
      runtime,
    );
    await service.refreshCurrent({ providers: ["coingecko"] });
    deleteLatestPriceQuotes(database.context.db, "coingecko");
    runtime.value = "2026-08-08T12:02:00.000Z";

    await expect(
      service.refreshCurrent({ providers: ["coingecko"] }),
    ).resolves.toMatchObject({ refreshed: ["coingecko"] });
  });

  it("L-002 deleting derived price cache and state leaves ledger facts and balances unchanged", async () => {
    const at = "2026-08-08T11:00:00.000Z";
    database.context.sqlite
      .prepare(
        "insert into accounts (id,book_id,asset_id,name,account_type,is_archived,sort_order,created_at,updated_at) values ('ledger-account','seed-book-default','seed-asset-cny','Cash','cash',0,0,?,?)",
      )
      .run(at, at);
    database.context.sqlite
      .prepare(
        "insert into balance_snapshots (id,account_id,as_of,balance_atomic,note,created_at,updated_at) values ('ledger-snapshot','ledger-account',?,'100000',null,?,?)",
      )
      .run(at, at, at);
    const queryTime = "2026-08-08T13:00:00.000Z";
    const ledgerBefore = database.context.sqlite
      .prepare(
        "select (select count(*) from ledger_events) events, (select count(*) from ledger_entries) entries, (select count(*) from balance_snapshots) snapshots",
      )
      .get();

    await new PriceRefreshService(
      database.context,
      adapters({ database }),
      mutableRuntime("2026-08-08T12:00:00.000Z"),
    ).refreshCurrent({ providers: ["coingecko"] });
    expect(listLatestPriceQuotes(database.context.db).length).toBeGreaterThan(
      0,
    );

    deleteLatestPriceQuotes(database.context.db);
    database.context.sqlite.prepare("delete from price_provider_state").run();

    expect(
      queryBalanceAt(database.context.db, "ledger-account", queryTime),
    ).toBe(100000n);
    expect(
      database.context.sqlite
        .prepare(
          "select (select count(*) from ledger_events) events, (select count(*) from ledger_entries) entries, (select count(*) from balance_snapshots) snapshots",
        )
        .get(),
    ).toEqual(ledgerBefore);
  });

  it("deduplicates an in-flight provider request across service instances", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deferredAdapters = adapters({ database });
    const original = deferredAdapters.coingecko.fetchCryptoUsdQuotes;
    deferredAdapters.coingecko.fetchCryptoUsdQuotes = async (input) => {
      started();
      await releasePromise;
      return original(input);
    };
    const first = new PriceRefreshService(
      database.context,
      deferredAdapters,
      runtime,
    ).refreshCurrent({ providers: ["coingecko"] });
    await startedPromise;

    await expect(
      new PriceRefreshService(
        database.context,
        deferredAdapters,
        runtime,
      ).refreshCurrent({ providers: ["coingecko"] }),
    ).resolves.toMatchObject({ skipped: ["coingecko"] });
    release();
    await expect(first).resolves.toMatchObject({ refreshed: ["coingecko"] });
  });

  it("discards a provider response when mappings change during external I/O", async () => {
    const runtime = mutableRuntime("2026-08-08T12:00:00.000Z");
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deferredAdapters = adapters({ database });
    const original = deferredAdapters.coingecko.fetchCryptoUsdQuotes;
    deferredAdapters.coingecko.fetchCryptoUsdQuotes = async (input) => {
      started();
      await releasePromise;
      return original(input);
    };
    const refresh = new PriceRefreshService(
      database.context,
      deferredAdapters,
      runtime,
    ).refreshCurrent({ providers: ["coingecko"] });
    await startedPromise;
    await new ProviderMappingService(database.context, runtime).update({
      assetId: seedAssetId("BTC"),
      provider: "coingecko",
      providerAssetKey: "bitcoin-new-id",
      isEnabled: true,
      priority: 100,
    });
    release();

    await expect(refresh).resolves.toMatchObject({
      refreshed: [],
      failed: [{ provider: "coingecko", code: "CONFIG_ERROR" }],
    });
    expect(listLatestPriceQuotes(database.context.db)).toEqual([]);
  });
});
