import "server-only";

import {
  EVM_NATIVE_ASSET_KEY,
  evmErc20AssetKey,
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
const FIXTURE_TX_HASH = `0x${"a".repeat(64)}`;

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
    return {
      fetchedAt: runtimeNow(this.runtime),
      addressLower: address,
      syncHeadBlockText: "21000020",
      finalizedBlockText: "21000018",
      balances: [
        {
          providerAssetKey: EVM_NATIVE_ASSET_KEY,
          assetKind: "native",
          contractAddressLower: null,
          rawAmountAtomicText: "1490000000000000000",
          decimals: 18,
          amountText: "1.49",
          displayCode: "ETH",
          name: "Ether",
        },
        {
          providerAssetKey: evmErc20AssetKey(FIXTURE_USDC_CONTRACT),
          assetKind: "erc20",
          contractAddressLower: FIXTURE_USDC_CONTRACT,
          rawAmountAtomicText: "100000000",
          decimals: 6,
          amountText: "100",
          displayCode: "USDC",
          name: "USD Coin",
        },
      ],
      transfers: [
        {
          uniqueId: `${FIXTURE_TX_HASH}:external:0`,
          txHash: FIXTURE_TX_HASH,
          category: "external",
          fromAddressLower: address,
          toAddressLower: FIXTURE_OTHER_ADDRESS,
          providerAssetKey: EVM_NATIVE_ASSET_KEY,
          contractAddressLower: null,
          rawAmountAtomicText: "10000000000000000",
          decimals: 18,
          amountText: "0.01",
          displayCode: "ETH",
          blockNumberText: "21000017",
          occurredAt: "2026-08-12T11:55:00.000Z",
          humanValue: 0.01,
        },
        {
          uniqueId: `${FIXTURE_TX_HASH}:erc20:1`,
          txHash: FIXTURE_TX_HASH,
          category: "erc20",
          fromAddressLower: FIXTURE_OTHER_ADDRESS,
          toAddressLower: address,
          providerAssetKey: evmErc20AssetKey(FIXTURE_USDC_CONTRACT),
          contractAddressLower: FIXTURE_USDC_CONTRACT,
          rawAmountAtomicText: "100000000",
          decimals: 6,
          amountText: "100",
          displayCode: "USDC",
          blockNumberText: "21000017",
          occurredAt: "2026-08-12T11:55:00.000Z",
          humanValue: 100,
        },
      ],
      transactions: [
        {
          transaction: {
            txHash: FIXTURE_TX_HASH,
            fromAddressLower: address,
            toAddressLower: FIXTURE_OTHER_ADDRESS,
            typeHex: "0x2",
            valueHex: "0x2386f26fc10000",
            blockNumberText: "21000017",
          },
          receipt: {
            txHash: FIXTURE_TX_HASH,
            statusHex: "0x1",
            gasUsedHex: "0x5208",
            effectiveGasPriceHex: "0x3b9aca00",
            blobGasUsedHex: null,
            blobGasPriceHex: null,
            blockNumberText: "21000017",
          },
        },
      ],
    };
  }
}
