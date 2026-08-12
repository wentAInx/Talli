import { describe, expect, it } from "vitest";

import { createKrakenSignature } from "../../../providers/kraken/auth";
import { KrakenReadOnlyClient } from "../../../providers/kraken/client";
import {
  associateKrakenPairAliases,
  evaluateKrakenPermissions,
  parseKrakenAssetPairs,
  parseKrakenAssets,
  resolveKrakenAssetDisplayCode,
  resolveKrakenPair,
} from "../../../providers/kraken/normalize";
import type {
  KrakenHttpTransport,
  KrakenNonceSource,
} from "../../../providers/kraken/types";

interface RecordedCall {
  method: "GET" | "POST";
  path: string;
  search: string;
  body: string;
}

function envelope(result: unknown, error: string[] = []) {
  return JSON.stringify({ error, result });
}

function ledgerRecord(index: number) {
  return {
    refid: `REF-${index}`,
    time: `1786440000.${String(index).padStart(4, "0")}`,
    type: "deposit",
    subtype: "",
    asset: "USDT",
    amount: "1.00000000",
    fee: "0.00000000",
    balance: `${index}.00000000`,
  };
}

function tradeRecord(index: number) {
  return {
    ordertxid: `O-${index}`,
    postxid: "",
    pair: "XXBTZUSD",
    time: `1786440000.${String(index).padStart(4, "0")}`,
    type: index % 2 === 0 ? "buy" : "sell",
    price: "68965.517241",
    cost: "100.0000",
    fee: "0.2500",
    vol: "0.00145000",
    ledgers: [`L-${index}`],
  };
}

class IncrementingNonce implements KrakenNonceSource {
  private value = 1_786_440_000_000n;

  next(): string {
    this.value += 1n;
    return this.value.toString();
  }
}

class ScriptedKrakenTransport implements KrakenHttpTransport {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly permissions: string[]) {}

  async request(input: { method: "GET" | "POST"; url: URL; body?: string }) {
    const body = input.body ?? "";
    this.calls.push({
      method: input.method,
      path: input.url.pathname,
      search: input.url.search,
      body,
    });
    const parameters = new URLSearchParams(body);
    const offset = Number(parameters.get("ofs") ?? "0");
    let result: unknown;
    switch (input.url.pathname) {
      case "/0/private/GetApiKeyInfo":
        result = { permissions: this.permissions, apiKey: "must-not-persist" };
        break;
      case "/0/public/Assets":
        result = {
          BTC: { altname: "XBT", decimals: 10, display_decimals: 8 },
          USD: { altname: "USD", decimals: 4, display_decimals: 2 },
          USDT: { altname: "USDT", decimals: 8, display_decimals: 8 },
          "USDT.F": {
            altname: "USDT.F",
            decimals: 8,
            display_decimals: 8,
          },
        };
        break;
      case "/0/public/AssetPairs":
        result = input.url.searchParams.has("assetVersion")
          ? {
              "BTC/USD": {
                altname: "XBTUSD",
                wsname: "XBT/USD",
                base: "BTC",
                quote: "USD",
                fee_volume_currency: "USD",
                pair_decimals: 4,
                lot_decimals: 8,
              },
            }
          : {
              XXBTZUSD: {
                altname: "XBTUSD",
                wsname: "XBT/USD",
                base: "XXBT",
                quote: "ZUSD",
                fee_volume_currency: "ZUSD",
                pair_decimals: 4,
                lot_decimals: 8,
              },
            };
        break;
      case "/0/private/Balance":
        result = { XXBT: "0.50200000", "USDT.F": "5.00000000" };
        break;
      case "/0/private/Ledgers": {
        const pageSize = offset === 0 ? 50 : 1;
        result = {
          ledger: Object.fromEntries(
            Array.from({ length: pageSize }, (_, pageIndex) => {
              const index = offset + pageIndex;
              return [`L-${index}`, ledgerRecord(index)];
            }),
          ),
          count: 51,
        };
        break;
      }
      case "/0/private/TradesHistory": {
        const pageSize = offset === 0 ? 100 : 1;
        result = {
          trades: Object.fromEntries(
            Array.from({ length: pageSize }, (_, pageIndex) => {
              const index = offset + pageIndex;
              return [`T-${index}`, tradeRecord(index)];
            }),
          ),
          count: 101,
        };
        break;
      }
      default:
        throw new Error(`Unexpected endpoint ${input.url.pathname}`);
    }
    return { status: 200, headers: new Headers(), text: envelope(result) };
  }
}

const requiredPermissions = [
  "query-funds",
  "query-ledger",
  "query-closed-trades",
];

describe("Kraken read-only provider", () => {
  it("generates the fixed read-only signature vector", () => {
    expect(
      createKrakenSignature({
        path: "/0/private/Balance",
        nonce: "1616492376594",
        body: "nonce=1616492376594",
        apiSecret: "c2VjcmV0LWJ5dGVz",
      }),
    ).toBe(
      "MXlPzaWDQ4iOKBwBeKgoW/L/83d4OVV32uhjtXqfX3ppjjFszscetgkpNCw5xvetcuaLYaj/Q0Aj3MpJMPw6NA==",
    );
  });

  it("requires all read permissions and rejects dangerous write permissions", () => {
    expect(evaluateKrakenPermissions(requiredPermissions)).toMatchObject({
      ok: true,
      missingRequired: [],
      forbiddenWritePermissions: [],
    });
    expect(
      evaluateKrakenPermissions(["query-funds", "query-closed-trades"]),
    ).toMatchObject({ ok: false, missingRequired: ["query-ledger"] });
    expect(
      evaluateKrakenPermissions([
        ...requiredPermissions,
        "withdraw-funds",
        "modify-trades",
      ]),
    ).toMatchObject({
      ok: false,
      forbiddenWritePermissions: ["withdraw-funds", "modify-trades"],
    });
  });

  it("uses metadata for raw asset and pair identity without collapsing suffixes", () => {
    const assets = parseKrakenAssets({
      BTC: { altname: "XBT", decimals: 10, display_decimals: 8 },
      USD: { altname: "USD", decimals: 4, display_decimals: 2 },
      "USDT.F": { altname: "USDT.F", decimals: 8, display_decimals: 8 },
    });
    const displayPairs = parseKrakenAssetPairs({
      "BTC/USD": {
        altname: "XBTUSD",
        wsname: "XBT/USD",
        base: "BTC",
        quote: "USD",
        fee_volume_currency: "USD",
      },
    });
    const internalPairs = parseKrakenAssetPairs({
      XXBTZUSD: {
        altname: "XBTUSD",
        wsname: "XBT/USD",
        base: "XXBT",
        quote: "ZUSD",
        fee_volume_currency: "ZUSD",
      },
    });
    const pairs = associateKrakenPairAliases(displayPairs, internalPairs);
    expect(resolveKrakenAssetDisplayCode("XXBT", assets)).toBe("BTC");
    expect(resolveKrakenAssetDisplayCode("ZUSD", assets)).toBe("USD");
    expect(resolveKrakenAssetDisplayCode("USDT.F", assets)).toBe("USDT.F");
    for (const identifier of ["XXBTZUSD", "XBTUSD", "XBT/USD", "BTC/USD"]) {
      expect(resolveKrakenPair(identifier, pairs)).toMatchObject({
        displayPair: "BTC/USD",
        base: "BTC",
        quote: "USD",
      });
    }
  });

  it("paginates ledgers and fills with injectable transport only", async () => {
    const transport = new ScriptedKrakenTransport(requiredPermissions);
    const provider = new KrakenReadOnlyClient(
      transport,
      new IncrementingNonce(),
      {
        connectionId: "connection-1",
        apiKey: "test-api-key",
        apiSecret: "c2VjcmV0LWJ5dGVz",
      },
      {
        id: () => "unused",
        now: () => "2026-08-11T12:00:00.000Z",
      },
    );

    const snapshot = await provider.fetchSnapshot();
    expect(snapshot.ledgers).toHaveLength(51);
    expect(snapshot.trades).toHaveLength(101);
    expect(snapshot.balances).toEqual([
      { providerAssetKey: "USDT.F", amountText: "5.00000000" },
      { providerAssetKey: "XXBT", amountText: "0.50200000" },
    ]);
    expect(
      transport.calls
        .filter((call) => call.path === "/0/private/Ledgers")
        .map((call) => new URLSearchParams(call.body).get("ofs")),
    ).toEqual(["0", "50"]);
    expect(
      transport.calls
        .filter((call) => call.path === "/0/private/TradesHistory")
        .map((call) => new URLSearchParams(call.body).get("ofs")),
    ).toEqual(["0", "100"]);
    expect(
      transport.calls.every((call) =>
        [
          "/0/private/GetApiKeyInfo",
          "/0/public/Assets",
          "/0/public/AssetPairs",
          "/0/private/Balance",
          "/0/private/Ledgers",
          "/0/private/TradesHistory",
        ].includes(call.path),
      ),
    ).toBe(true);
    expect(
      transport.calls
        .filter((call) => call.path === "/0/public/AssetPairs")
        .map((call) => call.search)
        .sort(),
    ).toEqual(["", "?assetVersion=1"]);
    expect(snapshot.ledgers[0]!.payloadJson).not.toContain("must-not-persist");
  });

  it("stops after permission validation when a write capability is present", async () => {
    const transport = new ScriptedKrakenTransport([
      ...requiredPermissions,
      "withdraw-funds",
    ]);
    const provider = new KrakenReadOnlyClient(
      transport,
      new IncrementingNonce(),
      {
        connectionId: "connection-1",
        apiKey: "sentinel-api-key",
        apiSecret: "c2VjcmV0LWJ5dGVz",
      },
    );

    await expect(provider.fetchSnapshot()).rejects.toMatchObject({
      code: "PERMISSION_ERROR",
    });
    expect(transport.calls).toHaveLength(1);
  });
});
