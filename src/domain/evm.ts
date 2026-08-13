import { assertDomain } from "./errors";

export const EVM_ALCHEMY_CREDENTIAL_REF = "env:alchemy.primary" as const;

export type EvmChainId = 1 | 8453 | 42161;
export type EvmNetworkId = "eth-mainnet" | "base-mainnet" | "arb-mainnet";
export type EvmFeeModel = "ethereum" | "base_op_stack" | "arbitrum_nitro";
export type EvmHistoryCoverage = "complete" | "discovery_limited";
export type EvmTraceCapability =
  "unknown" | "trace_available" | "trace_unavailable";

export interface EvmChainIdentity {
  chainId: EvmChainId;
  chainIdHex: "0x1" | "0x2105" | "0xa4b1";
  networkId: EvmNetworkId;
  displayName: "Ethereum Mainnet" | "Base" | "Arbitrum One";
  nativeSymbol: "ETH";
  nativeDecimals: 18;
  feeModel: EvmFeeModel;
  historyCoverage: EvmHistoryCoverage;
  requiresDebugForMovement: boolean;
}

const EVM_CHAIN_IDENTITIES: Record<EvmChainId, EvmChainIdentity> = {
  1: {
    chainId: 1,
    chainIdHex: "0x1",
    networkId: "eth-mainnet",
    displayName: "Ethereum Mainnet",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    feeModel: "ethereum",
    historyCoverage: "complete",
    requiresDebugForMovement: false,
  },
  8453: {
    chainId: 8453,
    chainIdHex: "0x2105",
    networkId: "base-mainnet",
    displayName: "Base",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    feeModel: "base_op_stack",
    historyCoverage: "discovery_limited",
    requiresDebugForMovement: true,
  },
  42161: {
    chainId: 42161,
    chainIdHex: "0xa4b1",
    networkId: "arb-mainnet",
    displayName: "Arbitrum One",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    feeModel: "arbitrum_nitro",
    historyCoverage: "discovery_limited",
    requiresDebugForMovement: true,
  },
};

export const EVM_MAINNET_CHAIN_ID = 1 as const;
export const EVM_MAINNET_NETWORK_ID = "eth-mainnet" as const;

export function isEvmChainId(value: number): value is EvmChainId {
  return value === 1 || value === 8453 || value === 42161;
}

export function evmChainIdentity(chainId: EvmChainId): EvmChainIdentity {
  return EVM_CHAIN_IDENTITIES[chainId];
}

export function assertEvmChainNetwork(
  chainId: EvmChainId,
  networkId: string,
): EvmNetworkId {
  const chain = evmChainIdentity(chainId);
  assertDomain(
    networkId === chain.networkId,
    "INVALID_EVM_CHAIN_NETWORK",
    "EVM chain and network identity are inconsistent.",
  );
  return chain.networkId;
}

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const EVM_ASSET_KEY_PATTERN =
  /^eip155:(1|8453|42161)\/(native|erc20:(0x[0-9a-f]{40}))$/;

export type EvmAssetKind = "native" | "erc20";
export type EvmTransactionStatus = "success" | "failed" | "unknown";
export type EvmGasFeeStatus = "exact" | "not_applicable" | "unresolved";

export interface EvmGasFeeResult {
  status: EvmGasFeeStatus;
  amountAtomic: bigint | null;
}

export function normalizeEvmAddress(input: string): string {
  const address = input.trim();
  assertDomain(
    EVM_ADDRESS_PATTERN.test(address),
    "INVALID_EVM_ADDRESS",
    "Ethereum address must be a public 20-byte hex address.",
  );
  return address.toLowerCase();
}

export function evmWalletSourceKey(
  chainId: EvmChainId,
  address: string,
): string {
  return `eip155:${chainId}:${normalizeEvmAddress(address)}`;
}

export function normalizeEvmTxHash(input: string): string {
  const txHash = input.trim();
  assertDomain(
    EVM_TX_HASH_PATTERN.test(txHash),
    "INVALID_EVM_TX_HASH",
    "Ethereum transaction hash must be 32-byte hex.",
  );
  return txHash.toLowerCase();
}

export function normalizeEvmUniqueId(input: string): string {
  const uniqueId = input.trim();
  assertDomain(
    uniqueId.length > 0 && uniqueId.length <= 512,
    "INVALID_EVM_UNIQUE_ID",
    "Alchemy transfer uniqueId is invalid.",
  );
  return uniqueId;
}

export function evmNativeAssetKey(chainId: EvmChainId): string {
  return `eip155:${chainId}/native`;
}

export function evmErc20AssetKey(
  chainId: EvmChainId,
  contractAddress: string,
): string {
  return `eip155:${chainId}/erc20:${normalizeEvmAddress(contractAddress)}`;
}

export function parseEvmAssetKey(input: string): {
  chainId: EvmChainId;
  kind: EvmAssetKind;
  contractAddressLower: string | null;
} {
  const match = EVM_ASSET_KEY_PATTERN.exec(input);
  assertDomain(
    match,
    "INVALID_EVM_ASSET_KEY",
    "EVM asset identity must include a supported chain and native or ERC-20 namespace.",
  );
  const chainId = Number(match[1]);
  assertDomain(
    isEvmChainId(chainId),
    "INVALID_EVM_CHAIN",
    "EVM chain is unsupported.",
  );
  return match[2] === "native"
    ? { chainId, kind: "native", contractAddressLower: null }
    : { chainId, kind: "erc20", contractAddressLower: match[3]! };
}

export function parseEvmHexQuantity(input: string, label: string): bigint {
  assertDomain(
    HEX_QUANTITY_PATTERN.test(input),
    "INVALID_EVM_HEX_QUANTITY",
    `${label} must be a non-empty hex quantity.`,
  );
  return BigInt(input);
}

export function evmQuantityHex(input: bigint): string {
  assertDomain(
    input >= 0n,
    "INVALID_EVM_QUANTITY",
    "Ethereum quantity cannot be negative.",
  );
  return `0x${input.toString(16)}`;
}

export function evmDecimalsFromHex(input: string): number {
  const decimals = parseEvmHexQuantity(input, "Token decimals");
  assertDomain(
    decimals <= 255n,
    "INVALID_EVM_DECIMALS",
    "Token decimals must be between 0 and 255.",
  );
  return Number(decimals);
}

export function evmRawAtomicToDecimalText(
  amountAtomic: bigint,
  decimals: number,
): string {
  assertDomain(
    Number.isInteger(decimals) && decimals >= 0 && decimals <= 255,
    "INVALID_EVM_DECIMALS",
    "Token decimals must be between 0 and 255.",
  );
  assertDomain(
    amountAtomic >= 0n,
    "INVALID_EVM_ATOMIC_AMOUNT",
    "Raw on-chain amount cannot be negative.",
  );
  const digits = amountAtomic.toString();
  if (decimals === 0) return digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function evmMovementStableKey(
  chainId: EvmChainId,
  txHash: string,
): string {
  return `evm:${chainId}:movement:${normalizeEvmTxHash(txHash)}`;
}

export function evmGasStableKey(chainId: EvmChainId, txHash: string): string {
  return `evm:${chainId}:gas:${normalizeEvmTxHash(txHash)}`;
}

export function evmTransactionStatus(
  input: string | null,
): EvmTransactionStatus {
  if (input === "0x1") return "success";
  if (input === "0x0") return "failed";
  return "unknown";
}

export function calculateEthereumGasFee(input: {
  walletAddress: string;
  transactionFrom: string;
  transactionType: string | null;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  blobGasUsed: string | null;
  blobGasPrice: string | null;
}): EvmGasFeeResult {
  if (
    normalizeEvmAddress(input.walletAddress) !==
    normalizeEvmAddress(input.transactionFrom)
  ) {
    return { status: "not_applicable", amountAtomic: null };
  }
  if (!input.gasUsed || !input.effectiveGasPrice) {
    return { status: "unresolved", amountAtomic: null };
  }
  let amountAtomic =
    parseEvmHexQuantity(input.gasUsed, "gasUsed") *
    parseEvmHexQuantity(input.effectiveGasPrice, "effectiveGasPrice");
  const isBlobTransaction =
    input.transactionType !== null &&
    parseEvmHexQuantity(input.transactionType, "transaction type") === 3n;
  if (isBlobTransaction && (!input.blobGasUsed || !input.blobGasPrice)) {
    return { status: "unresolved", amountAtomic: null };
  }
  if (input.blobGasUsed && input.blobGasPrice) {
    amountAtomic +=
      parseEvmHexQuantity(input.blobGasUsed, "blobGasUsed") *
      parseEvmHexQuantity(input.blobGasPrice, "blobGasPrice");
  }
  return { status: "exact", amountAtomic };
}
