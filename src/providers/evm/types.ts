export type AlchemyReadMethod =
  | "eth_chainId"
  | "eth_blockNumber"
  | "eth_getBlockByNumber"
  | "eth_getBalance"
  | "eth_getTransactionByHash"
  | "eth_getTransactionReceipt"
  | "alchemy_getTokenBalances"
  | "alchemy_getTokenMetadata"
  | "alchemy_getAssetTransfers";

export interface EvmJsonRpcTransport {
  request(input: {
    url: URL;
    body: string;
    timeoutMs: number;
  }): Promise<{ status: number; headers: Headers; text: string }>;
}

export interface EvmTokenMetadata {
  contractAddressLower: string;
  decimals: number | null;
  name: string | null;
  symbol: string | null;
}

export interface EvmBalanceRecord {
  providerAssetKey: string;
  assetKind: "native" | "erc20";
  contractAddressLower: string | null;
  rawAmountAtomicText: string;
  decimals: number | null;
  amountText: string | null;
  displayCode: string | null;
  name: string | null;
}

export interface EvmBalanceIssue {
  code: "TOKEN_BALANCE_UNAVAILABLE";
  providerAssetKey: string | null;
  message: string;
}

export interface EvmTransferRecord {
  uniqueId: string;
  txHash: string;
  category: "external" | "internal" | "erc20";
  fromAddressLower: string;
  toAddressLower: string | null;
  providerAssetKey: string;
  contractAddressLower: string | null;
  rawAmountAtomicText: string;
  decimals: number | null;
  amountText: string | null;
  displayCode: string | null;
  blockNumberText: string;
  occurredAt: string;
  humanValue: string | number | null;
}

export interface EvmTransactionRecord {
  txHash: string;
  fromAddressLower: string;
  toAddressLower: string | null;
  typeHex: string | null;
  valueHex: string;
  blockNumberText: string | null;
}

export interface EvmReceiptRecord {
  txHash: string;
  statusHex: string | null;
  gasUsedHex: string | null;
  effectiveGasPriceHex: string | null;
  blobGasUsedHex: string | null;
  blobGasPriceHex: string | null;
  blockNumberText: string | null;
}

export interface EvmEnrichedTransaction {
  transaction: EvmTransactionRecord;
  receipt: EvmReceiptRecord;
}

export interface EvmSyncSnapshot {
  balanceObservedAt: string;
  syncCompletedAt: string;
  addressLower: string;
  syncHeadBlockText: string;
  finalizedBlockText: string;
  balanceComplete: boolean;
  balanceIssues: EvmBalanceIssue[];
  balances: EvmBalanceRecord[];
  transfers: EvmTransferRecord[];
  transactions: EvmEnrichedTransaction[];
}

export interface EvmSyncInput {
  address: string;
  historyStartAt: string;
  lastFinalizedBlockText?: string | null;
}

export interface EvmReadOnlyProvider {
  fetchSnapshot(input: EvmSyncInput): Promise<EvmSyncSnapshot>;
}

export interface AlchemyRuntimeConfiguration {
  credentialRef: "env:alchemy.primary";
  configured: boolean;
  apiKey: string | null;
}

export interface SafeAlchemyConfigurationView {
  credentialRef: "env:alchemy.primary";
  configured: boolean;
}
