import { describe, expect, it } from "vitest";

import { AlchemyReadOnlyClient } from "../../../providers/evm/client";
import { safeEvmFailure } from "../../../providers/evm/errors";
import type {
  AlchemyReadMethod,
  EvmJsonRpcTransport,
} from "../../../providers/evm/types";

const WALLET = "0x1111111111111111111111111111111111111111";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const BAD_TOKEN = "0x7777777777777777777777777777777777777777";
const FAKE_USDC = "0x9999999999999999999999999999999999999999";
const TX_A = `0x${"a".repeat(64)}`;
const TX_B = `0x${"b".repeat(64)}`;

interface RpcCall {
  method: AlchemyReadMethod;
  params: unknown[];
  path: string;
}

function success(id: number, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

class ScriptedAlchemyTransport implements EvmJsonRpcTransport {
  readonly calls: RpcCall[] = [];

  constructor(
    private readonly options: {
      chainId?: string;
      expireTransferPagination?: boolean;
      tokenBalanceError?: boolean;
      contractDeployment?: boolean;
      unknownTokenDecimals?: boolean;
      invalidTransferTo?: boolean;
    } = {},
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
      path: input.url.pathname,
    });
    let result: unknown;
    switch (request.method) {
      case "eth_chainId":
        result = this.options.chainId ?? "0x1";
        break;
      case "eth_blockNumber":
        result = "0x70";
        break;
      case "eth_getBalance":
        result = "0x112210f4768db400";
        break;
      case "alchemy_getTokenBalances": {
        const options = request.params[2] as { pageKey?: string };
        result = options.pageKey
          ? {
              address: WALLET,
              tokenBalances: [
                {
                  contractAddress: FAKE_USDC,
                  tokenBalance: "0x1",
                  error: null,
                },
              ],
            }
          : {
              address: WALLET,
              tokenBalances: [
                {
                  contractAddress: USDC,
                  tokenBalance: "0x3b9aca00",
                  error: null,
                },
                {
                  contractAddress: "0x8888888888888888888888888888888888888888",
                  tokenBalance: "0x0",
                  error: null,
                },
                ...(this.options.tokenBalanceError
                  ? [
                      {
                        contractAddress: BAD_TOKEN,
                        tokenBalance: null,
                        error: "upstream token read failed",
                      },
                    ]
                  : []),
              ],
              pageKey: "token-page-2",
            };
        break;
      }
      case "alchemy_getTokenMetadata":
        result = {
          decimals:
            this.options.unknownTokenDecimals && request.params[0] === FAKE_USDC
              ? null
              : 6,
          name: request.params[0] === USDC ? "USD Coin" : "Fake USD Coin",
          symbol: "USDC",
        };
        break;
      case "eth_getBlockByNumber": {
        const selector = request.params[0];
        const block =
          selector === "finalized" ? 100n : BigInt(selector as string);
        result = {
          number: `0x${block.toString(16)}`,
          timestamp: `0x${block.toString(16)}`,
        };
        break;
      }
      case "alchemy_getAssetTransfers": {
        const parameters = request.params[0] as {
          fromAddress?: string;
          toAddress?: string;
          pageKey?: string;
        };
        if (this.options.expireTransferPagination && parameters.pageKey) {
          return {
            status: 200,
            headers: new Headers(),
            text: JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32_000, message: "page key expired" },
            }),
          };
        }
        if (parameters.pageKey) {
          result = { transfers: [] };
        } else if (parameters.fromAddress) {
          result = {
            pageKey: "from-page-2",
            transfers: [
              {
                uniqueId: "tx:erc20:0",
                hash: TX_A,
                category: "erc20",
                from: WALLET,
                to: this.options.invalidTransferTo
                  ? 42
                  : "0x3333333333333333333333333333333333333333",
                value: 999999999,
                asset: "USDC",
                blockNum: "0x64",
                metadata: { blockTimestamp: "1970-01-01T00:01:40.000Z" },
                rawContract: {
                  value: "0x5f5e100",
                  address: USDC,
                  decimal: "0x6",
                },
              },
              this.options.contractDeployment
                ? {
                    uniqueId: "tx:deployment:0",
                    hash: TX_B,
                    category: "external",
                    from: WALLET,
                    to: null,
                    value: 0,
                    asset: "ETH",
                    blockNum: "0x63",
                    metadata: {
                      blockTimestamp: "1970-01-01T00:01:39.000Z",
                    },
                    rawContract: {
                      value: "0x0",
                      address: null,
                      decimal: "0x12",
                    },
                  }
                : {
                    uniqueId: "tx:self:0",
                    hash: TX_B,
                    category: "external",
                    from: WALLET,
                    to: WALLET,
                    value: 1,
                    asset: "ETH",
                    blockNum: "0x63",
                    metadata: {
                      blockTimestamp: "1970-01-01T00:01:39.000Z",
                    },
                    rawContract: {
                      value: "0xde0b6b3a7640000",
                      address: null,
                      decimal: "0x12",
                    },
                  },
            ],
          };
        } else {
          result = this.options.contractDeployment
            ? { pageKey: "to-page-2", transfers: [] }
            : {
                pageKey: "to-page-2",
                transfers: [
                  {
                    uniqueId: "tx:internal:0",
                    hash: TX_A,
                    category: "internal",
                    from: "0x3333333333333333333333333333333333333333",
                    to: WALLET,
                    value: 0.04,
                    asset: "ETH",
                    blockNum: "0x64",
                    metadata: {
                      blockTimestamp: "1970-01-01T00:01:40.000Z",
                    },
                    rawContract: {
                      value: "0x8e1bc9bf040000",
                      address: null,
                      decimal: "0x12",
                    },
                  },
                  {
                    uniqueId: "tx:self:0",
                    hash: TX_B,
                    category: "external",
                    from: WALLET,
                    to: WALLET,
                    value: 1,
                    asset: "ETH",
                    blockNum: "0x63",
                    metadata: {
                      blockTimestamp: "1970-01-01T00:01:39.000Z",
                    },
                    rawContract: {
                      value: "0xde0b6b3a7640000",
                      address: null,
                      decimal: "0x12",
                    },
                  },
                ],
              };
        }
        break;
      }
      case "eth_getTransactionByHash": {
        const txHash = request.params[0] as string;
        result = {
          hash: txHash,
          from: WALLET,
          to:
            txHash === TX_A
              ? "0x3333333333333333333333333333333333333333"
              : this.options.contractDeployment
                ? null
                : WALLET,
          type: "0x2",
          value: "0x0",
          blockNumber: txHash === TX_A ? "0x64" : "0x63",
        };
        break;
      }
      case "eth_getTransactionReceipt": {
        const txHash = request.params[0] as string;
        result = {
          transactionHash: txHash,
          status: "0x1",
          gasUsed: "0x5208",
          effectiveGasPrice: "0x3b9aca00",
          blobGasUsed: null,
          blobGasPrice: null,
          blockNumber: txHash === TX_A ? "0x64" : "0x63",
        };
        break;
      }
      default:
        throw new Error(`Unexpected method ${String(request.method)}`);
    }
    return {
      status: 200,
      headers: new Headers(),
      text: success(request.id, result),
    };
  }
}

function provider(
  transport: EvmJsonRpcTransport,
  times = ["2026-08-12T13:00:00.000Z"],
) {
  let timeIndex = 0;
  return new AlchemyReadOnlyClient(
    transport,
    { apiKey: "alchemy-test-key" },
    {
      id: () => "unused",
      now: () => times[Math.min(timeIndex++, times.length - 1)]!,
    },
  );
}

describe("Alchemy read-only provider", () => {
  it("paginates balances/activity, dedupes transfers, and uses raw values", async () => {
    const transport = new ScriptedAlchemyTransport();
    const snapshot = await provider(transport).fetchSnapshot({
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:50.000Z",
    });

    expect(snapshot.syncHeadBlockText).toBe("112");
    expect(snapshot.finalizedBlockText).toBe("100");
    expect(snapshot.balances).toMatchObject([
      { providerAssetKey: "eip155:1/native", decimals: 18 },
      {
        providerAssetKey: `eip155:1/erc20:${USDC}`,
        amountText: "1000",
        displayCode: "USDC",
      },
      {
        providerAssetKey: `eip155:1/erc20:${FAKE_USDC}`,
        amountText: "0.000001",
        displayCode: "USDC",
      },
    ]);
    expect(snapshot.transfers).toHaveLength(3);
    expect(
      snapshot.transfers.find((transfer) => transfer.uniqueId === "tx:erc20:0"),
    ).toMatchObject({
      rawAmountAtomicText: "100000000",
      amountText: "100",
      humanValue: 999999999,
    });
    expect(snapshot.transactions).toHaveLength(2);
    expect(snapshot.balanceComplete).toBe(true);
    expect(snapshot.balanceIssues).toEqual([]);
    expect(
      transport.calls.filter(
        (call) => call.method === "alchemy_getTokenBalances",
      ),
    ).toHaveLength(2);
    expect(
      transport.calls.filter(
        (call) => call.method === "alchemy_getAssetTransfers",
      ),
    ).toHaveLength(4);
    expect(
      transport.calls.every((call) => call.path === "/v2/alchemy-test-key"),
    ).toBe(true);
  });

  it("keeps contract deployment null-to data without fabricating a movement amount", async () => {
    const snapshot = await provider(
      new ScriptedAlchemyTransport({ contractDeployment: true }),
    ).fetchSnapshot({
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:50.000Z",
    });

    expect(
      snapshot.transfers.find(
        (transfer) => transfer.uniqueId === "tx:deployment:0",
      ),
    ).toMatchObject({
      fromAddressLower: WALLET,
      toAddressLower: null,
      rawAmountAtomicText: "0",
    });
    expect(
      snapshot.transactions.find((entry) => entry.transaction.txHash === TX_B)
        ?.transaction.toAddressLower,
    ).toBeNull();
  });

  it("rejects a transfer to value that is neither an address nor null", async () => {
    await expect(
      provider(
        new ScriptedAlchemyTransport({ invalidTransferTo: true }),
      ).fetchSnapshot({
        address: WALLET,
        historyStartAt: "1970-01-01T00:00:50.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
  });

  it("anchors current balances before history completes", async () => {
    const snapshot = await provider(new ScriptedAlchemyTransport(), [
      "2026-08-12T12:00:00.000Z",
      "2026-08-12T12:05:00.000Z",
    ]).fetchSnapshot({
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:50.000Z",
    });

    expect(snapshot.balanceObservedAt).toBe("2026-08-12T12:00:00.000Z");
    expect(snapshot.syncCompletedAt).toBe("2026-08-12T12:05:00.000Z");
  });

  it("isolates a token row error while preserving valid balances and activity", async () => {
    const snapshot = await provider(
      new ScriptedAlchemyTransport({ tokenBalanceError: true }),
    ).fetchSnapshot({
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:50.000Z",
    });

    expect(snapshot.balanceComplete).toBe(false);
    expect(
      snapshot.balances.map((balance) => balance.providerAssetKey),
    ).toEqual(
      expect.arrayContaining(["eip155:1/native", `eip155:1/erc20:${USDC}`]),
    );
    expect(snapshot.balances).not.toContainEqual(
      expect.objectContaining({
        providerAssetKey: `eip155:1/erc20:${BAD_TOKEN}`,
      }),
    );
    expect(snapshot.balanceIssues).toEqual([
      {
        code: "TOKEN_BALANCE_UNAVAILABLE",
        providerAssetKey: `eip155:1/erc20:${BAD_TOKEN}`,
        message: `Token balance unavailable for eip155:1/erc20:${BAD_TOKEN}.`,
      },
    ]);
    expect(snapshot.transfers.length).toBeGreaterThan(0);
  });

  it("keeps unknown ERC-20 decimals and human amount unresolved", async () => {
    const snapshot = await provider(
      new ScriptedAlchemyTransport({ unknownTokenDecimals: true }),
    ).fetchSnapshot({
      address: WALLET,
      historyStartAt: "1970-01-01T00:00:50.000Z",
    });

    expect(
      snapshot.balances.find(
        (balance) => balance.providerAssetKey === `eip155:1/erc20:${FAKE_USDC}`,
      ),
    ).toMatchObject({
      rawAmountAtomicText: "1",
      decimals: null,
      amountText: null,
    });
  });

  it("rejects a non-mainnet endpoint before fetching balances", async () => {
    const transport = new ScriptedAlchemyTransport({ chainId: "0x2" });
    await expect(
      provider(transport).fetchSnapshot({
        address: WALLET,
        historyStartAt: "1970-01-01T00:00:50.000Z",
      }),
    ).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
    expect(transport.calls.map((call) => call.method)).toEqual(["eth_chainId"]);
  });

  it("fails closed when a pageKey expires and exposes no request URL", async () => {
    const transport = new ScriptedAlchemyTransport({
      expireTransferPagination: true,
    });
    let caught: unknown;
    try {
      await provider(transport).fetchSnapshot({
        address: WALLET,
        historyStartAt: "1970-01-01T00:00:50.000Z",
      });
    } catch (error) {
      caught = error;
    }
    expect(safeEvmFailure(caught)).toEqual({
      code: "PAGINATION_EXPIRED",
      message:
        "Alchemy pagination expired before the activity snapshot completed.",
      retryAfterSeconds: null,
    });
    expect(JSON.stringify(safeEvmFailure(caught))).not.toContain(
      "alchemy-test-key",
    );
  });
});
