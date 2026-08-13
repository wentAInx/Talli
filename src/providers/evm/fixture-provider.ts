import "server-only";

import {
  evmChainIdentity,
  evmErc20AssetKey,
  evmNativeAssetKey,
  normalizeEvmAddress,
} from "../../domain/evm";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "../../services/runtime";
import type {
  EvmReadOnlyProvider,
  EvmSyncInput,
  EvmSyncSnapshot,
} from "./types";

const FIXTURE_OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const FIXTURE_USDC_CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const FIXTURE_UNKNOWN_CONTRACT = "0x8888888888888888888888888888888888888888";
const FIXTURE_TX_HASH = `0x${"a".repeat(64)}`;
export const EVM_TRACE_UNAVAILABLE_FIXTURE_ADDRESS =
  "0x9999999999999999999999999999999999999999";

export function isEvmFixtureMode(): boolean {
  return (
    process.env.TALLI_E2E_EVM_FIXTURE === "1" &&
    (process.env.CI === "true" || process.env.NODE_ENV === "development")
  );
}

export class DeterministicEvmFixtureProvider implements EvmReadOnlyProvider {
  constructor(
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async fetchSnapshot(input: EvmSyncInput): Promise<EvmSyncSnapshot> {
    const address = normalizeEvmAddress(input.address);
    const chain = evmChainIdentity(input.chainId);
    const nativeAssetKey = evmNativeAssetKey(input.chainId);
    const usdcAssetKey = evmErc20AssetKey(input.chainId, FIXTURE_USDC_CONTRACT);
    const unknownAssetKey = evmErc20AssetKey(
      input.chainId,
      FIXTURE_UNKNOWN_CONTRACT,
    );
    const isL2 = input.chainId !== 1;
    const traceUnavailable =
      isL2 && address === EVM_TRACE_UNAVAILABLE_FIXTURE_ADDRESS;
    const syncHeadBlockText = input.chainId === 42161 ? "22208020" : "21000020";
    const finalizedBlockText =
      input.chainId === 42161 ? "22208018" : "21000018";
    const transactionBlockText =
      input.chainId === 42161 ? "22208017" : "21000017";
    const balanceObservedAt = runtimeNow(this.runtime);
    return {
      chainId: input.chainId,
      balanceObservedAt,
      syncCompletedAt: runtimeNow(this.runtime),
      addressLower: address,
      syncHeadBlockText,
      finalizedBlockText,
      balanceComplete: true,
      balanceIssues: [],
      balances: [
        {
          providerAssetKey: nativeAssetKey,
          assetKind: "native",
          contractAddressLower: null,
          rawAmountAtomicText: "1490000000000000000",
          decimals: 18,
          amountText: "1.49",
          displayCode: "ETH",
          name: chain.displayName,
        },
        {
          providerAssetKey: usdcAssetKey,
          assetKind: "erc20",
          contractAddressLower: FIXTURE_USDC_CONTRACT,
          rawAmountAtomicText: "100000000",
          decimals: 6,
          amountText: "100",
          displayCode: "USDC",
          name: "USD Coin",
        },
        {
          providerAssetKey: unknownAssetKey,
          assetKind: "erc20",
          contractAddressLower: FIXTURE_UNKNOWN_CONTRACT,
          rawAmountAtomicText: "123456789",
          decimals: null,
          amountText: null,
          displayCode: "UNKNOWN",
          name: "Unknown decimals token",
        },
      ],
      transfers: traceUnavailable
        ? []
        : [
            {
              uniqueId: `${FIXTURE_TX_HASH}:external:0`,
              txHash: FIXTURE_TX_HASH,
              category: "external",
              fromAddressLower: address,
              toAddressLower: FIXTURE_OTHER_ADDRESS,
              providerAssetKey: nativeAssetKey,
              contractAddressLower: null,
              rawAmountAtomicText: "10000000000000000",
              decimals: 18,
              amountText: "0.01",
              displayCode: "ETH",
              blockNumberText: transactionBlockText,
              occurredAt: "2026-08-12T11:55:00.000Z",
              humanValue: 0.01,
            },
            {
              uniqueId: `${FIXTURE_TX_HASH}:erc20:1`,
              txHash: FIXTURE_TX_HASH,
              category: "erc20",
              fromAddressLower: FIXTURE_OTHER_ADDRESS,
              toAddressLower: address,
              providerAssetKey: usdcAssetKey,
              contractAddressLower: FIXTURE_USDC_CONTRACT,
              rawAmountAtomicText: "100000000",
              decimals: 6,
              amountText: "100",
              displayCode: "USDC",
              blockNumberText: transactionBlockText,
              occurredAt: "2026-08-12T11:55:00.000Z",
              humanValue: 100,
            },
          ],
      transactions: traceUnavailable
        ? []
        : [
            {
              transaction: {
                txHash: FIXTURE_TX_HASH,
                fromAddressLower: address,
                toAddressLower: FIXTURE_OTHER_ADDRESS,
                typeHex: "0x2",
                valueHex: "0x2386f26fc10000",
                blockNumberText: transactionBlockText,
              },
              receipt: {
                txHash: FIXTURE_TX_HASH,
                statusHex: "0x1",
                gasUsedHex: "0x5208",
                effectiveGasPriceHex: "0x3b9aca00",
                blobGasUsedHex: null,
                blobGasPriceHex: null,
                gasUsedForL1Hex: input.chainId === 42161 ? "0x1f40" : null,
                blockNumberText: transactionBlockText,
              },
              nativeTrace: isL2
                ? {
                    status: "exact",
                    frames: [
                      {
                        path: "0",
                        type: "CALL",
                        fromAddressLower: address,
                        toAddressLower: FIXTURE_OTHER_ADDRESS,
                        rawAmountAtomicText: "10000000000000000",
                        reverted: false,
                      },
                    ],
                  }
                : null,
              l2GasFee:
                input.chainId === 8453
                  ? {
                      chainId: 8453,
                      feeModel: "base_op_stack",
                      status: "exact",
                      executionFeeAtomicText: "21000000000000",
                      parentDataFeeAtomicText: "3000000000000",
                      operatorFeeAtomicText: "1000000000000",
                      totalFeeAtomicText: "25000000000000",
                      evidenceJson: '{"source":"fixture"}',
                    }
                  : input.chainId === 42161
                    ? {
                        chainId: 42161,
                        feeModel: "arbitrum_nitro",
                        status: "exact",
                        executionFeeAtomicText: "13000000000000",
                        parentDataFeeAtomicText: "8000000000000",
                        operatorFeeAtomicText: null,
                        totalFeeAtomicText: "21000000000000",
                        evidenceJson: '{"source":"fixture"}',
                      }
                    : null,
            },
          ],
      activityCapability: {
        traceCapability: traceUnavailable
          ? "trace_unavailable"
          : isL2
            ? "trace_available"
            : "unknown",
        historyCoverage: chain.historyCoverage,
        activityStatus: traceUnavailable ? "trace_unavailable" : "complete",
        activityStartBlockText: input.chainId === 42161 ? "22207815" : "0",
      },
    };
  }
}
