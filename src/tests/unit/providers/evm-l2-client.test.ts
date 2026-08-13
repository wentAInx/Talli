import { describe, expect, it } from "vitest";

import { AlchemyReadOnlyClient } from "../../../providers/evm/client";
import type {
  AlchemyReadMethod,
  EvmJsonRpcTransport,
} from "../../../providers/evm/types";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TX_HASH = `0x${"b".repeat(64)}`;

function abiWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

class L2Transport implements EvmJsonRpcTransport {
  readonly calls: Array<{
    method: AlchemyReadMethod;
    params: unknown[];
    origin: string;
  }> = [];

  constructor(
    private readonly input: {
      chainId: 8453 | 42161;
      hasActivity?: boolean;
      trace?:
        | "exact"
        | "unavailable"
        | "http_unavailable"
        | "rate_limited"
        | "malformed";
    },
  ) {}

  async request(input: { url: URL; body: string }) {
    const request = JSON.parse(input.body) as {
      id: number;
      method: AlchemyReadMethod;
      params: unknown[];
    };
    this.calls.push({
      method: request.method,
      params: request.params,
      origin: input.url.origin,
    });
    const finalBlock = this.input.chainId === 8453 ? 100n : 22_207_900n;
    let result: unknown;
    switch (request.method) {
      case "eth_chainId":
        result = this.input.chainId === 8453 ? "0x2105" : "0xa4b1";
        break;
      case "eth_blockNumber":
        result = `0x${finalBlock.toString(16)}`;
        break;
      case "eth_getBalance":
        result = "0x1";
        break;
      case "alchemy_getTokenBalances":
        result = { address: WALLET, tokenBalances: [] };
        break;
      case "eth_getBlockByNumber": {
        const selector = request.params[0];
        const block =
          selector === "finalized" ? finalBlock : BigInt(selector as string);
        result = {
          number: `0x${block.toString(16)}`,
          timestamp:
            this.input.chainId === 8453 && block === finalBlock
              ? "0x681e2681"
              : `0x${block.toString(16)}`,
        };
        break;
      }
      case "alchemy_getAssetTransfers": {
        const parameters = request.params[0] as {
          fromAddress?: string;
        };
        result = {
          transfers:
            parameters.fromAddress && this.input.hasActivity !== false
              ? [
                  {
                    uniqueId: "l2:external:0",
                    hash: TX_HASH,
                    category: "external",
                    from: WALLET,
                    to: OTHER,
                    value: 999999999,
                    asset: "ETH",
                    blockNum: `0x${finalBlock.toString(16)}`,
                    metadata: { blockTimestamp: "2025-05-09T16:00:01.000Z" },
                    rawContract: {
                      value: "0x1",
                      address: null,
                      decimal: "0x12",
                    },
                  },
                ]
              : [],
        };
        break;
      }
      case "eth_getTransactionByHash":
        result = {
          hash: TX_HASH,
          from: WALLET,
          to: OTHER,
          type: "0x2",
          value: "0x1",
          blockNumber: `0x${finalBlock.toString(16)}`,
        };
        break;
      case "eth_getTransactionReceipt":
        result = {
          transactionHash: TX_HASH,
          status: "0x1",
          gasUsed: this.input.chainId === 8453 ? "0x186a0" : "0x7a120",
          gasUsedForL1: this.input.chainId === 42161 ? "0x30d40" : null,
          effectiveGasPrice:
            this.input.chainId === 8453 ? "0x3b9aca00" : "0x1312d00",
          blobGasUsed: null,
          blobGasPrice: null,
          blockNumber: `0x${finalBlock.toString(16)}`,
        };
        break;
      case "debug_traceTransaction":
        if (this.input.trace === "http_unavailable") {
          return {
            status: 403,
            headers: new Headers(),
            text: "Debug API is not available on this plan",
          };
        }
        if (this.input.trace === "unavailable") {
          return {
            status: 200,
            headers: new Headers(),
            text: JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32_000,
                message: "Debug APIs are not available on your current plan",
              },
            }),
          };
        }
        if (this.input.trace === "rate_limited") {
          return {
            status: 200,
            headers: new Headers(),
            text: JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32_000, message: "rate limit reached" },
            }),
          };
        }
        result =
          this.input.trace === "malformed"
            ? { type: "UNKNOWN" }
            : {
                type: "CALL",
                from: WALLET,
                to: OTHER,
                value: "0x1",
              };
        break;
      case "eth_getRawTransactionByHash":
        result = "0x02010203";
        break;
      case "eth_call": {
        const call = request.params[0] as { data: string };
        result = call.data.startsWith("0x49948e0e")
          ? abiWord(30_000_000_000_000n)
          : abiWord(5_000_000_000_000n);
        break;
      }
      default:
        throw new Error(`Unexpected method ${request.method}`);
    }
    return {
      status: 200,
      headers: new Headers(),
      text: JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
    };
  }
}

function provider(transport: L2Transport, chainId: 8453 | 42161) {
  return new AlchemyReadOnlyClient(transport, {
    apiKey: "test-key",
    chainId,
  });
}

describe("Alchemy EVM L2 provider", () => {
  it("uses the fixed Base origin, excludes internal discovery, and calculates exact fees", async () => {
    const transport = new L2Transport({ chainId: 8453 });
    const snapshot = await provider(transport, 8453).fetchSnapshot({
      chainId: 8453,
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:00.000Z",
    });
    expect(snapshot).toMatchObject({
      chainId: 8453,
      activityCapability: {
        historyCoverage: "discovery_limited",
        traceCapability: "trace_available",
        activityStatus: "complete",
      },
      transactions: [
        {
          nativeTrace: { status: "exact" },
          l2GasFee: {
            status: "exact",
            totalFeeAtomicText: "135000000000000",
          },
        },
      ],
    });
    expect(
      transport.calls.every(
        (call) => call.origin === "https://base-mainnet.g.alchemy.com",
      ),
    ).toBe(true);
    const transferCalls = transport.calls.filter(
      (call) => call.method === "alchemy_getAssetTransfers",
    );
    expect(transferCalls).toHaveLength(2);
    expect(
      transferCalls.every((call) =>
        (call.params[0] as { category: string[] }).category.every(
          (category) => category !== "internal",
        ),
      ),
    ).toBe(true);
    const historicalCalls = transport.calls.filter(
      (call) => call.method === "eth_call",
    );
    expect(historicalCalls).toHaveLength(2);
    expect(historicalCalls.every((call) => call.params[1] === "0x64")).toBe(
      true,
    );
  });

  it("uses the Nitro floor and exact non-double-counting Arbitrum decomposition", async () => {
    const transport = new L2Transport({ chainId: 42161 });
    const snapshot = await provider(transport, 42161).fetchSnapshot({
      chainId: 42161,
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:00.000Z",
    });
    expect(snapshot.activityCapability.activityStartBlockText).toBe("22207815");
    expect(snapshot.transactions[0]?.l2GasFee).toMatchObject({
      executionFeeAtomicText: "6000000000000",
      parentDataFeeAtomicText: "4000000000000",
      totalFeeAtomicText: "10000000000000",
    });
    expect(
      transport.calls.every(
        (call) => call.origin === "https://arb-mainnet.g.alchemy.com",
      ),
    ).toBe(true);
  });

  it("keeps balances but discards all activity when Debug is unavailable", async () => {
    const transport = new L2Transport({ chainId: 8453, trace: "unavailable" });
    const snapshot = await provider(transport, 8453).fetchSnapshot({
      chainId: 8453,
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:00.000Z",
    });
    expect(snapshot.balances).toHaveLength(1);
    expect(snapshot.transfers).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.activityCapability).toMatchObject({
      traceCapability: "trace_unavailable",
      activityStatus: "trace_unavailable",
    });
  });

  it("keeps a known unavailable capability in balance-only mode when no tx can re-probe it", async () => {
    const transport = new L2Transport({
      chainId: 8453,
      hasActivity: false,
    });
    const snapshot = await provider(transport, 8453).fetchSnapshot({
      chainId: 8453,
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:00.000Z",
      previousTraceCapability: "trace_unavailable",
    });
    expect(snapshot.activityCapability).toMatchObject({
      traceCapability: "trace_unavailable",
      activityStatus: "trace_unavailable",
    });
    expect(snapshot.transfers).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(
      transport.calls.filter(
        (call) => call.method === "debug_traceTransaction",
      ),
    ).toHaveLength(0);
  });

  it("recognizes an explicit HTTP Debug plan response without treating credential errors as capability", async () => {
    const transport = new L2Transport({
      chainId: 8453,
      trace: "http_unavailable",
    });
    const snapshot = await provider(transport, 8453).fetchSnapshot({
      chainId: 8453,
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:00.000Z",
    });
    expect(snapshot.activityCapability.activityStatus).toBe(
      "trace_unavailable",
    );
  });

  it.each([
    ["rate_limited", "RATE_LIMITED"],
    ["malformed", "INVALID_PAYLOAD"],
  ] as const)(
    "does not disguise %s trace failures as capability absence",
    async (trace, code) => {
      const transport = new L2Transport({ chainId: 8453, trace });
      await expect(
        provider(transport, 8453).fetchSnapshot({
          chainId: 8453,
          address: WALLET,
          historyStartAt: "1970-01-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code });
    },
  );
});
