import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";

import { canonicalUtcInstantValue } from "../../domain/time";
import type { DatabaseExecutor } from "../connection";
import {
  historicalRefreshRuns,
  historicalRefreshUnits,
  type HistoricalRefreshRunRow,
  type HistoricalRefreshUnitRow,
} from "../schema";

const INSERT_UNIT_CHUNK_SIZE = 50;

export function insertHistoricalRefreshRun(
  executor: DatabaseExecutor,
  run: typeof historicalRefreshRuns.$inferInsert,
  units: Array<typeof historicalRefreshUnits.$inferInsert>,
): void {
  canonicalUtcInstantValue(run.requestedAt);
  canonicalUtcInstantValue(run.updatedAt);
  executor.insert(historicalRefreshRuns).values(run).run();
  for (let index = 0; index < units.length; index += INSERT_UNIT_CHUNK_SIZE) {
    executor
      .insert(historicalRefreshUnits)
      .values(units.slice(index, index + INSERT_UNIT_CHUNK_SIZE))
      .run();
  }
}

export function findHistoricalRefreshRun(
  executor: DatabaseExecutor,
  id: string,
) {
  return executor
    .select()
    .from(historicalRefreshRuns)
    .where(eq(historicalRefreshRuns.id, id))
    .get();
}

export function listHistoricalRefreshRuns(
  executor: DatabaseExecutor,
  limit = 10,
) {
  return executor
    .select()
    .from(historicalRefreshRuns)
    .orderBy(
      desc(historicalRefreshRuns.requestedAt),
      desc(historicalRefreshRuns.id),
    )
    .limit(limit)
    .all();
}

export function listHistoricalRefreshUnits(
  executor: DatabaseExecutor,
  runId: string,
) {
  return executor
    .select()
    .from(historicalRefreshUnits)
    .where(eq(historicalRefreshUnits.runId, runId))
    .orderBy(asc(historicalRefreshUnits.ordinal))
    .all();
}

export function findHistoricalRefreshUnit(
  executor: DatabaseExecutor,
  id: string,
) {
  return executor
    .select()
    .from(historicalRefreshUnits)
    .where(eq(historicalRefreshUnits.id, id))
    .get();
}

export function claimHistoricalRefreshUnits(
  executor: DatabaseExecutor,
  input: {
    runId: string;
    limit: number;
    claimedAt: string;
    staleBefore: string;
  },
): HistoricalRefreshUnitRow[] {
  canonicalUtcInstantValue(input.claimedAt);
  canonicalUtcInstantValue(input.staleBefore);
  const coolingDown = executor
    .select({ id: historicalRefreshUnits.id })
    .from(historicalRefreshUnits)
    .where(
      and(
        eq(historicalRefreshUnits.runId, input.runId),
        eq(historicalRefreshUnits.lastErrorCode, "RATE_LIMITED"),
        gt(historicalRefreshUnits.updatedAt, input.claimedAt),
      ),
    )
    .get();
  if (coolingDown) return [];
  executor
    .update(historicalRefreshUnits)
    .set({
      status: "pending",
      claimedAt: null,
      updatedAt: input.claimedAt,
    })
    .where(
      and(
        eq(historicalRefreshUnits.runId, input.runId),
        eq(historicalRefreshUnits.status, "running"),
        lte(historicalRefreshUnits.claimedAt, input.staleBefore),
      ),
    )
    .run();
  let pending = executor
    .select()
    .from(historicalRefreshUnits)
    .where(
      and(
        eq(historicalRefreshUnits.runId, input.runId),
        eq(historicalRefreshUnits.status, "pending"),
      ),
    )
    .orderBy(asc(historicalRefreshUnits.ordinal))
    .limit(input.limit)
    .all();
  if (pending.length === 0) {
    const failed = executor
      .select({ id: historicalRefreshUnits.id })
      .from(historicalRefreshUnits)
      .where(
        and(
          eq(historicalRefreshUnits.runId, input.runId),
          eq(historicalRefreshUnits.status, "failed"),
          lte(historicalRefreshUnits.updatedAt, input.claimedAt),
        ),
      )
      .orderBy(asc(historicalRefreshUnits.ordinal))
      .limit(input.limit)
      .all();
    if (failed.length > 0) {
      executor
        .update(historicalRefreshUnits)
        .set({ status: "pending", updatedAt: input.claimedAt })
        .where(
          inArray(
            historicalRefreshUnits.id,
            failed.map((unit) => unit.id),
          ),
        )
        .run();
      pending = executor
        .select()
        .from(historicalRefreshUnits)
        .where(
          inArray(
            historicalRefreshUnits.id,
            failed.map((unit) => unit.id),
          ),
        )
        .orderBy(asc(historicalRefreshUnits.ordinal))
        .all();
    }
  }
  if (pending.length === 0) return [];
  executor
    .update(historicalRefreshUnits)
    .set({
      status: "running",
      attempts: sql`${historicalRefreshUnits.attempts} + 1`,
      lastErrorCode: null,
      lastErrorMessage: null,
      claimedAt: input.claimedAt,
      completedAt: null,
      updatedAt: input.claimedAt,
    })
    .where(
      inArray(
        historicalRefreshUnits.id,
        pending.map((unit) => unit.id),
      ),
    )
    .run();
  return executor
    .select()
    .from(historicalRefreshUnits)
    .where(
      inArray(
        historicalRefreshUnits.id,
        pending.map((unit) => unit.id),
      ),
    )
    .orderBy(asc(historicalRefreshUnits.ordinal))
    .all();
}

export function markHistoricalRefreshUnitSuccess(
  executor: DatabaseExecutor,
  unitId: string,
  completedAt: string,
): void {
  canonicalUtcInstantValue(completedAt);
  executor
    .update(historicalRefreshUnits)
    .set({
      status: "success",
      lastErrorCode: null,
      lastErrorMessage: null,
      claimedAt: null,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(historicalRefreshUnits.id, unitId))
    .run();
}

export function markHistoricalRefreshUnitFailed(
  executor: DatabaseExecutor,
  input: {
    unitId: string;
    code: string;
    message: string;
    failedAt: string;
    retryAt?: string | null;
  },
): void {
  canonicalUtcInstantValue(input.failedAt);
  if (input.retryAt) canonicalUtcInstantValue(input.retryAt);
  executor
    .update(historicalRefreshUnits)
    .set({
      status: "failed",
      lastErrorCode: input.code,
      lastErrorMessage: input.message,
      claimedAt: null,
      completedAt: input.failedAt,
      updatedAt: input.retryAt ?? input.failedAt,
    })
    .where(eq(historicalRefreshUnits.id, input.unitId))
    .run();
}

export function releaseHistoricalRefreshUnits(
  executor: DatabaseExecutor,
  unitIds: readonly string[],
  updatedAt: string,
): void {
  if (unitIds.length === 0) return;
  canonicalUtcInstantValue(updatedAt);
  executor
    .update(historicalRefreshUnits)
    .set({ status: "pending", claimedAt: null, updatedAt })
    .where(
      and(
        inArray(historicalRefreshUnits.id, [...unitIds]),
        eq(historicalRefreshUnits.status, "running"),
      ),
    )
    .run();
}

export function markHistoricalRefreshRunRunning(
  executor: DatabaseExecutor,
  runId: string,
  updatedAt: string,
): void {
  canonicalUtcInstantValue(updatedAt);
  executor
    .update(historicalRefreshRuns)
    .set({ status: "running", updatedAt, completedAt: null })
    .where(eq(historicalRefreshRuns.id, runId))
    .run();
}

export function updateHistoricalRefreshRunFromUnits(
  executor: DatabaseExecutor,
  runId: string,
  updatedAt: string,
): HistoricalRefreshRunRow | undefined {
  canonicalUtcInstantValue(updatedAt);
  const run = findHistoricalRefreshRun(executor, runId);
  if (!run) return undefined;
  if (run.status === "invalidated" || run.status === "cancelled") return run;
  const units = listHistoricalRefreshUnits(executor, runId);
  const completedUnits = units.filter(
    (unit) => unit.status === "success",
  ).length;
  const failed = units.filter((unit) => unit.status === "failed");
  const active = units.filter(
    (unit) => unit.status === "pending" || unit.status === "running",
  );
  const status =
    completedUnits === run.totalUnits
      ? "success"
      : failed.length > 0 && active.length === 0
        ? completedUnits > 0
          ? "partial"
          : "failed"
        : failed.length > 0
          ? "partial"
          : "running";
  const lastFailure = failed.sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.ordinal - left.ordinal,
  )[0];
  executor
    .update(historicalRefreshRuns)
    .set({
      status,
      completedUnits,
      failedUnits: failed.length,
      lastErrorCode: lastFailure?.lastErrorCode ?? null,
      lastErrorMessage: lastFailure?.lastErrorMessage ?? null,
      updatedAt,
      completedAt:
        status === "success" || status === "failed" ? updatedAt : null,
    })
    .where(eq(historicalRefreshRuns.id, runId))
    .run();
  return findHistoricalRefreshRun(executor, runId);
}

export function invalidateHistoricalRefreshRun(
  executor: DatabaseExecutor,
  input: { runId: string; code: string; message: string; updatedAt: string },
): void {
  canonicalUtcInstantValue(input.updatedAt);
  executor
    .update(historicalRefreshUnits)
    .set({
      status: "failed",
      lastErrorCode: input.code,
      lastErrorMessage: input.message,
      claimedAt: null,
      completedAt: input.updatedAt,
      updatedAt: input.updatedAt,
    })
    .where(
      and(
        eq(historicalRefreshUnits.runId, input.runId),
        inArray(historicalRefreshUnits.status, ["pending", "running"]),
      ),
    )
    .run();
  executor
    .update(historicalRefreshRuns)
    .set({
      status: "invalidated",
      lastErrorCode: input.code,
      lastErrorMessage: input.message,
      updatedAt: input.updatedAt,
      completedAt: input.updatedAt,
    })
    .where(eq(historicalRefreshRuns.id, input.runId))
    .run();
}

export function cancelHistoricalRefreshRun(
  executor: DatabaseExecutor,
  runId: string,
  cancelledAt: string,
): void {
  canonicalUtcInstantValue(cancelledAt);
  executor
    .update(historicalRefreshUnits)
    .set({
      status: "failed",
      lastErrorCode: "CANCELLED",
      lastErrorMessage: "Historical refresh was cancelled by the user.",
      claimedAt: null,
      completedAt: cancelledAt,
      updatedAt: cancelledAt,
    })
    .where(
      and(
        eq(historicalRefreshUnits.runId, runId),
        inArray(historicalRefreshUnits.status, ["pending", "running"]),
      ),
    )
    .run();
  executor
    .update(historicalRefreshRuns)
    .set({
      status: "cancelled",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: cancelledAt,
      completedAt: cancelledAt,
    })
    .where(eq(historicalRefreshRuns.id, runId))
    .run();
}
