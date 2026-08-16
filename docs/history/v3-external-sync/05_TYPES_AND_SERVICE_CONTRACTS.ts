// HISTORICAL DESIGN CONTRACT ONLY. NOT CURRENT SOURCE OR API.
// Current source and migrations take precedence.

export type ExternalProviderId = "kraken";

export type ExternalCandidateStatus =
  | "pending"
  | "needs_mapping"
  | "ignored"
  | "imported"
  | "unsupported"
  | "source_changed";

export interface ExternalConnectionView {
  id: string;
  bookId: string;
  provider: ExternalProviderId;
  name: string;
  credentialRef: string; // Opaque only.
  isEnabled: boolean;
}

export interface ExternalBalanceRecord {
  providerAssetKey: string;
  amountText: string; // Exact plain decimal string.
}

export interface ExternalSourceObject {
  objectType: "kraken_ledger" | "kraken_trade";
  externalId: string;
  occurredAt: string;
  payloadJson: string;
  payloadHash: string;
}

export interface CandidateLegDraft {
  role: "source" | "destination" | "fee" | "external_in" | "external_out" | "unknown";
  providerAssetKey: string;
  amountText: string;
  note?: string | null;
}

export interface ExternalCandidateDraft {
  stableKey: string;
  suggestedEventType: "exchange" | "transfer" | "income" | "expense" | "unknown";
  occurredAt: string;
  title: string;
  normalizationVersion: number;
  sourceFingerprint: string;
  primarySourceExternalIds: string[];
  crossCheckSourceExternalIds: string[];
  legs: CandidateLegDraft[];
}

export interface KrakenPermissionCheck {
  ok: boolean;
  permissions: string[];
  missingRequired: string[];
  forbiddenWritePermissions: string[];
  extraReadOnlyPermissions: string[];
}

export interface KrakenReferenceData {
  assets: Record<string, unknown>;
  assetPairs: Record<string, unknown>;
}

export interface KrakenSyncSnapshot {
  fetchedAt: string;
  permissions: KrakenPermissionCheck;
  referenceData: KrakenReferenceData;
  balances: ExternalBalanceRecord[];
  ledgers: ExternalSourceObject[];
  trades: ExternalSourceObject[];
}

export interface KrakenHttpTransport {
  request(input: {
    method: "GET" | "POST";
    url: URL;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; headers: Headers; text: string }>;
}

export interface KrakenReadOnlyProvider {
  validateCredentials(): Promise<KrakenPermissionCheck>;
  fetchSnapshot(input: {
    sinceLedger?: string | null;
    sinceTrade?: string | null;
  }): Promise<KrakenSyncSnapshot>;
}

export interface ExternalSyncService {
  syncNow(connectionId: string): Promise<{
    runId: string;
    balancesSeen: number;
    sourceObjectsSeen: number;
    candidatesCreated: number;
    candidatesUpdated: number;
  }>;
}

export interface CandidateImportInput {
  candidateId: string;
  chosenEventType: "expense" | "income" | "transfer" | "exchange";
  sourceAccountId?: string;
  destinationAccountId?: string;
  mainAccountId?: string;
  feeAccountId?: string | null;
  categoryId?: string | null;
  note?: string | null;
}

export interface ExternalImportService {
  importCandidate(input: CandidateImportInput): Promise<{
    candidateId: string;
    ledgerEventId: string;
  }>;
  ignoreCandidate(candidateId: string): Promise<void>;
}

export interface ExternalReconciliationService {
  reconcileObservation(input: {
    observationId: string;
    accountId: string;
    confirmed: true;
    note?: string | null;
  }): Promise<void>;
}

/*
Atomic import requirement:

ExternalImportService must be able to open one BEGIN IMMEDIATE transaction,
lock/revalidate the candidate, call the SAME executor-scoped V1 invariant/writer
used by normal commands, create external_import_link, and mark imported.

Do not duplicate Ledger invariants and do not directly insert ledger_entries
from a V3-specific bypass.
*/
