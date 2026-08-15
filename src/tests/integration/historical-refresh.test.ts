import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listHistoricalFxObservations,
  listHistoricalPriceObservations,
  listHistoricalRefreshUnits,
  upsertHistoricalFxObservations,
  upsertHistoricalPriceObservations,
} from "../../db/queries";
import { seedDatabase } from "../../db/seed";
import { seedAssetId } from "../../db/seed-data";
import type {
  HistoricalFxObservation,
  HistoricalPriceObservation,
} from "../../domain/historical-quote-types";
import { PriceProviderError } from "../../providers/errors";
import type { HistoricalPriceProviderAdapters } from "../../providers/types";
import { HistoricalRefreshService } from "../../services/historical-refresh-service";
import type { ServiceRuntime } from "../../services/runtime";
import { ProviderMappingService } from "../../services/valuation-config-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase } from "./test-database";

function mutableRuntime(initial: string): ServiceRuntime & { value: string } {
  let sequence = 0;
  return {
    value: initial,
    id: () => `history-id-${String(++sequence).padStart(4, "0")}`,
    now() {
      return this.value;
    },
  };
}

function disableAllExceptBtc(database: TestDatabase): void {
  database.context.sqlite
    .prepare("update price_provider_mappings set is_enabled=0")
    .run();
  database.context.sqlite
    .prepare(
      "update price_provider_mappings set is_enabled=1 where asset_id=? and provider='coingecko'",
    )
    .run(seedAssetId("BTC"));
}

function adapters(input: {
  database: TestDatabase;
  fail?: PriceProviderError;
  onCoinGecko?: () => void | Promise<void>;
}): HistoricalPriceProviderAdapters {
  return {
    coingecko: {
      fetchCryptoUsdHistory: async (request) => {
        expect(input.database.context.sqlite.inTransaction).toBe(false);
        await input.onCoinGecko?.();
        if (input.fail) throw input.fail;
        return [
          {
            baseAssetId: request.mapping.assetId,
            quoteAssetId: request.usdAssetId,
            provider: "coingecko",
            granularity: request.interval,
            rateText: "68000",
            providerObservedAt: request.toUtc,
            fetchedAt: request.fetchedAt,
            sourceMetadataJson: JSON.stringify({
              providerAssetKey: request.mapping.providerAssetKey,
            }),
          } satisfies HistoricalPriceObservation,
        ];
      },
    },
    ecb: {
      fetchEurReferenceHistory: async (request) =>
        request.mappings.map(
          (mapping) =>
            ({
              baseAssetId: request.eurAssetId,
              quoteAssetId: mapping.assetId,
              provider: "ecb",
              rateText: "1",
              providerObservationDate: request.toDate,
              fetchedAt: request.fetchedAt,
              sourceMetadataJson: JSON.stringify({
                providerAssetKey: mapping.providerAssetKey,
              }),
            }) satisfies HistoricalFxObservation,
        ),
    },
  };
}

describe("HistoricalRefreshService", () => {
  let database: TestDatabase;
  let runtime: ReturnType<typeof mutableRuntime>;

  beforeEach(() => {
    database = createTestDatabase();
    seedDatabase(database.context);
    disableAllExceptBtc(database);
    runtime = mutableRuntime("2026-08-15T04:00:00.000Z");
  });

  afterEach(() => database.close());

  it("persists a bounded run and commits observations only after transaction-free HTTP", async () => {
    let calls = 0;
    const service = new HistoricalRefreshService(
      database.context,
      adapters({
        database,
        onCoinGecko: () => {
          calls += 1;
        },
      }),
      runtime,
    );
    const beforeLedger = database.context.sqlite
      .prepare(
        "select (select count(*) from ledger_events) events, (select count(*) from ledger_entries) entries, (select count(*) from balance_snapshots) snapshots",
      )
      .get();
    const started = service.start({
      fromDate: "2026-08-14",
      toDate: "2026-08-14",
    });
    expect(started).toMatchObject({ status: "pending", totalUnits: 1 });

    await expect(
      service.step({ runId: started.runId, maxUnits: 99 }),
    ).resolves.toMatchObject({
      status: "success",
      completedUnits: 1,
      failedUnits: 0,
      nextAction: "done",
    });
    expect(calls).toBe(1);
    expect(
      listHistoricalPriceObservations(database.context.db, {
        fromInclusive: "2026-08-13T00:00:00.000Z",
        toInclusive: "2026-08-15T00:00:00.000Z",
      }),
    ).toHaveLength(1);
    expect(
      database.context.sqlite
        .prepare(
          "select (select count(*) from ledger_events) events, (select count(*) from ledger_entries) entries, (select count(*) from balance_snapshots) snapshots",
        )
        .get(),
    ).toEqual(beforeLedger);
  });

  it("discards a response and invalidates the run when mappings change during HTTP", async () => {
    const service = new HistoricalRefreshService(
      database.context,
      adapters({
        database,
        onCoinGecko: async () => {
          await new ProviderMappingService(database.context, runtime).update({
            assetId: seedAssetId("BTC"),
            provider: "coingecko",
            providerAssetKey: "wrapped-bitcoin",
            isEnabled: true,
            priority: 100,
          });
        },
      }),
      runtime,
    );
    const started = service.start({
      fromDate: "2026-08-14",
      toDate: "2026-08-14",
    });
    await expect(service.step({ runId: started.runId })).resolves.toMatchObject(
      { status: "invalidated", nextAction: "restart" },
    );
    expect(
      database.context.sqlite
        .prepare("select count(*) as count from historical_price_quotes")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("keeps prior cache unchanged on provider failure and can reclaim a stale running unit", async () => {
    upsertHistoricalPriceObservations(
      database.context.db,
      [
        {
          id: "existing",
          baseAssetId: seedAssetId("BTC"),
          quoteAssetId: seedAssetId("USD"),
          provider: "coingecko",
          granularity: "hourly",
          rateText: "67000",
          providerObservedAt: "2026-08-14T12:00:00.000Z",
          fetchedAt: "2026-08-14T13:00:00.000Z",
          sourceMetadataJson: null,
        },
      ],
      () => "unused",
    );
    const failing = new HistoricalRefreshService(
      database.context,
      adapters({
        database,
        fail: new PriceProviderError(
          "UPSTREAM_PAYLOAD_INVALID",
          "raw provider body must never escape",
        ),
      }),
      runtime,
    );
    const failedRun = failing.start({
      fromDate: "2026-08-14",
      toDate: "2026-08-14",
    });
    await expect(
      failing.step({ runId: failedRun.runId }),
    ).resolves.toMatchObject({ status: "failed", failedUnits: 1 });
    expect(
      database.context.sqlite
        .prepare(
          "select rate_text from historical_price_quotes where id='existing'",
        )
        .get(),
    ).toEqual({ rate_text: "67000" });

    const resumed = new HistoricalRefreshService(
      database.context,
      adapters({ database }),
      runtime,
    );
    const staleRun = resumed.start({
      fromDate: "2026-08-13",
      toDate: "2026-08-13",
    });
    const unit = listHistoricalRefreshUnits(
      database.context.db,
      staleRun.runId,
    )[0]!;
    database.context.sqlite
      .prepare(
        "update historical_refresh_units set status='running', claimed_at='2026-08-15T03:00:00.000Z' where id=?",
      )
      .run(unit.id);
    await expect(
      resumed.step({ runId: staleRun.runId, maxUnits: 1 }),
    ).resolves.toMatchObject({ status: "success", completedUnits: 1 });
  });

  it("honors Retry-After before retrying a rate-limited unit", async () => {
    database.context.sqlite
      .prepare(
        "update price_provider_mappings set is_enabled=1 where asset_id=?",
      )
      .run(seedAssetId("ETH"));
    let calls = 0;
    const limited = new HistoricalRefreshService(
      database.context,
      adapters({
        database,
        fail: new PriceProviderError("RATE_LIMITED", "raw 429", 120),
        onCoinGecko: () => {
          calls += 1;
        },
      }),
      runtime,
    );
    const started = limited.start({
      fromDate: "2026-08-14",
      toDate: "2026-08-14",
    });
    await expect(limited.step({ runId: started.runId })).resolves.toMatchObject(
      {
        status: "partial",
        nextAction: "retry",
        failedUnits: 1,
        completedUnits: 0,
      },
    );
    expect(calls).toBe(1);
    const retryAt = listHistoricalRefreshUnits(
      database.context.db,
      started.runId,
    )[0]!.updatedAt;
    expect(retryAt).toBe("2026-08-15T04:02:00.000Z");

    runtime.value = "2026-08-15T04:01:59.999Z";
    await expect(limited.step({ runId: started.runId })).resolves.toMatchObject(
      { failedUnits: 1, completedUnits: 0 },
    );
    expect(calls).toBe(1);

    runtime.value = "2026-08-15T04:02:00.000Z";
    const recovered = new HistoricalRefreshService(
      database.context,
      adapters({ database }),
      runtime,
    );
    await expect(
      recovered.step({ runId: started.runId }),
    ).resolves.toMatchObject({
      status: "partial",
      completedUnits: 1,
      failedUnits: 1,
    });
    await expect(
      recovered.step({ runId: started.runId }),
    ).resolves.toMatchObject({
      status: "success",
      completedUnits: 2,
      failedUnits: 0,
    });
  });

  it("applies same-observation provider revisions without duplicating cache rows", () => {
    const firstFetch = "2026-08-15T04:00:00.000Z";
    const correctedFetch = "2026-08-15T05:00:00.000Z";
    const priceIdentity = {
      baseAssetId: seedAssetId("BTC"),
      quoteAssetId: seedAssetId("USD"),
      provider: "coingecko" as const,
      granularity: "hourly" as const,
      providerObservedAt: "2026-08-14T12:00:00.000Z",
      sourceMetadataJson: '{"providerAssetKey":"bitcoin"}',
    };
    upsertHistoricalPriceObservations(
      database.context.db,
      [
        {
          ...priceIdentity,
          id: "price-first",
          rateText: "67000",
          fetchedAt: firstFetch,
        },
      ],
      () => "unused-price-first",
    );
    upsertHistoricalPriceObservations(
      database.context.db,
      [
        {
          ...priceIdentity,
          id: "price-correction",
          rateText: "68000",
          fetchedAt: correctedFetch,
        },
      ],
      () => "unused-price-correction",
    );
    upsertHistoricalPriceObservations(
      database.context.db,
      [
        {
          ...priceIdentity,
          id: "price-stale-response",
          rateText: "66000",
          fetchedAt: "2026-08-15T04:30:00.000Z",
        },
      ],
      () => "unused-price-stale",
    );
    expect(
      listHistoricalPriceObservations(database.context.db, {
        fromInclusive: "2026-08-14T00:00:00.000Z",
        toInclusive: "2026-08-14T23:59:59.999Z",
      }),
    ).toEqual([
      expect.objectContaining({
        id: "price-first",
        rateText: "68000",
        firstFetchedAt: firstFetch,
        fetchedAt: correctedFetch,
      }),
    ]);

    const fxIdentity = {
      baseAssetId: seedAssetId("EUR"),
      quoteAssetId: seedAssetId("CNY"),
      provider: "ecb" as const,
      providerObservationDate: "2026-08-14",
      sourceMetadataJson: '{"providerAssetKey":"CNY"}',
    };
    upsertHistoricalFxObservations(
      database.context.db,
      [
        {
          ...fxIdentity,
          id: "fx-first",
          rateText: "7.80",
          fetchedAt: firstFetch,
        },
      ],
      () => "unused-fx-first",
    );
    upsertHistoricalFxObservations(
      database.context.db,
      [
        {
          ...fxIdentity,
          id: "fx-correction",
          rateText: "7.81",
          fetchedAt: correctedFetch,
        },
      ],
      () => "unused-fx-correction",
    );
    upsertHistoricalFxObservations(
      database.context.db,
      [
        {
          ...fxIdentity,
          id: "fx-stale-response",
          rateText: "7.79",
          fetchedAt: "2026-08-15T04:30:00.000Z",
        },
      ],
      () => "unused-fx-stale",
    );
    expect(
      listHistoricalFxObservations(database.context.db, {
        fromDate: "2026-08-14",
        toDate: "2026-08-14",
      }),
    ).toEqual([
      expect.objectContaining({
        id: "fx-first",
        rateText: "7.81",
        firstFetchedAt: firstFetch,
        fetchedAt: correctedFetch,
      }),
    ]);
  });
});
