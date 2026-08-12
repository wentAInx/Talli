import { assertDomain } from "./errors";

export const EVM_MAINNET_CHAIN_ID = 1 as const;
export const EVM_MAINNET_NETWORK_ID = "eth-mainnet" as const;
export const EVM_ALCHEMY_CREDENTIAL_REF = "env:alchemy.primary" as const;
export const EVM_NATIVE_ASSET_KEY = "eip155:1/native" as const;

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const ERC20_ASSET_KEY_PATTERN = /^eip155:1\/erc20:(0x[0-9a-f]{40})$/;

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

export function evmWalletSourceKey(address: string): string {
  return `eip155:1:${normalizeEvmAddress(address)}`;
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

export function evmErc20AssetKey(contractAddress: string): string {
  return `eip155:1/erc20:${normalizeEvmAddress(contractAddress)}`;
}

export function parseEvmAssetKey(input: string): {
  kind: EvmAssetKind;
  contractAddressLower: string | null;
} {
  if (input === EVM_NATIVE_ASSET_KEY) {
    return { kind: "native", contractAddressLower: null };
  }
  const match = ERC20_ASSET_KEY_PATTERN.exec(input);
  assertDomain(
    match,
    "INVALID_EVM_ASSET_KEY",
    "EVM asset identity must use the Ethereum native or ERC-20 namespace.",
  );
  return { kind: "erc20", contractAddressLower: match[1]! };
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

export function evmMovementStableKey(txHash: string): string {
  return `evm:1:movement:${normalizeEvmTxHash(txHash)}`;
}

export function evmGasStableKey(txHash: string): string {
  return `evm:1:gas:${normalizeEvmTxHash(txHash)}`;
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
