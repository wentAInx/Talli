import { z } from "zod";

import type { DatabaseContext } from "../db/connection";
import {
  cancelHistoricalRefreshRun,
  claimHistoricalRefreshUnits,
  findHistoricalRefreshRun,
  findHistoricalRefreshUnit,
  insertHistoricalRefreshRun,
  invalidateHistoricalRefreshRun,
  listAssets,
  listHistoricalRefreshRuns,
  listHistoricalRefreshUnits,
  listPriceProviderMappings,
  markHistoricalRefreshRunRunning,
  markHistoricalRefreshUnitFailed,
  markHistoricalRefreshUnitSuccess,
  releaseHistoricalRefreshUnits,
  updateHistoricalRefreshRunFromUnits,
  upsertHistoricalFxObservations,
  upsertHistoricalPriceObservations,
} from "../db/queries";
import {
  historicalMappingFingerprint,
  planHistoricalRefresh,
} from "../domain/historical-refresh-plan";
import type {
  HistoricalFxObservation,
  HistoricalPriceObservation,
  HistoricalRefreshProgress,
} from "../domain/historical-quote-types";
import {
  canonicalLocalDate,
  canonicalUtcInstantValue,
  lastCompletedLocalDate,
} from "../domain/time";
import { PriceProviderError } from "../providers/errors";
import type { HistoricalPriceProviderAdapters } from "../providers/types";
import { assertService } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { readAppTimeZoneOrDefault } from "./settings-service";

const MAX_STEP_UNITS = 4;
const UNIT_LEASE_MS = 15 * 60 * 1_000;

const cryptoScopeSchema = z
  .object({
    mapping: z
      .object({
        assetId: z.string().min(1).max(200),
        providerAssetKey: z.string().min(1).max(128),
      })
      .strict(),
    usdAssetId: z.string().min(1).max(200),
  })
  .strict();

const ecbScopeSchema = z
  .object({
    mappings: z
      .array(
        z
          .object({
            assetId: z.string().min(1).max(200),
            providerAssetKey: z.string().regex(/^[A-Z]{3}$/),
          })
          .strict(),
      )
      .max(100),
    eurAssetId: z.string().min(1).max(200),
  })
  .strict();

export function historicalRefreshProgressFromRun(run: {
  id: string;
  status: HistoricalRefreshProgress["status"];
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  lastErrorCode?: string | null;
}): HistoricalRefreshProgress {
  const remaining = run.totalUnits - run.completedUnits - run.failedUnits;
  const nextAction =
    run.status === "invalidated"
      ? "restart"
      : run.status === "success" || run.status === "cancelled"
        ? "done"
        : run.lastErrorCode === "RATE_LIMITED"
          ? "retry"
          : run.failedUnits > 0 && remaining <= 0
            ? "retry"
            : "step";
  return {
    runId: run.id,
    status: run.status,
    totalUnits: run.totalUnits,
    completedUnits: run.completedUnits,
    failedUnits: run.failedUnits,
    nextAction,
  };
}

function safeFailure(error: unknown): {
  code: string;
  message: string;
  retryAfterSeconds: number | null;
} {
  if (error instanceof PriceProviderError) {
    const messages: Record<string, string> = {
      CONFIG_ERROR: "Historical provider configuration is unavailable.",
      TIMEOUT: "Historical provider request timed out.",
      NETWORK_ERROR: "Historical provider network request failed.",
      AUTH_ERROR: "Historical provider credentials were rejected.",
      RATE_LIMITED: "Historical provider rate limit was reached.",
      UPSTREAM_ERROR: "Historical provider is temporarily unavailable.",
      UPSTREAM_PAYLOAD_INVALID:
        "Historical provider returned data that could not be safely stored.",
    };
    return {
      code: error.code,
      message: messages[error.code] ?? "Historical provider refresh failed.",
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "Historical provider refresh failed.",
    retryAfterSeconds: null,
  };
}

type UnitPayload =
  | { kind: "price"; observations: HistoricalPriceObservation[] }
  | { kind: "fx"; observations: HistoricalFxObservation[] };

export class HistoricalRefreshService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly adapters: HistoricalPriceProviderAdapters,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  start(input: {
    fromDate: string;
    toDate: string;
  }): HistoricalRefreshProgress {
    const fromDate = canonicalLocalDate(input.fromDate);
    const toDate = canonicalLocalDate(input.toDate);
    const now = runtimeNow(this.runtime);
    return this.context.db.transaction(
      (transaction) => {
        const timeZone = readAppTimeZoneOrDefault(transaction);
        assertService(
          toDate <= lastCompletedLocalDate(now, timeZone),
          "HISTORICAL_RANGE_INCLUDES_OPEN_DAY",
          "Historical refresh may end only on the last completed App day.",
        );
        const assets = listAssets(transaction);
        const mappings = listPriceProviderMappings(transaction);
        const plans = planHistoricalRefresh({
          fromDate,
          toDate,
          timeZone,
          assets,
          mappings,
        });
        const runId = this.runtime.id();
        const status = plans.length === 0 ? "success" : "pending";
        insertHistoricalRefreshRun(
          transaction,
          {
            id: runId,
            requestedFromDate: fromDate,
            requestedToDate: toDate,
            status,
            mappingFingerprint: historicalMappingFingerprint(mappings),
            totalUnits: plans.length,
            completedUnits: 0,
            failedUnits: 0,
            lastErrorCode: null,
            lastErrorMessage: null,
            requestedAt: now,
            updatedAt: now,
            completedAt: plans.length === 0 ? now : null,
          },
          plans.map((plan, ordinal) => ({
            id: this.runtime.id(),
            runId,
            ordinal,
            provider: plan.provider,
            assetId: plan.assetId,
            providerScopeJson: plan.providerScopeJson,
            intervalKind: plan.intervalKind,
            fromBoundary: plan.fromBoundary,
            toBoundary: plan.toBoundary,
            status: "pending",
            attempts: 0,
            lastErrorCode: null,
            lastErrorMessage: null,
            claimedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          })),
        );
        return historicalRefreshProgressFromRun(
          findHistoricalRefreshRun(transaction, runId)!,
        );
      },
      { behavior: "immediate" },
    );
  }

  private async fetchUnit(
    unit: ReturnType<typeof listHistoricalRefreshUnits>[number],
    fetchedAt: string,
  ): Promise<UnitPayload> {
    if (unit.provider === "coingecko") {
      const scope = cryptoScopeSchema.safeParse(
        JSON.parse(unit.providerScopeJson),
      );
      if (!scope.success || unit.intervalKind === "ecb_daily") {
        throw new PriceProviderError(
          "CONFIG_ERROR",
          "Stored CoinGecko refresh scope is invalid.",
        );
      }
      return {
        kind: "price",
        observations: await this.adapters.coingecko.fetchCryptoUsdHistory({
          mapping: scope.data.mapping,
          usdAssetId: scope.data.usdAssetId,
          fromUtc: unit.fromBoundary,
          toUtc: unit.toBoundary,
          interval: unit.intervalKind,
          fetchedAt,
        }),
      };
    }
    const scope = ecbScopeSchema.safeParse(JSON.parse(unit.providerScopeJson));
    if (!scope.success || unit.intervalKind !== "ecb_daily") {
      throw new PriceProviderError(
        "CONFIG_ERROR",
        "Stored ECB refresh scope is invalid.",
      );
    }
    return {
      kind: "fx",
      observations: await this.adapters.ecb.fetchEurReferenceHistory({
        mappings: scope.data.mappings,
        eurAssetId: scope.data.eurAssetId,
        fromDate: unit.fromBoundary,
        toDate: unit.toBoundary,
        fetchedAt,
      }),
    };
  }

  async step(input: {
    runId: string;
    maxUnits?: number;
  }): Promise<HistoricalRefreshProgress> {
    const requestedLimit = Number.isFinite(input.maxUnits)
      ? Math.trunc(input.maxUnits!)
      : MAX_STEP_UNITS;
    const limit = Math.min(MAX_STEP_UNITS, Math.max(1, requestedLimit));
    const claimedAt = runtimeNow(this.runtime);
    const claimed = this.context.db.transaction(
      (transaction) => {
        const run = findHistoricalRefreshRun(transaction, input.runId);
        assertService(
          Boolean(run),
          "HISTORICAL_REFRESH_RUN_NOT_FOUND",
          "Historical refresh run was not found.",
        );
        if (
          run!.status === "success" ||
          run!.status === "invalidated" ||
          run!.status === "cancelled"
        ) {
          return [];
        }
        const units = claimHistoricalRefreshUnits(transaction, {
          runId: input.runId,
          limit,
          claimedAt,
          staleBefore: new Date(
            canonicalUtcInstantValue(claimedAt) - UNIT_LEASE_MS,
          ).toISOString(),
        });
        if (units.length > 0) {
          markHistoricalRefreshRunRunning(transaction, input.runId, claimedAt);
        } else {
          updateHistoricalRefreshRunFromUnits(
            transaction,
            input.runId,
            claimedAt,
          );
        }
        return units;
      },
      { behavior: "immediate" },
    );

    for (let index = 0; index < claimed.length; index += 1) {
      const unit = claimed[index]!;
      const fetchedAt = runtimeNow(this.runtime);
      try {
        const payload = await this.fetchUnit(unit, fetchedAt);
        const committed = this.context.db.transaction(
          (transaction) => {
            const run = findHistoricalRefreshRun(transaction, input.runId);
            const currentUnit = findHistoricalRefreshUnit(transaction, unit.id);
            if (
              !run ||
              !currentUnit ||
              currentUnit.status !== "running" ||
              run.status === "cancelled" ||
              run.status === "invalidated"
            ) {
              return false;
            }
            const currentFingerprint = historicalMappingFingerprint(
              listPriceProviderMappings(transaction),
            );
            if (currentFingerprint !== run.mappingFingerprint) {
              invalidateHistoricalRefreshRun(transaction, {
                runId: run.id,
                code: "MAPPING_CHANGED",
                message:
                  "Provider mappings changed during refresh; fetched data was discarded.",
                updatedAt: fetchedAt,
              });
              return false;
            }
            if (payload.kind === "price") {
              upsertHistoricalPriceObservations(
                transaction,
                payload.observations,
                () => this.runtime.id(),
              );
            } else {
              upsertHistoricalFxObservations(
                transaction,
                payload.observations,
                () => this.runtime.id(),
              );
            }
            markHistoricalRefreshUnitSuccess(transaction, unit.id, fetchedAt);
            updateHistoricalRefreshRunFromUnits(
              transaction,
              input.runId,
              fetchedAt,
            );
            return true;
          },
          { behavior: "immediate" },
        );
        if (!committed) break;
      } catch (error) {
        const failedAt = runtimeNow(this.runtime);
        const failure = safeFailure(error);
        const retrySeconds =
          failure.code === "RATE_LIMITED"
            ? Math.max(60, failure.retryAfterSeconds ?? 60)
            : 0;
        this.context.db.transaction(
          (transaction) => {
            const run = findHistoricalRefreshRun(transaction, input.runId);
            const currentUnit = findHistoricalRefreshUnit(transaction, unit.id);
            if (
              !run ||
              !currentUnit ||
              currentUnit.status !== "running" ||
              run.status === "cancelled" ||
              run.status === "invalidated"
            ) {
              return;
            }
            markHistoricalRefreshUnitFailed(transaction, {
              unitId: unit.id,
              code: failure.code,
              message: failure.message,
              failedAt,
              retryAt:
                retrySeconds > 0
                  ? new Date(
                      canonicalUtcInstantValue(failedAt) + retrySeconds * 1_000,
                    ).toISOString()
                  : null,
            });
            if (failure.code === "RATE_LIMITED") {
              releaseHistoricalRefreshUnits(
                transaction,
                claimed.slice(index + 1).map((candidate) => candidate.id),
                failedAt,
              );
            }
            updateHistoricalRefreshRunFromUnits(
              transaction,
              input.runId,
              failedAt,
            );
          },
          { behavior: "immediate" },
        );
        if (failure.code === "RATE_LIMITED") break;
      }
    }
    const run = findHistoricalRefreshRun(this.context.db, input.runId);
    assertService(
      Boolean(run),
      "HISTORICAL_REFRESH_RUN_NOT_FOUND",
      "Historical refresh run was not found.",
    );
    return historicalRefreshProgressFromRun(run!);
  }

  cancel(input: { runId: string }): HistoricalRefreshProgress {
    const cancelledAt = runtimeNow(this.runtime);
    return this.context.db.transaction(
      (transaction) => {
        const run = findHistoricalRefreshRun(transaction, input.runId);
        assertService(
          Boolean(run),
          "HISTORICAL_REFRESH_RUN_NOT_FOUND",
          "Historical refresh run was not found.",
        );
        if (run!.status !== "success" && run!.status !== "invalidated") {
          cancelHistoricalRefreshRun(transaction, input.runId, cancelledAt);
        }
        return historicalRefreshProgressFromRun(
          findHistoricalRefreshRun(transaction, input.runId)!,
        );
      },
      { behavior: "immediate" },
    );
  }

  get(runId: string): HistoricalRefreshProgress | null {
    const run = findHistoricalRefreshRun(this.context.db, runId);
    return run ? historicalRefreshProgressFromRun(run) : null;
  }

  recent(limit = 10): HistoricalRefreshProgress[] {
    return listHistoricalRefreshRuns(this.context.db, limit).map(
      historicalRefreshProgressFromRun,
    );
  }
}
