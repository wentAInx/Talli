import { createHash } from "node:crypto";

import { atomicToDb } from "../db/atomic";
import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  ensureEvmWalletConnectionState,
  ensureExternalConnectionState,
  findAssetById,
  findBookById,
  findEvmWalletConnection,
  findEvmWalletConnectionByAddress,
  findEvmWalletConnectionState,
  findExternalAssetMapping,
  findExternalCandidateByStableKey,
  findExternalConnection,
  findExternalSourceObject,
  finishExternalSyncRun,
  insertEvmBalanceObservationDetail,
  insertEvmWalletConnection,
  insertExternalBalanceObservation,
  insertExternalCandidate,
  insertExternalConnection,
  insertExternalSourceObject,
  insertExternalSyncRun,
  replaceExternalCandidateDetails,
  updateEvmWalletConnectionState,
  updateExternalCandidate,
  updateExternalConnectionState,
  updateExternalSourceObject,
  upsertEvmCandidateDetail,
  upsertEvmL2GasFeeDetail,
  upsertExternalAssetMapping,
} from "../db/queries";
import {
  EVM_ALCHEMY_CREDENTIAL_REF,
  evmChainIdentity,
  evmWalletSourceKey,
  isEvmChainId,
  normalizeEvmAddress,
  parseEvmAssetKey,
  type EvmChainId,
} from "../domain/evm";
import {
  canonicalExternalJson,
  externalDecimalToAtomic,
} from "../domain/external-sync";
import { canonicalUtcInstantValue } from "../domain/time";
import {
  normalizeEvmActivity,
  type EvmCandidateDraft,
  type EvmSourceObjectDraft,
} from "../providers/evm/candidates";
import { safeEvmFailure } from "../providers/evm/errors";
import type {
  EvmBalanceRecord,
  EvmReadOnlyProvider,
  EvmSyncSnapshot,
  EvmTransferRecord,
} from "../providers/evm/types";
import { assertService, ServiceError } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

const activeWalletConnections = new Set<string>();

export type EvmProviderFactory = (
  connectionId: string,
  chainId: EvmChainId,
) => EvmReadOnlyProvider;

export interface EvmSyncResult {
  runId: string;
  status: "success" | "partial";
  balanceIssues: number;
  balancesSeen: number;
  sourceObjectsSeen: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  activityStatus: "complete" | "trace_unavailable";
}

const TOKEN_BALANCE_PARTIAL_CODE = "EVM_TOKEN_BALANCE_PARTIAL";
const L2_TRACE_UNAVAILABLE_CODE = "EVM_L2_TRACE_UNAVAILABLE";
const L2_TRACE_UNAVAILABLE_MESSAGE =
  "Alchemy Debug API unavailable for reviewed L2 activity. Balance sync remains available.";

function balanceIssueSummary(snapshot: EvmSyncSnapshot): string | null {
  const issueCount = snapshot.balanceIssues.length;
  assertService(
    snapshot.balanceComplete === (issueCount === 0),
    "EVM_BALANCE_ISSUES_INVALID",
    "EVM balance completeness is inconsistent with its issue list.",
  );
  if (issueCount === 0) return null;
  const affected = snapshot.balanceIssues
    .map((issue) => issue.providerAssetKey)
    .filter((value): value is string => value !== null)
    .slice(0, 3);
  const suffix =
    affected.length > 0 ? ` Affected: ${affected.join(", ")}.` : "";
  return `${issueCount} token balance row${issueCount === 1 ? "" : "s"} could not be observed; unavailable rows were skipped.${suffix}`;
}

function sourceIdentity(
  objectType: EvmSourceObjectDraft["objectType"],
  externalId: string,
): string {
  return `${objectType}:${externalId}`;
}

function assetMetadata(input: {
  providerAssetKey: string;
  balance?: EvmBalanceRecord;
  transfer?: EvmTransferRecord;
}): { displayCode: string; payloadJson: string } {
  const identity = parseEvmAssetKey(input.providerAssetKey);
  const displayCode =
    input.balance?.displayCode ??
    input.transfer?.displayCode ??
    (identity.kind === "native" ? "ETH" : "ERC-20");
  return {
    displayCode,
    payloadJson: canonicalExternalJson({
      chainId: identity.chainId,
      assetKind: identity.kind,
      contractAddress: identity.contractAddressLower,
      decimals: input.balance?.decimals ?? input.transfer?.decimals ?? null,
      name: input.balance?.name ?? null,
      symbol: displayCode,
    }),
  };
}

function ensureMappings(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  snapshot: EvmSyncSnapshot;
  now: string;
}): void {
  const balanceByKey = new Map(
    input.snapshot.balances.map((balance) => [
      balance.providerAssetKey,
      balance,
    ]),
  );
  const transferByKey = new Map(
    input.snapshot.transfers.map((transfer) => [
      transfer.providerAssetKey,
      transfer,
    ]),
  );
  const keys = [
    ...new Set([...balanceByKey.keys(), ...transferByKey.keys()]),
  ].sort();
  for (const providerAssetKey of keys) {
    const existing = findExternalAssetMapping(
      input.executor,
      input.connectionId,
      providerAssetKey,
    );
    const metadata = assetMetadata({
      providerAssetKey,
      balance: balanceByKey.get(providerAssetKey),
      transfer: transferByKey.get(providerAssetKey),
    });
    upsertExternalAssetMapping(input.executor, {
      connectionId: input.connectionId,
      providerAssetKey,
      providerDisplayCode: metadata.displayCode,
      talliAssetId: existing?.talliAssetId ?? null,
      mappingStatus: existing?.mappingStatus ?? "unmapped",
      providerMetadataJson: metadata.payloadJson,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    });
  }
}

function persistSources(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  sources: readonly EvmSourceObjectDraft[];
  now: string;
  runtime: ServiceRuntime;
}): Map<string, string> {
  const ids = new Map<string, string>();
  for (const source of input.sources) {
    const existing = findExternalSourceObject(
      input.executor,
      input.connectionId,
      source.objectType,
      source.externalId,
    );
    const id = existing?.id ?? input.runtime.id();
    if (existing) {
      updateExternalSourceObject(input.executor, id, {
        occurredAt: source.occurredAt,
        payloadJson: source.payloadJson,
        payloadHash: source.payloadHash,
        lastSeenAt: input.now,
      });
    } else {
      insertExternalSourceObject(input.executor, {
        id,
        connectionId: input.connectionId,
        objectType: source.objectType,
        externalId: source.externalId,
        occurredAt: source.occurredAt,
        payloadJson: source.payloadJson,
        payloadHash: source.payloadHash,
        firstSeenAt: input.now,
        lastSeenAt: input.now,
      });
    }
    ids.set(sourceIdentity(source.objectType, source.externalId), id);
  }
  return ids;
}

function persistBalances(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  snapshot: EvmSyncSnapshot;
  runtime: ServiceRuntime;
}): void {
  for (const balance of input.snapshot.balances) {
    const mapping = findExternalAssetMapping(
      input.executor,
      input.connectionId,
      balance.providerAssetKey,
    );
    const talliAssetId =
      balance.decimals !== null && mapping?.mappingStatus === "mapped"
        ? mapping.talliAssetId
        : null;
    const asset = talliAssetId
      ? findAssetById(input.executor, talliAssetId)
      : null;
    const providerAmountText =
      balance.amountText ?? balance.rawAmountAtomicText;
    const conversion = externalDecimalToAtomic(
      providerAmountText,
      balance.decimals === null ? null : (asset?.scale ?? null),
    );
    const payloadJson = canonicalExternalJson({
      chainId: input.snapshot.chainId,
      providerAssetKey: balance.providerAssetKey,
      rawAmountAtomic: balance.rawAmountAtomicText,
      decimals: balance.decimals,
      amount: balance.amountText,
      syncHeadBlock: input.snapshot.syncHeadBlockText,
    });
    const observationId = input.runtime.id();
    insertExternalBalanceObservation(input.executor, {
      id: observationId,
      connectionId: input.connectionId,
      providerAssetKey: balance.providerAssetKey,
      talliAssetId,
      providerAmountText,
      mappedAmountAtomic:
        conversion.amountAtomic === null
          ? null
          : atomicToDb(conversion.amountAtomic),
      precisionStatus: conversion.precisionStatus,
      observedAt: input.snapshot.balanceObservedAt,
      payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
      createdAt: input.snapshot.syncCompletedAt,
    });
    insertEvmBalanceObservationDetail(input.executor, {
      observationId,
      chainId: input.snapshot.chainId,
      assetKind: balance.assetKind,
      contractAddressLower: balance.contractAddressLower,
      rawAmountAtomicText: balance.rawAmountAtomicText,
      tokenDecimals: balance.decimals,
      syncHeadBlockText: input.snapshot.syncHeadBlockText,
    });
  }
}

function candidateLegs(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  draft: EvmCandidateDraft;
  runtime: ServiceRuntime;
}) {
  return input.draft.legs.map((leg, legIndex) => {
    const mapping = findExternalAssetMapping(
      input.executor,
      input.connectionId,
      leg.providerAssetKey,
    );
    const talliAssetId =
      mapping?.mappingStatus === "mapped" ? mapping.talliAssetId : null;
    const asset = talliAssetId
      ? findAssetById(input.executor, talliAssetId)
      : null;
    const conversion = externalDecimalToAtomic(
      leg.amountText,
      asset?.scale ?? null,
    );
    return {
      id: input.runtime.id(),
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

function candidateSourceLinks(
  draft: EvmCandidateDraft,
  sourceIds: ReadonlyMap<string, string>,
) {
  return [
    ...draft.primarySourceExternalIds.map((externalId) => {
      const sourceObjectId = sourceIds.get(
        sourceIdentity("evm_transaction", externalId),
      );
      assertService(
        sourceObjectId,
        "EXTERNAL_SOURCE_NOT_FOUND",
        "EVM candidate primary transaction source was not persisted.",
      );
      return { sourceObjectId, relation: "primary" as const };
    }),
    ...draft.crossCheckSourceExternalIds.map((externalId) => {
      const sourceObjectId = sourceIds.get(
        sourceIdentity("evm_transfer", externalId),
      );
      assertService(
        sourceObjectId,
        "EXTERNAL_SOURCE_NOT_FOUND",
        "EVM candidate transfer source was not persisted.",
      );
      return { sourceObjectId, relation: "cross_check" as const };
    }),
  ];
}

function persistEvmCandidateExtension(
  executor: DatabaseExecutor,
  candidateId: string,
  draft: EvmCandidateDraft,
): void {
  upsertEvmCandidateDetail(executor, {
    candidateId,
    ...draft.detail,
  });
  if (draft.l2GasFee) {
    upsertEvmL2GasFeeDetail(executor, {
      candidateId,
      chainId: draft.l2GasFee.chainId,
      feeModel: draft.l2GasFee.feeModel,
      executionFeeAtomicText: draft.l2GasFee.executionFeeAtomicText,
      parentDataFeeAtomicText: draft.l2GasFee.parentDataFeeAtomicText,
      operatorFeeAtomicText: draft.l2GasFee.operatorFeeAtomicText,
      totalFeeAtomicText: draft.l2GasFee.totalFeeAtomicText,
      feeStatus: draft.l2GasFee.status,
      evidenceJson: draft.l2GasFee.evidenceJson,
    });
  }
}

function persistCandidates(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  candidates: readonly EvmCandidateDraft[];
  sourceIds: ReadonlyMap<string, string>;
  now: string;
  runtime: ServiceRuntime;
}): { candidatesCreated: number; candidatesUpdated: number } {
  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  for (const draft of input.candidates) {
    const existing = findExternalCandidateByStableKey(
      input.executor,
      input.connectionId,
      draft.stableKey,
    );
    const id = existing?.id ?? input.runtime.id();
    const legs = candidateLegs({
      executor: input.executor,
      connectionId: input.connectionId,
      draft,
      runtime: input.runtime,
    });
    const mappedStatus =
      draft.initialStatus === "unsupported"
        ? "unsupported"
        : legs.some((leg) => leg.precisionStatus !== "exact")
          ? "needs_mapping"
          : draft.initialStatus;
    if (!existing) {
      insertExternalCandidate(input.executor, {
        id,
        connectionId: input.connectionId,
        stableKey: draft.stableKey,
        suggestedEventType: draft.suggestedEventType,
        status: mappedStatus,
        occurredAt: draft.occurredAt,
        title: draft.title,
        normalizationVersion: draft.normalizationVersion,
        sourceFingerprint: draft.sourceFingerprint,
        createdAt: input.now,
        updatedAt: input.now,
        lastSeenAt: input.now,
      });
      replaceExternalCandidateDetails(
        input.executor,
        id,
        candidateSourceLinks(draft, input.sourceIds),
        legs,
      );
      persistEvmCandidateExtension(input.executor, id, draft);
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
    updateExternalCandidate(input.executor, id, {
      suggestedEventType: draft.suggestedEventType,
      status: protectedStatus,
      occurredAt: draft.occurredAt,
      title: draft.title,
      normalizationVersion: draft.normalizationVersion,
      sourceFingerprint: draft.sourceFingerprint,
      updatedAt: input.now,
      lastSeenAt: input.now,
    });
    if (
      existing.status !== "imported" &&
      existing.status !== "source_changed"
    ) {
      replaceExternalCandidateDetails(
        input.executor,
        id,
        candidateSourceLinks(draft, input.sourceIds),
        legs,
      );
      persistEvmCandidateExtension(input.executor, id, draft);
    }
    candidatesUpdated += 1;
  }
  return { candidatesCreated, candidatesUpdated };
}

export class EvmWalletService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly providerFactory: EvmProviderFactory,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async createWallet(input: {
    bookId: string;
    name: string;
    chainId: EvmChainId;
    publicAddress: string;
    historyStartAt: string;
  }): Promise<string> {
    const chain = evmChainIdentity(input.chainId);
    const addressLower = normalizeEvmAddress(input.publicAddress);
    canonicalUtcInstantValue(input.historyStartAt);
    const name = input.name.trim();
    assertService(
      name.length > 0,
      "EVM_WALLET_NAME_REQUIRED",
      "Wallet label is required.",
    );
    return this.context.db.transaction(
      (transaction) => {
        assertService(
          findBookById(transaction, input.bookId),
          "BOOK_NOT_FOUND",
          "Book was not found.",
        );
        assertService(
          !findEvmWalletConnectionByAddress(
            transaction,
            input.chainId,
            addressLower,
          ),
          "EVM_WALLET_DUPLICATE",
          `This ${chain.displayName} public address already exists.`,
        );
        const now = runtimeNow(this.runtime);
        const connectionId = this.runtime.id();
        insertExternalConnection(transaction, {
          id: connectionId,
          bookId: input.bookId,
          provider: "evm_wallet",
          sourceKey: evmWalletSourceKey(input.chainId, addressLower),
          name,
          credentialRef: EVM_ALCHEMY_CREDENTIAL_REF,
          isEnabled: true,
          createdAt: now,
          updatedAt: now,
        });
        insertEvmWalletConnection(transaction, {
          connectionId,
          chainId: chain.chainId,
          networkId: chain.networkId,
          addressLower,
          addressDisplay: input.publicAddress.trim(),
          dataProvider: "alchemy",
          historyStartAt: input.historyStartAt,
          createdAt: now,
          updatedAt: now,
        });
        ensureExternalConnectionState(transaction, connectionId, now);
        ensureEvmWalletConnectionState(transaction, connectionId, now);
        return connectionId;
      },
      { behavior: "immediate" },
    );
  }

  async syncNow(connectionId: string): Promise<EvmSyncResult> {
    if (activeWalletConnections.has(connectionId)) {
      throw new ServiceError(
        "EXTERNAL_SYNC_ALREADY_RUNNING",
        "A sync is already running for this wallet.",
      );
    }
    activeWalletConnections.add(connectionId);
    let runId: string | null = null;
    let runStarted = false;
    try {
      const startedAt = runtimeNow(this.runtime);
      runId = this.runtime.id();
      const wallet = this.context.db.transaction(
        (transaction) => {
          const connection = findExternalConnection(transaction, connectionId);
          const subtype = findEvmWalletConnection(transaction, connectionId);
          assertService(
            connection &&
              subtype &&
              connection.provider === "evm_wallet" &&
              connection.isEnabled,
            "EXTERNAL_CONNECTION_DISABLED",
            "EVM wallet connection is missing or disabled.",
          );
          assertService(
            isEvmChainId(subtype.chainId),
            "EVM_CHAIN_UNSUPPORTED",
            "EVM wallet chain is unsupported.",
          );
          ensureExternalConnectionState(transaction, connectionId, startedAt);
          ensureEvmWalletConnectionState(transaction, connectionId, startedAt);
          const state = findEvmWalletConnectionState(
            transaction,
            connectionId,
          )!;
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
          return { subtype, state, chainId: subtype.chainId };
        },
        { behavior: "immediate" },
      );
      runStarted = true;

      const snapshot = await this.providerFactory(
        connectionId,
        wallet.chainId,
      ).fetchSnapshot({
        chainId: wallet.chainId,
        address: wallet.subtype.addressLower,
        historyStartAt: wallet.subtype.historyStartAt,
        lastFinalizedBlockText: wallet.state.lastFinalizedBlockText,
        previousTraceCapability: wallet.state.traceCapabilityStatus,
      });
      assertService(
        snapshot.chainId === wallet.chainId &&
          snapshot.addressLower === wallet.subtype.addressLower,
        "EVM_SNAPSHOT_IDENTITY_MISMATCH",
        "EVM provider snapshot identity is inconsistent with its wallet.",
      );
      const chain = evmChainIdentity(wallet.chainId);
      const traceUnavailable =
        snapshot.activityCapability.activityStatus === "trace_unavailable";
      assertService(
        snapshot.activityCapability.historyCoverage === chain.historyCoverage,
        "EVM_HISTORY_COVERAGE_MISMATCH",
        "EVM provider history coverage is inconsistent with its chain.",
      );
      assertService(
        !traceUnavailable || chain.requiresDebugForMovement,
        "EVM_TRACE_CAPABILITY_INVALID",
        "Trace-unavailable activity is only valid for an L2 wallet.",
      );
      if (chain.requiresDebugForMovement) {
        assertService(
          traceUnavailable
            ? snapshot.activityCapability.traceCapability ===
                "trace_unavailable"
            : snapshot.activityCapability.traceCapability !==
                "trace_unavailable" &&
                snapshot.transactions.every(
                  (transaction) => transaction.nativeTrace?.status === "exact",
                ),
          "EVM_L2_TRACE_CAPABILITY_INVALID",
          "Every discovered L2 transaction requires an exact call trace.",
        );
      }
      const normalized = normalizeEvmActivity({
        chainId: wallet.chainId,
        walletAddressLower: wallet.subtype.addressLower,
        transfers: snapshot.transfers,
        transactions: snapshot.transactions,
      });
      const balancePartialMessage = balanceIssueSummary(snapshot);
      assertService(
        !traceUnavailable ||
          (snapshot.transfers.length === 0 &&
            snapshot.transactions.length === 0 &&
            normalized.sources.length === 0 &&
            normalized.candidates.length === 0),
        "EVM_L2_TRACE_PARTIAL_ACTIVITY",
        "Trace-unavailable L2 snapshots must not contain activity facts.",
      );
      const partialMessage = traceUnavailable
        ? L2_TRACE_UNAVAILABLE_MESSAGE
        : balancePartialMessage;
      const partialCode = traceUnavailable
        ? L2_TRACE_UNAVAILABLE_CODE
        : snapshot.balanceComplete
          ? null
          : TOKEN_BALANCE_PARTIAL_CODE;
      const syncStatus: EvmSyncResult["status"] =
        snapshot.balanceComplete && !traceUnavailable ? "success" : "partial";
      return this.context.db.transaction(
        (transaction) => {
          ensureMappings({
            executor: transaction,
            connectionId,
            snapshot,
            now: snapshot.syncCompletedAt,
          });
          const sourceIds = persistSources({
            executor: transaction,
            connectionId,
            sources: normalized.sources,
            now: snapshot.syncCompletedAt,
            runtime: this.runtime,
          });
          persistBalances({
            executor: transaction,
            connectionId,
            snapshot,
            runtime: this.runtime,
          });
          const counts = persistCandidates({
            executor: transaction,
            connectionId,
            candidates: normalized.candidates,
            sourceIds,
            now: snapshot.syncCompletedAt,
            runtime: this.runtime,
          });
          const result = {
            runId: runId!,
            status: syncStatus,
            balanceIssues: snapshot.balanceIssues.length,
            balancesSeen: snapshot.balances.length,
            sourceObjectsSeen: normalized.sources.length,
            ...counts,
            activityStatus: snapshot.activityCapability.activityStatus,
          };
          finishExternalSyncRun(transaction, runId!, {
            finishedAt: snapshot.syncCompletedAt,
            status: syncStatus,
            balancesSeen: result.balancesSeen,
            sourceObjectsSeen: result.sourceObjectsSeen,
            candidatesCreated: result.candidatesCreated,
            candidatesUpdated: result.candidatesUpdated,
            errorCode: partialCode,
            errorMessage: partialMessage,
          });
          updateExternalConnectionState(transaction, connectionId, {
            lastSuccessAt: snapshot.syncCompletedAt,
            lastErrorCode: partialCode,
            lastErrorMessage: partialMessage,
            updatedAt: snapshot.syncCompletedAt,
          });
          updateEvmWalletConnectionState(
            transaction,
            connectionId,
            traceUnavailable
              ? {
                  traceCapabilityStatus:
                    snapshot.activityCapability.traceCapability,
                  traceCheckedAt: snapshot.syncCompletedAt,
                  lastBalanceSyncAt: snapshot.balanceObservedAt,
                  updatedAt: snapshot.syncCompletedAt,
                }
              : {
                  lastFinalizedBlockText: snapshot.finalizedBlockText,
                  lastBalanceSyncAt: snapshot.balanceObservedAt,
                  lastActivitySyncAt: snapshot.syncCompletedAt,
                  traceCapabilityStatus:
                    snapshot.activityCapability.traceCapability,
                  traceCheckedAt:
                    snapshot.activityCapability.traceCapability === "unknown"
                      ? wallet.state.traceCheckedAt
                      : snapshot.syncCompletedAt,
                  updatedAt: snapshot.syncCompletedAt,
                },
          );
          return result;
        },
        { behavior: "immediate" },
      );
    } catch (error) {
      if (runId && runStarted) {
        const failedAt = runtimeNow(this.runtime);
        const failure = safeEvmFailure(error);
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
      activeWalletConnections.delete(connectionId);
    }
  }
}
