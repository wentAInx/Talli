import { createHash } from "node:crypto";

import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  ensureExternalConnectionState,
  findAssetById,
  findExternalAssetMapping,
  findExternalCandidateByStableKey,
  findExternalConnection,
  findExternalConnectionState,
  findExternalSourceObject,
  finishExternalSyncRun,
  insertExternalBalanceObservation,
  insertExternalCandidate,
  insertExternalSourceObject,
  insertExternalSyncRun,
  replaceExternalCandidateDetails,
  updateExternalCandidate,
  updateExternalConnectionState,
  updateExternalSourceObject,
  upsertExternalAssetMapping,
} from "../db/queries";
import { atomicToDb } from "../db/atomic";
import {
  canonicalExternalJson,
  externalDecimalToAtomic,
  type ExternalCandidateDraft,
} from "../domain/external-sync";
import { canonicalUtcInstantValue } from "../domain/time";
import { normalizeKrakenCandidates } from "../providers/kraken/candidates";
import {
  KrakenProviderError,
  safeKrakenFailure,
} from "../providers/kraken/errors";
import { resolveKrakenAssetDisplayCode } from "../providers/kraken/normalize";
import type {
  KrakenReadOnlyProvider,
  KrakenReferenceData,
  KrakenSourceObject,
  KrakenSyncSnapshot,
} from "../providers/kraken/types";
import { assertService, ServiceError } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

const activeConnections = new Set<string>();

export interface ExternalSyncResult {
  runId: string;
  balancesSeen: number;
  sourceObjectsSeen: number;
  candidatesCreated: number;
  candidatesUpdated: number;
}

export type KrakenProviderFactory = (
  connectionId: string,
) => KrakenReadOnlyProvider;

function safeJson(value: unknown): string {
  return JSON.stringify(value);
}

function permissionSummaryJson(
  permissions: Awaited<
    ReturnType<KrakenReadOnlyProvider["validateCredentials"]>
  >,
): string {
  return safeJson({
    ok: permissions.ok,
    permissions: permissions.permissions,
    missingRequired: permissions.missingRequired,
    forbiddenWritePermissions: permissions.forbiddenWritePermissions,
    extraReadOnlyPermissions: permissions.extraReadOnlyPermissions,
  });
}

function overlapInstant(value: string | null): string | null {
  if (!value) return null;
  return new Date(
    canonicalUtcInstantValue(value) - 5 * 60 * 1000,
  ).toISOString();
}

function sourceKey(
  objectType: "kraken_ledger" | "kraken_trade",
  externalId: string,
): string {
  return `${objectType}:${externalId}`;
}

function ledgerAssetKey(source: KrakenSourceObject): string | null {
  if (source.objectType !== "kraken_ledger") return null;
  const payload = JSON.parse(source.payloadJson) as Record<string, unknown>;
  return typeof payload.asset === "string" ? payload.asset : null;
}

function rawAssetKeyByDisplay(input: {
  rawKeys: readonly string[];
  referenceData: KrakenReferenceData;
}): Record<string, string> {
  const candidates = new Map<string, string[]>();
  for (const rawKey of [...new Set(input.rawKeys)].sort()) {
    const display = resolveKrakenAssetDisplayCode(
      rawKey,
      input.referenceData.assets,
    );
    if (!display) continue;
    const values = candidates.get(display) ?? [];
    values.push(rawKey);
    candidates.set(display, values);
  }
  return Object.fromEntries(
    [...candidates.entries()]
      .filter(([, values]) => values.length === 1)
      .map(([display, values]) => [display, values[0]!]),
  );
}

function metadataJson(
  providerAssetKey: string,
  referenceData: KrakenReferenceData,
): { displayCode: string | null; json: string | null } {
  const displayCode = resolveKrakenAssetDisplayCode(
    providerAssetKey,
    referenceData.assets,
  );
  const metadata = displayCode ? referenceData.assets[displayCode] : undefined;
  return {
    displayCode,
    json: metadata
      ? safeJson({
          displayCode: metadata.displayCode,
          altname: metadata.altname,
          decimals: metadata.decimals,
          displayDecimals: metadata.displayDecimals,
          status: metadata.status,
        })
      : null,
  };
}

function ensureMappings(
  executor: DatabaseExecutor,
  connectionId: string,
  rawKeys: readonly string[],
  referenceData: KrakenReferenceData,
  now: string,
): void {
  for (const providerAssetKey of [...new Set(rawKeys)].sort()) {
    const existing = findExternalAssetMapping(
      executor,
      connectionId,
      providerAssetKey,
    );
    const metadata = metadataJson(providerAssetKey, referenceData);
    upsertExternalAssetMapping(executor, {
      connectionId,
      providerAssetKey,
      providerDisplayCode: metadata.displayCode ?? providerAssetKey,
      talliAssetId: existing?.talliAssetId ?? null,
      mappingStatus: existing?.mappingStatus ?? "unmapped",
      providerMetadataJson: metadata.json,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}

function mappedCandidateLegs(
  executor: DatabaseExecutor,
  connectionId: string,
  draft: ExternalCandidateDraft,
  runtime: ServiceRuntime,
) {
  return draft.legs.map((leg, legIndex) => {
    const mapping = findExternalAssetMapping(
      executor,
      connectionId,
      leg.providerAssetKey,
    );
    const talliAssetId =
      mapping?.mappingStatus === "mapped" ? mapping.talliAssetId : null;
    const asset = talliAssetId ? findAssetById(executor, talliAssetId) : null;
    const conversion = externalDecimalToAtomic(
      leg.amountText,
      asset?.scale ?? null,
    );
    return {
      id: runtime.id(),
      legIndex,
      role: leg.role,
      providerAssetKey: leg.providerAssetKey,
      talliAssetId,
      amountText: leg.amountText,
      amountAtomic:
        conversion.amountAtomic === null
          ? null
          : atomicToDb(conversion.amountAtomic),
      precisionStatus: conversion.precisionStatus,
      note: leg.note ?? null,
    };
  });
}

function sourceLinks(
  draft: ExternalCandidateDraft,
  sourceIds: ReadonlyMap<string, string>,
) {
  const primaryType = draft.stableKey.startsWith("kraken:trade:")
    ? "kraken_trade"
    : "kraken_ledger";
  return [
    ...draft.primarySourceExternalIds.map((externalId) => {
      const sourceObjectId = sourceIds.get(sourceKey(primaryType, externalId));
      assertService(
        sourceObjectId,
        "EXTERNAL_SOURCE_NOT_FOUND",
        "Candidate primary source was not persisted.",
      );
      return { sourceObjectId, relation: "primary" as const };
    }),
    ...draft.crossCheckSourceExternalIds.map((externalId) => {
      const sourceObjectId = sourceIds.get(
        sourceKey("kraken_ledger", externalId),
      );
      assertService(
        sourceObjectId,
        "EXTERNAL_SOURCE_NOT_FOUND",
        "Candidate cross-check source was not persisted.",
      );
      return { sourceObjectId, relation: "cross_check" as const };
    }),
  ];
}

function persistSnapshot(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  runId: string;
  snapshot: KrakenSyncSnapshot;
  candidates: ExternalCandidateDraft[];
  runtime: ServiceRuntime;
}): ExternalSyncResult {
  const { executor, connectionId, runId, snapshot, candidates, runtime } =
    input;
  const now = snapshot.fetchedAt;
  const rawKeys = [
    ...snapshot.balances.map((balance) => balance.providerAssetKey),
    ...snapshot.ledgers
      .map(ledgerAssetKey)
      .filter((key): key is string => key !== null),
    ...candidates.flatMap((candidate) =>
      candidate.legs.map((leg) => leg.providerAssetKey),
    ),
  ];
  ensureMappings(executor, connectionId, rawKeys, snapshot.referenceData, now);

  const sourceIds = new Map<string, string>();
  for (const source of [...snapshot.ledgers, ...snapshot.trades]) {
    const existing = findExternalSourceObject(
      executor,
      connectionId,
      source.objectType,
      source.externalId,
    );
    const id = existing?.id ?? runtime.id();
    if (existing) {
      updateExternalSourceObject(executor, id, {
        occurredAt: source.occurredAt,
        payloadJson: source.payloadJson,
        payloadHash: source.payloadHash,
        lastSeenAt: now,
      });
    } else {
      insertExternalSourceObject(executor, {
        id,
        connectionId,
        objectType: source.objectType,
        externalId: source.externalId,
        occurredAt: source.occurredAt,
        payloadJson: source.payloadJson,
        payloadHash: source.payloadHash,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
    sourceIds.set(sourceKey(source.objectType, source.externalId), id);
  }

  for (const balance of snapshot.balances) {
    const mapping = findExternalAssetMapping(
      executor,
      connectionId,
      balance.providerAssetKey,
    );
    const talliAssetId =
      mapping?.mappingStatus === "mapped" ? mapping.talliAssetId : null;
    const asset = talliAssetId ? findAssetById(executor, talliAssetId) : null;
    const conversion = externalDecimalToAtomic(
      balance.amountText,
      asset?.scale ?? null,
    );
    const payloadJson = canonicalExternalJson({
      providerAssetKey: balance.providerAssetKey,
      amountText: balance.amountText,
    });
    insertExternalBalanceObservation(executor, {
      id: runtime.id(),
      connectionId,
      providerAssetKey: balance.providerAssetKey,
      talliAssetId,
      providerAmountText: balance.amountText,
      mappedAmountAtomic:
        conversion.amountAtomic === null
          ? null
          : atomicToDb(conversion.amountAtomic),
      precisionStatus: conversion.precisionStatus,
      observedAt: now,
      payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
      createdAt: now,
    });
  }

  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  for (const draft of candidates) {
    const existing = findExternalCandidateByStableKey(
      executor,
      connectionId,
      draft.stableKey,
    );
    const id = existing?.id ?? runtime.id();
    const legs = mappedCandidateLegs(executor, connectionId, draft, runtime);
    const mappedStatus = legs.some((leg) => leg.precisionStatus !== "exact")
      ? "needs_mapping"
      : draft.initialStatus;

    if (!existing) {
      insertExternalCandidate(executor, {
        id,
        connectionId,
        stableKey: draft.stableKey,
        suggestedEventType: draft.suggestedEventType,
        status: mappedStatus,
        occurredAt: draft.occurredAt,
        title: draft.title,
        normalizationVersion: draft.normalizationVersion,
        sourceFingerprint: draft.sourceFingerprint,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
      replaceExternalCandidateDetails(
        executor,
        id,
        sourceLinks(draft, sourceIds),
        legs,
      );
      candidatesCreated += 1;
      continue;
    }

    const sourceChanged =
      existing.sourceFingerprint !== draft.sourceFingerprint;
    const protectedStatus =
      existing.status === "imported" || existing.status === "source_changed"
        ? sourceChanged
          ? "source_changed"
          : existing.status
        : existing.status === "ignored"
          ? "ignored"
          : mappedStatus;
    updateExternalCandidate(executor, id, {
      suggestedEventType: draft.suggestedEventType,
      status: protectedStatus,
      occurredAt: draft.occurredAt,
      title: draft.title,
      normalizationVersion: draft.normalizationVersion,
      sourceFingerprint: draft.sourceFingerprint,
      updatedAt: now,
      lastSeenAt: now,
    });
    if (
      existing.status !== "imported" &&
      existing.status !== "source_changed"
    ) {
      replaceExternalCandidateDetails(
        executor,
        id,
        sourceLinks(draft, sourceIds),
        legs,
      );
    }
    candidatesUpdated += 1;
  }

  const result = {
    runId,
    balancesSeen: snapshot.balances.length,
    sourceObjectsSeen: snapshot.ledgers.length + snapshot.trades.length,
    candidatesCreated,
    candidatesUpdated,
  };
  finishExternalSyncRun(executor, runId, {
    finishedAt: now,
    status: "success",
    balancesSeen: result.balancesSeen,
    sourceObjectsSeen: result.sourceObjectsSeen,
    candidatesCreated,
    candidatesUpdated,
    errorCode: null,
    errorMessage: null,
  });
  updateExternalConnectionState(executor, connectionId, {
    lastSuccessAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastLedgerSyncAt: now,
    lastTradeSyncAt: now,
    updatedAt: now,
  });
  return result;
}

export class ExternalSyncService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly providerFactory: KrakenProviderFactory,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async syncNow(connectionId: string): Promise<ExternalSyncResult> {
    if (activeConnections.has(connectionId)) {
      throw new ServiceError(
        "EXTERNAL_SYNC_ALREADY_RUNNING",
        "A sync is already running for this connection.",
      );
    }
    activeConnections.add(connectionId);
    let runId: string | null = null;
    try {
      const startedAt = runtimeNow(this.runtime);
      runId = this.runtime.id();
      const cursors = this.context.db.transaction(
        (transaction) => {
          const connection = findExternalConnection(transaction, connectionId);
          assertService(
            connection,
            "EXTERNAL_CONNECTION_NOT_FOUND",
            "External connection was not found.",
          );
          assertService(
            connection.provider === "kraken" && connection.isEnabled,
            "EXTERNAL_CONNECTION_DISABLED",
            "Kraken connection is disabled.",
          );
          ensureExternalConnectionState(transaction, connectionId, startedAt);
          const state = findExternalConnectionState(transaction, connectionId)!;
          insertExternalSyncRun(transaction, {
            id: runId!,
            connectionId,
            startedAt,
            status: "running",
          });
          updateExternalConnectionState(transaction, connectionId, {
            lastAttemptAt: startedAt,
            lastErrorCode: null,
            lastErrorMessage: null,
            updatedAt: startedAt,
          });
          return {
            sinceLedger: overlapInstant(state.lastLedgerSyncAt),
            sinceTrade: overlapInstant(state.lastTradeSyncAt),
          };
        },
        { behavior: "immediate" },
      );

      const provider = this.providerFactory(connectionId);
      const permissions = await provider.validateCredentials();
      const permissionCheckedAt = runtimeNow(this.runtime);
      this.context.db.transaction(
        (transaction) => {
          updateExternalConnectionState(transaction, connectionId, {
            permissionCheckedAt,
            permissionSummaryJson: permissionSummaryJson(permissions),
            updatedAt: permissionCheckedAt,
          });
        },
        { behavior: "immediate" },
      );
      if (!permissions.ok) {
        throw new KrakenProviderError(
          "PERMISSION_ERROR",
          permissions.forbiddenWritePermissions.length > 0
            ? "Kraken key has dangerous write permissions; sync was refused."
            : "Kraken key is missing required read-only permissions.",
        );
      }

      const snapshot = await provider.fetchSnapshot({
        ...cursors,
        validatedPermissions: permissions,
      });
      const initialRawKeys = [
        ...snapshot.balances.map((balance) => balance.providerAssetKey),
        ...snapshot.ledgers
          .map(ledgerAssetKey)
          .filter((key): key is string => key !== null),
      ];
      const candidates = normalizeKrakenCandidates({
        trades: snapshot.trades,
        ledgers: snapshot.ledgers,
        referenceData: snapshot.referenceData,
        rawAssetKeyByDisplay: rawAssetKeyByDisplay({
          rawKeys: initialRawKeys,
          referenceData: snapshot.referenceData,
        }),
      });
      return this.context.db.transaction(
        (transaction) =>
          persistSnapshot({
            executor: transaction,
            connectionId,
            runId: runId!,
            snapshot,
            candidates,
            runtime: this.runtime,
          }),
        { behavior: "immediate" },
      );
    } catch (error) {
      if (runId) {
        const failedAt = runtimeNow(this.runtime);
        const failure = safeKrakenFailure(error);
        this.context.db.transaction(
          (transaction) => {
            finishExternalSyncRun(transaction, runId!, {
              finishedAt: failedAt,
              status: "error",
              balancesSeen: 0,
              sourceObjectsSeen: 0,
              candidatesCreated: 0,
              candidatesUpdated: 0,
              errorCode: failure.code,
              errorMessage: failure.message,
            });
            updateExternalConnectionState(transaction, connectionId, {
              lastErrorCode: failure.code,
              lastErrorMessage: failure.message,
              updatedAt: failedAt,
            });
          },
          { behavior: "immediate" },
        );
      }
      throw error;
    } finally {
      activeConnections.delete(connectionId);
    }
  }
}
