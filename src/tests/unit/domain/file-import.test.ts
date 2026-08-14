import { describe, expect, it } from "vitest";

import { scoreFileImportLedgerMatch } from "../../../domain/file-import";

describe("financial file Ledger match scoring", () => {
  it("scores deterministically inside the three-calendar-day window", () => {
    expect(
      scoreFileImportLedgerMatch({
        sourceLocalDate: "2026-08-10",
        sourcePayee: "Coffee Shop",
        sourceMemo: "Breakfast",
        ledgerLocalDate: "2026-08-10",
        ledgerPayee: "coffee shop",
        ledgerNote: "Breakfast",
      }),
    ).toEqual({
      score: 10_000,
      reasons: ["same date", "payee exact", "memo exact"],
    });
    expect(
      scoreFileImportLedgerMatch({
        sourceLocalDate: "2026-08-10",
        sourcePayee: "Coffee Shop",
        sourceMemo: null,
        ledgerLocalDate: "2026-08-13",
        ledgerPayee: "Coffee Shop Downtown",
        ledgerNote: null,
      }),
    ).toEqual({
      score: 4500,
      reasons: ["date ±3", "payee contains"],
    });
  });

  it("returns no suggestion score outside the three-calendar-day window", () => {
    expect(
      scoreFileImportLedgerMatch({
        sourceLocalDate: "2026-08-10",
        sourcePayee: "Same Payee",
        sourceMemo: "Same memo",
        ledgerLocalDate: "2026-08-14",
        ledgerPayee: "Same Payee",
        ledgerNote: "Same memo",
      }),
    ).toEqual({ score: 0, reasons: [] });
  });
});
