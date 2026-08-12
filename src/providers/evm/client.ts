import {
  EVM_NATIVE_ASSET_KEY,
  evmDecimalsFromHex,
  evmErc20AssetKey,
  evmQuantityHex,
  evmRawAtomicToDecimalText,
  normalizeEvmAddress,
  normalizeEvmTxHash,
  normalizeEvmUniqueId,
  parseEvmHexQuantity,
} from "../../domain/evm";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "../../services/runtime";
import { EvmProviderError } from "./errors";
import type {
  AlchemyReadMethod,
  EvmBalanceRecord,
  EvmEnrichedTransaction,
  EvmJsonRpcTransport,
  EvmReadOnlyProvider,
  EvmReceiptRecord,
  EvmSyncInput,
  EvmSyncSnapshot,
  EvmTokenMetadata,
  EvmTransactionRecord,
  EvmTransferRecord,
} from "./types";

const ALCHEMY_ORIGIN = "https://eth-mainnet.g.alchemy.com";
const TRANSFER_CATEGORIES = ["external", "internal", "erc20"] as const;
const NATIVE_DECIMALS = 18;
const REORG_OVERLAP_BLOCKS = 32n;

interface AlchemyClientOptions {
  apiKey: string;
  timeoutMs?: number;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EvmProviderError("INVALID_PAYLOAD", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const candidate = value[field];
  if (typeof candidate !== "string") {
    throw new EvmProviderError(
      "INVALID_PAYLOAD",
      `${label} ${field} is invalid.`,
    );
  }
  return candidate;
}

function nullableStringField(
  value: Record<string, unknown>,
  field: string,
): string | null {
  const candidate = value[field];
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate !== "string") {
    throw new EvmProviderError(
      "INVALID_PAYLOAD",
      `Alchemy ${field} is invalid.`,
    );
  }
  return candidate;
}

function canonicalInstant(input: string): string {
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) {
    throw new EvmProviderError(
      "INVALID_PAYLOAD",
      "Alchemy block timestamp is invalid.",
    );
  }
  return new Date(timestamp).toISOString();
}

function retryAfterSeconds(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function throwHttpError(status: number, headers: Headers): never {
  if (status === 401 || status === 403) {
    throw new EvmProviderError(
      "AUTH_ERROR",
      "Alchemy rejected the configured server credential.",
    );
  }
  if (status === 429) {
    throw new EvmProviderError(
      "RATE_LIMITED",
      "Alchemy rate limit was reached.",
      retryAfterSeconds(headers),
    );
  }
  throw new EvmProviderError(
    "UPSTREAM_ERROR",
    "Alchemy returned an unavailable upstream response.",
  );
}

function throwRpcError(value: Record<string, unknown>): never {
  const message = typeof value.message === "string" ? value.message : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("page") && normalized.includes("expired")) {
    throw new EvmProviderError(
      "PAGINATION_EXPIRED",
      "Alchemy pagination expired before the activity snapshot completed.",
    );
  }
  if (
    normalized.includes("api key") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    throw new EvmProviderError(
      "AUTH_ERROR",
      "Alchemy rejected the configured server credential.",
    );
  }
  if (normalized.includes("rate") || normalized.includes("capacity")) {
    throw new EvmProviderError(
      "RATE_LIMITED",
      "Alchemy rate limit was reached.",
    );
  }
  throw new EvmProviderError(
    "UPSTREAM_ERROR",
    "Alchemy returned an unavailable JSON-RPC response.",
  );
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

export class AlchemyReadOnlyClient implements EvmReadOnlyProvider {
  private readonly timeoutMs: number;
  private requestId = 0;

  constructor(
    private readonly transport: EvmJsonRpcTransport,
    private readonly options: AlchemyClientOptions,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!options.apiKey.trim()) {
      throw new EvmProviderError(
        "CONFIG_ERROR",
        "Alchemy server credential is not configured.",
      );
    }
  }

  private async rpc(
    method: AlchemyReadMethod,
    params: unknown[],
  ): Promise<unknown> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: ++this.requestId,
      method,
      params,
    });
    const response = await this.transport.request({
      url: new URL(`/v2/${this.options.apiKey}`, ALCHEMY_ORIGIN),
      body,
      timeoutMs: this.timeoutMs,
    });
    if (response.status < 200 || response.status >= 300) {
      throwHttpError(response.status, response.headers);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      throw new EvmProviderError(
        "INVALID_PAYLOAD",
        "Alchemy returned malformed JSON.",
      );
    }
    const envelope = record(parsed, "Alchemy JSON-RPC envelope");
    if ("error" in envelope)
      throwRpcError(record(envelope.error, "Alchemy error"));
    if (!("result" in envelope)) {
      throw new EvmProviderError(
        "INVALID_PAYLOAD",
        "Alchemy JSON-RPC result is missing.",
      );
    }
    return envelope.result;
  }

  private async assertMainnet(): Promise<void> {
    const chainId = await this.rpc("eth_chainId", []);
    if (chainId !== "0x1") {
      throw new EvmProviderError(
        "CHAIN_MISMATCH",
        "Alchemy endpoint is not Ethereum Mainnet.",
      );
    }
  }

  private async tokenMetadata(
    contractAddress: string,
  ): Promise<EvmTokenMetadata> {
    const contractAddressLower = normalizeEvmAddress(contractAddress);
    const value = record(
      await this.rpc("alchemy_getTokenMetadata", [contractAddressLower]),
      "Alchemy token metadata",
    );
    const decimals = value.decimals;
    if (
      decimals !== null &&
      decimals !== undefined &&
      (!Number.isInteger(decimals) ||
        Number(decimals) < 0 ||
        Number(decimals) > 255)
    ) {
      throw new EvmProviderError(
        "INVALID_PAYLOAD",
        "Alchemy token decimals are invalid.",
      );
    }
    return {
      contractAddressLower,
      decimals:
        decimals === null || decimals === undefined ? null : Number(decimals),
      name: typeof value.name === "string" ? value.name : null,
      symbol: typeof value.symbol === "string" ? value.symbol : null,
    };
  }

  private async tokenBalances(
    addressLower: string,
    metadata: Map<string, EvmTokenMetadata>,
  ): Promise<EvmBalanceRecord[]> {
    const balances: EvmBalanceRecord[] = [];
    let pageKey: string | null = null;
    do {
      const options: Record<string, unknown> = { maxCount: 100 };
      if (pageKey) options.pageKey = pageKey;
      const result = record(
        await this.rpc("alchemy_getTokenBalances", [
          addressLower,
          "erc20",
          options,
        ]),
        "Alchemy token balances",
      );
      if (!Array.isArray(result.tokenBalances)) {
        throw new EvmProviderError(
          "INVALID_PAYLOAD",
          "Alchemy token balance rows are invalid.",
        );
      }
      for (const raw of result.tokenBalances) {
        const row = record(raw, "Alchemy token balance");
        if (row.error !== null && row.error !== undefined) {
          throw new EvmProviderError(
            "INVALID_PAYLOAD",
            "Alchemy returned an ERC-20 balance error.",
          );
        }
        const contractAddressLower = normalizeEvmAddress(
          stringField(row, "contractAddress", "Alchemy token balance"),
        );
        const rawAtomic = parseEvmHexQuantity(
          stringField(row, "tokenBalance", "Alchemy token balance"),
          "ERC-20 tokenBalance",
        );
        if (rawAtomic === 0n) continue;
        const tokenMetadata =
          metadata.get(contractAddressLower) ??
          (await this.tokenMetadata(contractAddressLower));
        metadata.set(contractAddressLower, tokenMetadata);
        balances.push({
          providerAssetKey: evmErc20AssetKey(contractAddressLower),
          assetKind: "erc20",
          contractAddressLower,
          rawAmountAtomicText: rawAtomic.toString(),
          decimals: tokenMetadata.decimals,
          amountText:
            tokenMetadata.decimals === null
              ? null
              : evmRawAtomicToDecimalText(rawAtomic, tokenMetadata.decimals),
          displayCode: tokenMetadata.symbol,
          name: tokenMetadata.name,
        });
      }
      pageKey =
        typeof result.pageKey === "string" && result.pageKey.length > 0
          ? result.pageKey
          : null;
    } while (pageKey);
    return balances;
  }

  private async currentBalances(
    addressLower: string,
    metadata: Map<string, EvmTokenMetadata>,
  ): Promise<{ head: bigint; balances: EvmBalanceRecord[] }> {
    const [headResult, nativeResult] = await Promise.all([
      this.rpc("eth_blockNumber", []),
      this.rpc("eth_getBalance", [addressLower, "latest"]),
    ]);
    if (typeof headResult !== "string" || typeof nativeResult !== "string") {
      throw new EvmProviderError(
        "INVALID_PAYLOAD",
        "Alchemy current balance response is invalid.",
      );
    }
    const head = parseEvmHexQuantity(headResult, "Latest block number");
    const nativeAtomic = parseEvmHexQuantity(nativeResult, "ETH balance");
    const tokens = await this.tokenBalances(addressLower, metadata);
    return {
      head,
      balances: [
        {
          providerAssetKey: EVM_NATIVE_ASSET_KEY,
          assetKind: "native",
          contractAddressLower: null,
          rawAmountAtomicText: nativeAtomic.toString(),
          decimals: NATIVE_DECIMALS,
          amountText: evmRawAtomicToDecimalText(nativeAtomic, NATIVE_DECIMALS),
          displayCode: "ETH",
          name: "Ethereum",
        },
        ...tokens,
      ],
    };
  }

  private async block(numberOrTag: string): Promise<{
    number: bigint;
    timestampSeconds: bigint;
  }> {
    const result = record(
      await this.rpc("eth_getBlockByNumber", [numberOrTag, false]),
      "Alchemy block",
    );
    return {
      number: parseEvmHexQuantity(
        stringField(result, "number", "Alchemy block"),
        "Block number",
      ),
      timestampSeconds: parseEvmHexQuantity(
        stringField(result, "timestamp", "Alchemy block"),
        "Block timestamp",
      ),
    };
  }

  private async blockAtOrAfter(
    timestamp: string,
    finalizedBlock: bigint,
  ): Promise<bigint> {
    const milliseconds = Date.parse(timestamp);
    if (!Number.isFinite(milliseconds)) {
      throw new EvmProviderError(
        "CONFIG_ERROR",
        "Wallet history start date is invalid.",
      );
    }
    const targetSeconds = BigInt(Math.floor(milliseconds / 1000));
    let low = 0n;
    let high = finalizedBlock;
    while (low < high) {
      const middle = (low + high) / 2n;
      const candidate = await this.block(evmQuantityHex(middle));
      if (candidate.timestampSeconds < targetSeconds) low = middle + 1n;
      else high = middle;
    }
    return low;
  }

  private async transferPages(input: {
    direction: "fromAddress" | "toAddress";
    addressLower: string;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<unknown[]> {
    const transfers: unknown[] = [];
    let pageKey: string | null = null;
    do {
      const parameters: Record<string, unknown> = {
        fromBlock: evmQuantityHex(input.fromBlock),
        toBlock: evmQuantityHex(input.toBlock),
        [input.direction]: input.addressLower,
        category: TRANSFER_CATEGORIES,
        withMetadata: true,
        excludeZeroValue: false,
        order: "asc",
        maxCount: "0x3e8",
      };
      if (pageKey) parameters.pageKey = pageKey;
      const result = record(
        await this.rpc("alchemy_getAssetTransfers", [parameters]),
        "Alchemy transfers",
      );
      if (!Array.isArray(result.transfers)) {
        throw new EvmProviderError(
          "INVALID_PAYLOAD",
          "Alchemy transfer rows are invalid.",
        );
      }
      transfers.push(...result.transfers);
      pageKey =
        typeof result.pageKey === "string" && result.pageKey.length > 0
          ? result.pageKey
          : null;
    } while (pageKey);
    return transfers;
  }

  private async parseTransfer(
    input: unknown,
    metadata: Map<string, EvmTokenMetadata>,
  ): Promise<EvmTransferRecord> {
    const row = record(input, "Alchemy transfer");
    const category = stringField(row, "category", "Alchemy transfer");
    if (
      !TRANSFER_CATEGORIES.includes(
        category as (typeof TRANSFER_CATEGORIES)[number],
      )
    ) {
      throw new EvmProviderError(
        "INVALID_PAYLOAD",
        "Alchemy transfer category is unsupported.",
      );
    }
    const rawContract = record(row.rawContract, "Alchemy rawContract");
    const rawAtomic = parseEvmHexQuantity(
      stringField(rawContract, "value", "Alchemy rawContract"),
      "Transfer rawContract.value",
    );
    const contractAddressLower =
      category === "erc20"
        ? normalizeEvmAddress(
            stringField(rawContract, "address", "Alchemy rawContract"),
          )
        : null;
    const decimals =
      category === "erc20"
        ? nullableStringField(rawContract, "decimal")
        : "0x12";
    let resolvedDecimals = decimals ? evmDecimalsFromHex(decimals) : null;
    let tokenMetadata: EvmTokenMetadata | null = null;
    if (contractAddressLower) {
      tokenMetadata =
        metadata.get(contractAddressLower) ??
        (await this.tokenMetadata(contractAddressLower));
      metadata.set(contractAddressLower, tokenMetadata);
      resolvedDecimals ??= tokenMetadata.decimals;
    }
    const metadataRow = record(row.metadata, "Alchemy transfer metadata");
    const blockNumberText = parseEvmHexQuantity(
      stringField(row, "blockNum", "Alchemy transfer"),
      "Transfer block number",
    ).toString();
    return {
      uniqueId: normalizeEvmUniqueId(
        stringField(row, "uniqueId", "Alchemy transfer"),
      ),
      txHash: normalizeEvmTxHash(stringField(row, "hash", "Alchemy transfer")),
      category: category as EvmTransferRecord["category"],
      fromAddressLower: normalizeEvmAddress(
        stringField(row, "from", "Alchemy transfer"),
      ),
      toAddressLower: normalizeEvmAddress(
        stringField(row, "to", "Alchemy transfer"),
      ),
      providerAssetKey: contractAddressLower
        ? evmErc20AssetKey(contractAddressLower)
        : EVM_NATIVE_ASSET_KEY,
      contractAddressLower,
      rawAmountAtomicText: rawAtomic.toString(),
      decimals: resolvedDecimals,
      amountText:
        resolvedDecimals === null
          ? null
          : evmRawAtomicToDecimalText(rawAtomic, resolvedDecimals),
      displayCode:
        tokenMetadata?.symbol ??
        (typeof row.asset === "string" ? row.asset : null),
      blockNumberText,
      occurredAt: canonicalInstant(
        stringField(metadataRow, "blockTimestamp", "Alchemy transfer metadata"),
      ),
      humanValue:
        typeof row.value === "string" || typeof row.value === "number"
          ? row.value
          : null,
    };
  }

  private async transaction(txHash: string): Promise<EvmEnrichedTransaction> {
    const [rawTransaction, rawReceipt] = await Promise.all([
      this.rpc("eth_getTransactionByHash", [txHash]),
      this.rpc("eth_getTransactionReceipt", [txHash]),
    ]);
    const transaction = record(rawTransaction, "Alchemy transaction");
    const receipt = record(rawReceipt, "Alchemy receipt");
    const parsedTransaction: EvmTransactionRecord = {
      txHash: normalizeEvmTxHash(
        stringField(transaction, "hash", "Alchemy transaction"),
      ),
      fromAddressLower: normalizeEvmAddress(
        stringField(transaction, "from", "Alchemy transaction"),
      ),
      toAddressLower: nullableStringField(transaction, "to")
        ? normalizeEvmAddress(nullableStringField(transaction, "to")!)
        : null,
      typeHex: nullableStringField(transaction, "type"),
      valueHex: stringField(transaction, "value", "Alchemy transaction"),
      blockNumberText: nullableStringField(transaction, "blockNumber")
        ? parseEvmHexQuantity(
            nullableStringField(transaction, "blockNumber")!,
            "Transaction block number",
          ).toString()
        : null,
    };
    const parsedReceipt: EvmReceiptRecord = {
      txHash: normalizeEvmTxHash(
        stringField(receipt, "transactionHash", "Alchemy receipt"),
      ),
      statusHex: nullableStringField(receipt, "status"),
      gasUsedHex: nullableStringField(receipt, "gasUsed"),
      effectiveGasPriceHex: nullableStringField(receipt, "effectiveGasPrice"),
      blobGasUsedHex: nullableStringField(receipt, "blobGasUsed"),
      blobGasPriceHex: nullableStringField(receipt, "blobGasPrice"),
      blockNumberText: nullableStringField(receipt, "blockNumber")
        ? parseEvmHexQuantity(
            nullableStringField(receipt, "blockNumber")!,
            "Receipt block number",
          ).toString()
        : null,
    };
    if (
      parsedTransaction.txHash !== txHash ||
      parsedReceipt.txHash !== txHash
    ) {
      throw new EvmProviderError(
        "INVALID_PAYLOAD",
        "Alchemy transaction enrichment hash is inconsistent.",
      );
    }
    return { transaction: parsedTransaction, receipt: parsedReceipt };
  }

  async fetchSnapshot(input: EvmSyncInput): Promise<EvmSyncSnapshot> {
    const addressLower = normalizeEvmAddress(input.address);
    await this.assertMainnet();
    const metadata = new Map<string, EvmTokenMetadata>();
    const current = await this.currentBalances(addressLower, metadata);
    const finalized = await this.block("finalized");
    const initialStart = await this.blockAtOrAfter(
      input.historyStartAt,
      finalized.number,
    );
    const previousFinalized = input.lastFinalizedBlockText
      ? BigInt(input.lastFinalizedBlockText)
      : null;
    const overlapStart =
      previousFinalized === null
        ? initialStart
        : maxBigInt(
            initialStart,
            previousFinalized > REORG_OVERLAP_BLOCKS
              ? previousFinalized - REORG_OVERLAP_BLOCKS
              : 0n,
          );
    const rawTransfers = [
      ...(await this.transferPages({
        direction: "fromAddress",
        addressLower,
        fromBlock: overlapStart,
        toBlock: finalized.number,
      })),
      ...(await this.transferPages({
        direction: "toAddress",
        addressLower,
        fromBlock: overlapStart,
        toBlock: finalized.number,
      })),
    ];
    const deduplicated = new Map<string, unknown>();
    for (const rawTransfer of rawTransfers) {
      const row = record(rawTransfer, "Alchemy transfer");
      const uniqueId = normalizeEvmUniqueId(
        stringField(row, "uniqueId", "Alchemy transfer"),
      );
      if (!deduplicated.has(uniqueId)) deduplicated.set(uniqueId, rawTransfer);
    }
    const transfers: EvmTransferRecord[] = [];
    for (const rawTransfer of deduplicated.values()) {
      transfers.push(await this.parseTransfer(rawTransfer, metadata));
    }
    const txHashes = [...new Set(transfers.map((transfer) => transfer.txHash))];
    const transactions = await Promise.all(
      txHashes.map((txHash) => this.transaction(txHash)),
    );
    return {
      fetchedAt: runtimeNow(this.runtime),
      addressLower,
      syncHeadBlockText: current.head.toString(),
      finalizedBlockText: finalized.number.toString(),
      balances: current.balances,
      transfers,
      transactions,
    };
  }
}
