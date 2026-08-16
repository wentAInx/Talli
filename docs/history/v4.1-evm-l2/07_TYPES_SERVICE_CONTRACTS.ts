// HISTORICAL DESIGN CONTRACT ONLY. NOT CURRENT SOURCE OR API.
// Current source and migrations take precedence.

export type EvmChainId = 1 | 8453 | 42161;

export type EvmNetworkId =
  | "eth-mainnet"
  | "base-mainnet"
  | "arb-mainnet";

export type EvmFeeModel =
  | "ethereum"
  | "base_op_stack"
  | "arbitrum_nitro";

export type EvmHistoryCoverage =
  | "complete"
  | "discovery_limited";

export type EvmTraceCapability =
  | "unknown"
  | "trace_available"
  | "trace_unavailable";

export interface EvmChainConfig {
  chainId: EvmChainId;
  chainIdHex: "0x1" | "0x2105" | "0xa4b1";
  networkId: EvmNetworkId;
  displayName: string;
  alchemyOrigin:
    | "https://eth-mainnet.g.alchemy.com"
    | "https://base-mainnet.g.alchemy.com"
    | "https://arb-mainnet.g.alchemy.com";
  nativeSymbol: "ETH";
  nativeDecimals: 18;
  feeModel: EvmFeeModel;
  historyCoverage: EvmHistoryCoverage;
  requiresDebugForMovement: boolean;
}

export interface EvmWalletIdentity {
  chainId: EvmChainId;
  addressLower: string;
  sourceKey: string; // eip155:<chain>:<address>
}

export interface EvmCallTraceFrame {
  path: string; // e.g. "0", "0.1", deterministic local trace path
  type: "CALL" | "CREATE" | "CREATE2" | "SELFDESTRUCT";
  fromAddressLower: string;
  toAddressLower: string | null;
  valueAtomicText: string;
  reverted: boolean;
}

export interface EvmTraceProjection {
  status: "exact";
  frames: EvmCallTraceFrame[];
}

export interface EvmBalanceIssue {
  code: "TOKEN_BALANCE_UNAVAILABLE";
  providerAssetKey: string | null;
  message: string;
}

export interface EvmActivityCapability {
  traceCapability: EvmTraceCapability;
  historyCoverage: EvmHistoryCoverage;
  activityStatus:
    | "complete"
    | "trace_unavailable"
    | "unsupported_history";
}

export interface L2GasFeeBreakdown {
  chainId: 8453 | 42161;
  feeModel: "base_op_stack" | "arbitrum_nitro";
  status: "exact" | "unresolved";
  executionFeeAtomicText: string | null;
  parentDataFeeAtomicText: string | null;
  operatorFeeAtomicText: string | null;
  totalFeeAtomicText: string | null;
  evidenceJson: string;
}

export interface EvmReceiptRecord {
  txHash: string;
  statusHex: string | null;
  gasUsedHex: string | null;
  effectiveGasPriceHex: string | null;
  blobGasUsedHex: string | null;
  blobGasPriceHex: string | null;
  gasUsedForL1Hex: string | null; // Arbitrum extension
  blockNumberText: string | null;
}

export interface EvmEnrichedTransaction {
  transaction: {
    txHash: string;
    fromAddressLower: string;
    toAddressLower: string | null;
    typeHex: string | null;
    valueHex: string;
    blockNumberText: string | null;
  };
  receipt: EvmReceiptRecord;
  nativeTrace: EvmTraceProjection | null;
  l2GasFee: L2GasFeeBreakdown | null;
}

export interface EvmSyncSnapshotV41 {
  chainId: EvmChainId;
  balanceObservedAt: string;
  syncCompletedAt: string;
  addressLower: string;
  syncHeadBlockText: string;
  finalizedBlockText: string | null;
  balanceComplete: boolean;
  balanceIssues: EvmBalanceIssue[];
  activityCapability: EvmActivityCapability;
  balances: unknown[];     // reuse existing V4 EvmBalanceRecord
  transfers: unknown[];    // reuse existing V4 EvmTransferRecord
  transactions: EvmEnrichedTransaction[];
}

/*
Required helper semantics:

evmWalletSourceKey(chainId,address)
  -> eip155:<chainId>:<address>

evmNativeAssetKey(chainId)
  -> eip155:<chainId>/native

evmErc20AssetKey(chainId,contract)
  -> eip155:<chainId>/erc20:<contract>

evmMovementStableKey(chainId,txHash)
evmGasStableKey(chainId,txHash)

No chain-1 implicit defaults in business paths.
*/

export interface EvmChainFeeAdapter {
  calculate(input: {
    chain: EvmChainConfig;
    transaction: EvmEnrichedTransaction["transaction"];
    receipt: EvmReceiptRecord;
  }): Promise<L2GasFeeBreakdown | null>;
}

/*
For Base, the fee adapter may perform fixed server-side eth_call to
GasPriceOracle and eth_getRawTransactionByHash.

For Arbitrum, fee decomposition is pure from receipt fields.

No adapter may broadcast or sign.
*/
