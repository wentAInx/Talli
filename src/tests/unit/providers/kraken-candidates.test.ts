import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  krakenReportedNonzeroTradeFee,
  normalizeKrakenLedgerCandidate,
  normalizeKrakenTradeCandidate,
} from "../../../providers/kraken/candidates";
import type {
  KrakenReferenceData,
  KrakenSourceObject,
} from "../../../providers/kraken/types";

const referenceData: KrakenReferenceData = {
  assets: {},
  assetPairs: {
    "BTC/USD": {
      displayPair: "BTC/USD",
      providerAliases: ["BTC/USD", "XBT/USD", "XBTUSD", "XXBTZUSD"],
      altname: "XBTUSD",
      wsname: "XBT/USD",
      base: "BTC",
      quote: "USD",
      feeVolumeCurrency: "USD",
      pairDecimals: 4,
      lotDecimals: 8,
    },
  },
};

function source(
  objectType: "kraken_trade" | "kraken_ledger",
  externalId: string,
  payload: Record<string, unknown>,
): KrakenSourceObject {
  const payloadJson = JSON.stringify(payload);
  return {
    objectType,
    externalId,
    occurredAt: "2026-08-11T12:00:00.100Z",
    payloadJson,
    payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
  };
}

function trade(type: "buy" | "sell", fee = "0.2500"): KrakenSourceObject {
  return source("kraken_trade", `T-${type}`, {
    ordertxid: "O-1",
    postxid: "",
    pair: "XXBTZUSD",
    time: "1786440000.1000",
    type,
    price: "68965.517241",
    cost: "100.0000",
    fee,
    vol: "0.00145000",
    ledgers: [],
  });
}

function ledger(
  externalId: string,
  input: {
    refid: string;
    type: string;
    asset: string;
    amount: string;
    fee: string;
  },
): KrakenSourceObject {
  return source("kraken_ledger", externalId, {
    ...input,
    subtype: "",
    time: "1786440000.1000",
    balance: "0.0000",
  });
}

describe("Kraken candidate normalization", () => {
  it("maps a real XXBTZUSD buy fill to raw ZUSD/XXBT legs with a display title", () => {
    const candidate = normalizeKrakenTradeCandidate({
      trade: trade("buy"),
      ledgers: [
        ledger("L-FEE", {
          refid: "T-buy",
          type: "trade",
          asset: "ZUSD",
          amount: "-100.0000",
          fee: "0.2500",
        }),
      ],
      referenceData,
      rawAssetKeyByDisplay: { BTC: "XXBT", USD: "ZUSD" },
    });

    expect(candidate.suggestedEventType).toBe("exchange");
    expect(candidate.title).toBe("Kraken trade BTC/USD");
    expect(candidate.legs).toEqual([
      { role: "source", providerAssetKey: "ZUSD", amountText: "-100.0000" },
      {
        role: "destination",
        providerAssetKey: "XXBT",
        amountText: "0.00145000",
      },
      {
        role: "fee",
        providerAssetKey: "ZUSD",
        amountText: "-0.2500",
        note: "Fee evidence: Kraken ledger L-FEE",
      },
    ]);
  });

  it("maps a sell fill to negative base and positive quote", () => {
    const candidate = normalizeKrakenTradeCandidate({
      trade: trade("sell", "0.0000"),
      ledgers: [],
      referenceData,
      rawAssetKeyByDisplay: { BTC: "XXBT", USD: "ZUSD" },
    });
    expect(candidate.legs).toEqual([
      {
        role: "source",
        providerAssetKey: "XXBT",
        amountText: "-0.00145000",
      },
      { role: "destination", providerAssetKey: "ZUSD", amountText: "100.0000" },
    ]);
  });

  it("does not guess a fee asset from the trade fee amount", () => {
    const candidate = normalizeKrakenTradeCandidate({
      trade: trade("buy"),
      ledgers: [],
      referenceData,
      rawAssetKeyByDisplay: { BTC: "XXBT", USD: "ZUSD" },
    });
    expect(candidate.legs.some((leg) => leg.role === "fee")).toBe(false);
    expect(candidate.warnings).toContain(
      "Trade fee amount is present, but its asset is unresolved.",
    );
    expect(krakenReportedNonzeroTradeFee(trade("buy"))).toBe("0.2500");
  });

  it("keeps deposit and withdrawal as explicit-review unknown events", () => {
    const deposit = normalizeKrakenLedgerCandidate(
      ledger("L-DEPOSIT", {
        refid: "D-1",
        type: "deposit",
        asset: "USDT",
        amount: "50.00000000",
        fee: "0.00000000",
      }),
    );
    const withdrawal = normalizeKrakenLedgerCandidate(
      ledger("L-WITHDRAW", {
        refid: "W-1",
        type: "withdrawal",
        asset: "USDT",
        amount: "-10.00000000",
        fee: "0.10000000",
      }),
    );

    expect(deposit).toMatchObject({
      suggestedEventType: "unknown",
      legs: [{ role: "external_in" }],
    });
    expect(withdrawal).toMatchObject({
      suggestedEventType: "unknown",
      legs: [{ role: "external_out" }, { role: "fee" }],
    });
  });
});
