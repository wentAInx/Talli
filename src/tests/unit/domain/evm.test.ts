import { describe, expect, it } from "vitest";

import {
  calculateEthereumGasFee,
  evmChainIdentity,
  evmErc20AssetKey,
  evmGasStableKey,
  evmMovementStableKey,
  evmNativeAssetKey,
  evmRawAtomicToDecimalText,
  evmWalletSourceKey,
  normalizeEvmAddress,
  parseEvmAssetKey,
  parseEvmHexQuantity,
} from "../../../domain/evm";
import { DomainValidationError } from "../../../domain/errors";

const WALLET = "0x1111111111111111111111111111111111111111";

describe("EVM domain primitives", () => {
  it("canonicalizes public addresses and rejects non-address input", () => {
    expect(
      normalizeEvmAddress("0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48"),
    ).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(evmWalletSourceKey(1, WALLET)).toBe(`eip155:1:${WALLET}`);
    expect(evmWalletSourceKey(8453, WALLET)).toBe(`eip155:8453:${WALLET}`);
    expect(evmWalletSourceKey(42161, WALLET)).toBe(`eip155:42161:${WALLET}`);
    for (const invalid of ["", "0x1234", "seed phrase words", "0xzzzz"]) {
      expect(() => normalizeEvmAddress(invalid)).toThrow(DomainValidationError);
    }
  });

  it("uses chain plus contract identity and never symbol identity", () => {
    const first = evmErc20AssetKey(
      8453,
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
    const second = evmErc20AssetKey(
      42161,
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
    const third = evmErc20AssetKey(
      8453,
      "0x9999999999999999999999999999999999999999",
    );
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
    expect(parseEvmAssetKey(evmNativeAssetKey(1))).toEqual({
      chainId: 1,
      kind: "native",
      contractAddressLower: null,
    });
    expect(parseEvmAssetKey(first)).toEqual({
      chainId: 8453,
      kind: "erc20",
      contractAddressLower: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    });
  });

  it("registers the exact production chain identities and capabilities", () => {
    expect(
      ([1, 8453, 42161] as const).map((chainId) => evmChainIdentity(chainId)),
    ).toEqual([
      expect.objectContaining({
        chainId: 1,
        chainIdHex: "0x1",
        networkId: "eth-mainnet",
        feeModel: "ethereum",
        historyCoverage: "complete",
        requiresDebugForMovement: false,
      }),
      expect.objectContaining({
        chainId: 8453,
        chainIdHex: "0x2105",
        networkId: "base-mainnet",
        feeModel: "base_op_stack",
        historyCoverage: "discovery_limited",
        requiresDebugForMovement: true,
      }),
      expect.objectContaining({
        chainId: 42161,
        chainIdHex: "0xa4b1",
        networkId: "arb-mainnet",
        feeModel: "arbitrum_nitro",
        historyCoverage: "discovery_limited",
        requiresDebugForMovement: true,
      }),
    ]);
  });

  it("keeps raw hex quantities exact through bigint and decimal text", () => {
    const raw = parseEvmHexQuantity(
      "0xffffffffffffffffffffffffffffffff",
      "fixture amount",
    );
    expect(raw).toBe(340282366920938463463374607431768211455n);
    expect(evmRawAtomicToDecimalText(100_000_000n, 6)).toBe("100");
    expect(evmRawAtomicToDecimalText(40_000_000_000_000_000n, 18)).toBe("0.04");
  });

  it("creates separate stable keys for movement and gas", () => {
    const txHash = `0x${"a".repeat(64)}`;
    expect(evmMovementStableKey(8453, txHash)).toBe(
      `evm:8453:movement:${txHash}`,
    );
    expect(evmGasStableKey(42161, txHash)).toBe(`evm:42161:gas:${txHash}`);
  });

  it("calculates execution and blob fees with bigint only", () => {
    expect(
      calculateEthereumGasFee({
        walletAddress: WALLET,
        transactionFrom: WALLET,
        transactionType: "0x2",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x3b9aca00",
        blobGasUsed: null,
        blobGasPrice: null,
      }),
    ).toEqual({ status: "exact", amountAtomic: 21_000_000_000_000n });
    expect(
      calculateEthereumGasFee({
        walletAddress: WALLET,
        transactionFrom: WALLET,
        transactionType: "0x3",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x3b9aca00",
        blobGasUsed: "0x2",
        blobGasPrice: "0x3",
      }),
    ).toEqual({ status: "exact", amountAtomic: 21_000_000_000_006n });
    expect(
      calculateEthereumGasFee({
        walletAddress: WALLET,
        transactionFrom: WALLET,
        transactionType: "0x3",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x3b9aca00",
        blobGasUsed: null,
        blobGasPrice: null,
      }),
    ).toEqual({ status: "unresolved", amountAtomic: null });
    expect(
      calculateEthereumGasFee({
        walletAddress: WALLET,
        transactionFrom: "0x2222222222222222222222222222222222222222",
        transactionType: "0x2",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x3b9aca00",
        blobGasUsed: null,
        blobGasPrice: null,
      }),
    ).toEqual({ status: "not_applicable", amountAtomic: null });
  });
});
