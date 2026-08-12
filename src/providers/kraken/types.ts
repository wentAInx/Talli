export type KrakenPermission =
  | "query-funds"
  | "add-funds"
  | "withdraw-funds"
  | "earn-funds"
  | "query-open-trades"
  | "query-closed-trades"
  | "modify-trades"
  | "close-trades"
  | "query-ledger"
  | "export-data"
  | "create-ws-token"
  | "add-withdraw-address"
  | "update-withdraw-address"
  | string;

export interface KrakenPermissionCheck {
  ok: boolean;
  permissions: string[];
  missingRequired: string[];
  forbiddenWritePermissions: string[];
  extraReadOnlyPermissions: string[];
}

export interface KrakenAssetMetadata {
  displayCode: string;
  altname: string | null;
  decimals: number | null;
  displayDecimals: number | null;
  status: string | null;
}

export interface KrakenPairMetadata {
  displayPair: string;
  providerAliases: string[];
  altname: string | null;
  wsname: string | null;
  base: string;
  quote: string;
  feeVolumeCurrency: string | null;
  pairDecimals: number | null;
  lotDecimals: number | null;
}

export interface KrakenReferenceData {
  assets: Record<string, KrakenAssetMetadata>;
  assetPairs: Record<string, KrakenPairMetadata>;
}

export interface KrakenBalanceRecord {
  providerAssetKey: string;
  amountText: string;
}

export interface KrakenSourceObject {
  objectType: "kraken_ledger" | "kraken_trade";
  externalId: string;
  occurredAt: string;
  payloadJson: string;
  payloadHash: string;
}

export interface KrakenSyncSnapshot {
  fetchedAt: string;
  permissions: KrakenPermissionCheck;
  referenceData: KrakenReferenceData;
  balances: KrakenBalanceRecord[];
  ledgers: KrakenSourceObject[];
  trades: KrakenSourceObject[];
}

export interface KrakenHttpTransport {
  request(input: {
    method: "GET" | "POST";
    url: URL;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
  }): Promise<{ status: number; headers: Headers; text: string }>;
}

export interface KrakenNonceSource {
  next(connectionId: string): string;
}

export interface KrakenReadOnlyProvider {
  validateCredentials(): Promise<KrakenPermissionCheck>;
  fetchSnapshot(input?: {
    sinceLedger?: string | null;
    sinceTrade?: string | null;
    validatedPermissions?: KrakenPermissionCheck;
  }): Promise<KrakenSyncSnapshot>;
}

export interface KrakenRuntimeConfiguration {
  credentialRef: "env:kraken.primary";
  configured: boolean;
  apiKey: string | null;
  apiSecret: string | null;
}

export interface SafeKrakenConfigurationView {
  credentialRef: "env:kraken.primary";
  configured: boolean;
}
