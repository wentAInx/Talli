import "server-only";

import { createHash } from "node:crypto";

import { canonicalExternalJson } from "../../domain/external-sync";
import type {
  KrakenPermissionCheck,
  KrakenReadOnlyProvider,
  KrakenSourceObject,
  KrakenSyncSnapshot,
} from "./types";

const FIXTURE_PERMISSIONS: KrakenPermissionCheck = {
  ok: true,
  permissions: ["query-closed-trades", "query-funds", "query-ledger"],
  missingRequired: [],
  forbiddenWritePermissions: [],
  extraReadOnlyPermissions: [],
};
let fixtureFetchSequence = 0;

function fixtureSource(
  objectType: "kraken_trade" | "kraken_ledger",
  externalId: string,
  payload: Record<string, string | string[]>,
): KrakenSourceObject {
  const payloadJson = canonicalExternalJson(payload);
  return {
    objectType,
    externalId,
    occurredAt: "2026-08-11T12:00:00.100Z",
    payloadJson,
    payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
  };
}

function fixtureSnapshot(): KrakenSyncSnapshot {
  const fetchedAt = new Date(
    Date.parse("2026-08-11T12:05:00.000Z") + fixtureFetchSequence * 60_000,
  ).toISOString();
  fixtureFetchSequence += 1;
  return {
    fetchedAt,
    permissions: FIXTURE_PERMISSIONS,
    referenceData: {
      assets: {
        BTC: {
          displayCode: "BTC",
          altname: "XBT",
          decimals: 10,
          displayDecimals: 8,
          status: "enabled",
        },
        USD: {
          displayCode: "USD",
          altname: "USD",
          decimals: 4,
          displayDecimals: 2,
          status: "enabled",
        },
        USDT: {
          displayCode: "USDT",
          altname: "USDT",
          decimals: 8,
          displayDecimals: 8,
          status: "enabled",
        },
      },
      assetPairs: {
        "BTC/USD": {
          displayPair: "BTC/USD",
          altname: "XBTUSD",
          wsname: "XBT/USD",
          base: "BTC",
          quote: "USD",
          feeVolumeCurrency: "USD",
          pairDecimals: 4,
          lotDecimals: 8,
        },
      },
    },
    balances: [
      { providerAssetKey: "XXBT", amountText: "0.50200000" },
      { providerAssetKey: "ZUSD", amountText: "1250.1000" },
    ],
    ledgers: [
      fixtureSource("kraken_ledger", "L-TRADE-1", {
        refid: "T-TRADE-1",
        time: "1786440000.1000",
        type: "trade",
        subtype: "",
        asset: "ZUSD",
        amount: "-100.0000",
        fee: "0.2500",
        balance: "1150.1000",
      }),
      fixtureSource("kraken_ledger", "L-DEPOSIT-1", {
        refid: "D-DEPOSIT-1",
        time: "1786430000.0000",
        type: "deposit",
        subtype: "",
        asset: "USDT",
        amount: "50.00000000",
        fee: "0.00000000",
        balance: "100.00000000",
      }),
    ],
    trades: [
      fixtureSource("kraken_trade", "T-TRADE-1", {
        ordertxid: "O-ORDER-1",
        postxid: "",
        pair: "BTC/USD",
        time: "1786440000.1000",
        type: "buy",
        price: "68965.517241",
        cost: "100.0000",
        fee: "0.2500",
        vol: "0.00145000",
        ledgers: ["L-TRADE-1"],
      }),
    ],
  };
}

export function isKrakenFixtureMode(): boolean {
  return (
    process.env.TALLI_E2E_KRAKEN_FIXTURE === "1" &&
    (process.env.CI === "true" || process.env.NODE_ENV === "development")
  );
}

export class DeterministicKrakenFixtureProvider implements KrakenReadOnlyProvider {
  async validateCredentials(): Promise<KrakenPermissionCheck> {
    return FIXTURE_PERMISSIONS;
  }

  async fetchSnapshot(): Promise<KrakenSyncSnapshot> {
    return fixtureSnapshot();
  }
}
