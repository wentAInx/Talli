import type {
  EvmChainId,
  EvmFeeModel,
  EvmHistoryCoverage,
  EvmTraceCapability,
} from "../../domain/evm";

export type AlchemyReadMethod =
  | "eth_chainId"
  | "eth_blockNumber"
  | "eth_getBlockByNumber"
  | "eth_getBalance"
  | "eth_getTransactionByHash"
  | "eth_getTransactionReceipt"
  | "eth_getRawTransactionByHash"
  | "eth_call"
  | "debug_traceTransaction"
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
  gasUsedForL1Hex: string | null;
  blockNumberText: string | null;
}

export type EvmNativeTraceFrameType =
  "CALL" | "CREATE" | "CREATE2" | "SELFDESTRUCT";

export interface EvmNativeTraceFrame {
  path: string;
  type: EvmNativeTraceFrameType;
  fromAddressLower: string;
  toAddressLower: string | null;
  rawAmountAtomicText: string;
  reverted: boolean;
}

export interface EvmNativeTrace {
  status: "exact";
  frames: EvmNativeTraceFrame[];
}

export type EvmL2GasFeeStatus = "exact" | "unresolved";

export interface EvmL2GasFeeBreakdown {
  chainId: 8453 | 42161;
  feeModel: Exclude<EvmFeeModel, "ethereum">;
  status: EvmL2GasFeeStatus;
  executionFeeAtomicText: string | null;
  parentDataFeeAtomicText: string | null;
  operatorFeeAtomicText: string | null;
  totalFeeAtomicText: string | null;
  evidenceJson: string;
}

export interface EvmEnrichedTransaction {
  transaction: EvmTransactionRecord;
  receipt: EvmReceiptRecord;
  nativeTrace: EvmNativeTrace | null;
  l2GasFee: EvmL2GasFeeBreakdown | null;
}

export type EvmActivityStatus = "complete" | "trace_unavailable";

export interface EvmActivityCapability {
  historyCoverage: EvmHistoryCoverage;
  traceCapability: EvmTraceCapability;
  activityStatus: EvmActivityStatus;
  activityStartBlockText: string;
}

export interface EvmSyncSnapshot {
  chainId: EvmChainId;
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
  activityCapability: EvmActivityCapability;
}

export interface EvmSyncInput {
  chainId: EvmChainId;
  address: string;
  historyStartAt: string;
  lastFinalizedBlockText?: string | null;
  previousTraceCapability?: EvmTraceCapability;
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
