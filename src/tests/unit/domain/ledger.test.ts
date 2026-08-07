import { describe, expect, it } from "vitest";

import {
  buildExchangeEntries,
  buildExpenseEntries,
  buildIncomeEntries,
  buildTransferEntries,
} from "../../../domain/ledger";
import type { AccountRef } from "../../../domain/types";

const cny: AccountRef = { id: "alipay-cny", assetId: "cny" };
const wiseUsd: AccountRef = { id: "wise-usd", assetId: "usd" };
const cashUsd: AccountRef = { id: "cash-usd", assetId: "usd" };
const krakenUsdt: AccountRef = { id: "kraken-usdt", assetId: "usdt" };
const metamaskEth: AccountRef = { id: "metamask-eth", assetId: "eth" };

describe("ledger entry builders", () => {
  it("E-001 builds one negative expense main entry", () => {
    expect(buildExpenseEntries({ account: cny, amountAtomic: 3580n })).toEqual([
      { accountId: cny.id, role: "main", amountAtomic: -3580n },
    ]);
  });

  it("E-002 builds one positive income main entry", () => {
    expect(
      buildIncomeEntries({ account: wiseUsd, amountAtomic: 10000n }),
    ).toEqual([{ accountId: wiseUsd.id, role: "main", amountAtomic: 10000n }]);
  });

  it("E-003 builds equal and opposite same-asset transfer entries", () => {
    expect(
      buildTransferEntries({
        sourceAccount: wiseUsd,
        destinationAccount: cashUsd,
        amountAtomic: 5000n,
      }),
    ).toEqual([
      { accountId: wiseUsd.id, role: "source", amountAtomic: -5000n },
      { accountId: cashUsd.id, role: "destination", amountAtomic: 5000n },
    ]);
  });

  it("E-004 rejects a cross-asset transfer", () => {
    expect(() =>
      buildTransferEntries({
        sourceAccount: krakenUsdt,
        destinationAccount: wiseUsd,
        amountAtomic: 1000000n,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "TRANSFER_ASSET_MISMATCH" }),
    );
  });

  it("E-005 rejects a same-asset exchange", () => {
    expect(() =>
      buildExchangeEntries({
        sourceAccount: wiseUsd,
        sourceAmountAtomic: 5000n,
        destinationAccount: cashUsd,
        destinationAmountAtomic: 5000n,
      }),
    ).toThrowError(expect.objectContaining({ code: "EXCHANGE_ASSET_MATCH" }));
  });

  it("E-006 builds independent exchange quantities", () => {
    expect(
      buildExchangeEntries({
        sourceAccount: krakenUsdt,
        sourceAmountAtomic: 100000000n,
        destinationAccount: wiseUsd,
        destinationAmountAtomic: 9950n,
      }),
    ).toEqual([
      { accountId: krakenUsdt.id, role: "source", amountAtomic: -100000000n },
      { accountId: wiseUsd.id, role: "destination", amountAtomic: 9950n },
    ]);
  });

  it("E-007 rejects transfer to the same account", () => {
    expect(() =>
      buildTransferEntries({
        sourceAccount: wiseUsd,
        destinationAccount: wiseUsd,
        amountAtomic: 5000n,
      }),
    ).toThrowError(expect.objectContaining({ code: "TRANSFER_SAME_ACCOUNT" }));
  });

  it("F-001 keeps a same-asset fee separate from transfer principal", () => {
    expect(
      buildTransferEntries({
        sourceAccount: krakenUsdt,
        destinationAccount: { id: "wallet-usdt", assetId: "usdt" },
        amountAtomic: 100000000n,
        fee: { account: krakenUsdt, amountAtomic: 500000n },
      }),
    ).toEqual([
      { accountId: krakenUsdt.id, role: "source", amountAtomic: -100000000n },
      {
        accountId: "wallet-usdt",
        role: "destination",
        amountAtomic: 100000000n,
      },
      { accountId: krakenUsdt.id, role: "fee", amountAtomic: -500000n },
    ]);
  });

  it("F-002 allows an independent fee asset on exchange", () => {
    expect(
      buildExchangeEntries({
        sourceAccount: krakenUsdt,
        sourceAmountAtomic: 100000000n,
        destinationAccount: wiseUsd,
        destinationAmountAtomic: 9950n,
        fee: { account: metamaskEth, amountAtomic: 10000000000000000n },
      }),
    ).toEqual([
      { accountId: krakenUsdt.id, role: "source", amountAtomic: -100000000n },
      { accountId: wiseUsd.id, role: "destination", amountAtomic: 9950n },
      {
        accountId: metamaskEth.id,
        role: "fee",
        amountAtomic: -10000000000000000n,
      },
    ]);
  });

  it.each([
    () => buildExpenseEntries({ account: cny, amountAtomic: 0n }),
    () => buildIncomeEntries({ account: wiseUsd, amountAtomic: -1n }),
    () =>
      buildTransferEntries({
        sourceAccount: wiseUsd,
        destinationAccount: cashUsd,
        amountAtomic: 0n,
      }),
    () =>
      buildTransferEntries({
        sourceAccount: wiseUsd,
        destinationAccount: cashUsd,
        amountAtomic: 1n,
        fee: { account: wiseUsd, amountAtomic: 0n },
      }),
    () =>
      buildExchangeEntries({
        sourceAccount: krakenUsdt,
        sourceAmountAtomic: 1n,
        destinationAccount: wiseUsd,
        destinationAmountAtomic: -1n,
      }),
  ])("rejects non-positive user magnitudes", (build) => {
    expect(build).toThrowError(
      expect.objectContaining({ code: "AMOUNT_NOT_POSITIVE" }),
    );
  });
});
