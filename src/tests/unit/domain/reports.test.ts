import { describe, expect, it } from "vitest";

import { aggregateReportEntriesByAsset } from "../../../domain/reports";
import type { ReportEntryFact } from "../../../domain/types";

describe("report entry classification", () => {
  it("F-001 counts only a transfer fee as expense", () => {
    const entries: ReportEntryFact[] = [
      {
        assetId: "usdt",
        eventType: "transfer",
        role: "source",
        amountAtomic: -100000000n,
      },
      {
        assetId: "usdt",
        eventType: "transfer",
        role: "destination",
        amountAtomic: 100000000n,
      },
      {
        assetId: "usdt",
        eventType: "transfer",
        role: "fee",
        amountAtomic: -500000n,
      },
    ];

    expect(aggregateReportEntriesByAsset(entries)).toEqual([
      { assetId: "usdt", incomeAtomic: 0n, expenseAtomic: 500000n },
    ]);
  });

  it("F-002 excludes exchange principal and groups an ETH fee independently", () => {
    const entries: ReportEntryFact[] = [
      {
        assetId: "usdt",
        eventType: "exchange",
        role: "source",
        amountAtomic: -100000000n,
      },
      {
        assetId: "usd",
        eventType: "exchange",
        role: "destination",
        amountAtomic: 9950n,
      },
      {
        assetId: "eth",
        eventType: "exchange",
        role: "fee",
        amountAtomic: -10000000000000000n,
      },
    ];

    expect(aggregateReportEntriesByAsset(entries)).toEqual([
      {
        assetId: "eth",
        incomeAtomic: 0n,
        expenseAtomic: 10000000000000000n,
      },
    ]);
  });

  it("keeps income and expense buckets separate by asset", () => {
    expect(
      aggregateReportEntriesByAsset([
        {
          assetId: "usd",
          eventType: "income",
          role: "main",
          amountAtomic: 10000n,
        },
        {
          assetId: "cny",
          eventType: "expense",
          role: "main",
          amountAtomic: -3580n,
        },
      ]),
    ).toEqual([
      { assetId: "cny", incomeAtomic: 0n, expenseAtomic: 3580n },
      { assetId: "usd", incomeAtomic: 10000n, expenseAtomic: 0n },
    ]);
  });
});
