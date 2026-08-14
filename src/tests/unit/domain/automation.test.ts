import { describe, expect, it } from "vitest";

import {
  evaluateAutomationRules,
  normalizeAutomationText,
  type AutomationRule,
  type FileCandidateAutomationContext,
} from "../../../domain/automation";

const context: FileCandidateAutomationContext = {
  bookId: "book-1",
  connectionId: "file-1",
  fileProfileId: "file-1",
  sourceFormat: "csv",
  targetAccountId: "account-usd",
  assetId: "asset-usd",
  assetCode: "USD",
  assetScale: 2,
  direction: "out",
  sourcePayee: "ＡＭＺＮ   Mktp US*ABC",
  sourceMemo: "Order 123",
  sourceAmountAtomic: -3599n,
  sourceDate: "2026-08-14",
  identityStrength: "strong",
  candidateStatus: "pending",
};

function rule(
  input: Partial<AutomationRule> &
    Pick<AutomationRule, "id" | "stage" | "conditions" | "actions">,
): AutomationRule {
  return {
    bookId: "book-1",
    name: input.id,
    targetScope: "file_import_candidate",
    matchMode: "all",
    isEnabled: true,
    sortOrder: 100,
    ...input,
  };
}

describe("V5.1 pure automation projection", () => {
  it("R-001..R-004 orders stages, lets later scalar actions win, and unions tags", () => {
    const projection = evaluateAutomationRules(context, [
      rule({
        id: "post",
        stage: "post",
        sortOrder: 1,
        conditions: [
          {
            id: "post-c",
            position: 0,
            field: "source_payee",
            operator: "contains",
            value: "amzn",
            isNegated: false,
          },
        ],
        actions: [
          {
            id: "post-a",
            position: 0,
            actionType: "set_note",
            value: "Reviewed",
          },
          {
            id: "post-tag",
            position: 1,
            actionType: "add_tag",
            value: "tag-online",
          },
        ],
      }),
      rule({
        id: "default-a",
        stage: "default",
        sortOrder: 20,
        conditions: [
          {
            id: "default-c",
            position: 0,
            field: "projected_payee",
            operator: "equals",
            value: "Amazon",
            isNegated: false,
          },
        ],
        actions: [
          {
            id: "default-category",
            position: 0,
            actionType: "set_category",
            value: "shopping",
          },
          {
            id: "default-tag",
            position: 1,
            actionType: "add_tag",
            value: "tag-online",
          },
          {
            id: "default-type",
            position: 2,
            actionType: "suggest_event_type",
            value: "expense",
          },
        ],
      }),
      rule({
        id: "pre",
        stage: "pre",
        sortOrder: 500,
        conditions: [
          {
            id: "pre-c",
            position: 0,
            field: "source_payee",
            operator: "contains",
            value: "AMZN",
            isNegated: false,
          },
        ],
        actions: [
          {
            id: "pre-a",
            position: 0,
            actionType: "set_payee",
            value: "Amazon",
          },
        ],
      }),
    ]);

    expect(projection).toEqual({
      projectedPayee: "Amazon",
      projectedCategoryId: "shopping",
      projectedTagIds: ["tag-online"],
      projectedNote: "Reviewed",
      projectedEventType: "expense",
      appliedRuleIds: ["pre", "default-a", "post"],
      warnings: [],
    });
  });

  it("R-005..R-008 supports ALL, ANY, negation, disabled rules, and deterministic output", () => {
    const rules = [
      rule({
        id: "any-negated",
        stage: "default",
        matchMode: "any",
        conditions: [
          {
            id: "direction",
            position: 0,
            field: "direction",
            operator: "equals",
            value: "in",
            isNegated: false,
          },
          {
            id: "memo",
            position: 1,
            field: "memo",
            operator: "contains",
            value: "refund",
            isNegated: true,
          },
        ],
        actions: [
          {
            id: "tag",
            position: 0,
            actionType: "add_tag",
            value: "tag-reviewed",
          },
        ],
      }),
      rule({
        id: "disabled",
        stage: "post",
        isEnabled: false,
        conditions: [
          {
            id: "disabled-c",
            position: 0,
            field: "source_payee",
            operator: "is_not_empty",
            value: "",
            isNegated: false,
          },
        ],
        actions: [
          {
            id: "disabled-a",
            position: 0,
            actionType: "set_payee",
            value: "Wrong",
          },
        ],
      }),
    ];
    expect(evaluateAutomationRules(context, rules)).toEqual(
      evaluateAutomationRules(context, [...rules].reverse()),
    );
    expect(evaluateAutomationRules(context, rules).projectedTagIds).toEqual([
      "tag-reviewed",
    ]);
  });

  it("compares amount conditions as exact bigint and warns on excess precision", () => {
    const rules = [
      rule({
        id: "amount",
        stage: "default",
        conditions: [
          {
            id: "amount-c",
            position: 0,
            field: "amount_abs",
            operator: "between",
            value: { min: "35.99", max: "36.00" },
            isNegated: false,
          },
        ],
        actions: [
          {
            id: "amount-a",
            position: 0,
            actionType: "set_note",
            value: "exact range",
          },
        ],
      }),
      rule({
        id: "excess",
        stage: "post",
        conditions: [
          {
            id: "excess-c",
            position: 0,
            field: "amount_abs",
            operator: "equals",
            value: "35.991",
            isNegated: false,
          },
        ],
        actions: [
          {
            id: "excess-a",
            position: 0,
            actionType: "set_note",
            value: "must not apply",
          },
        ],
      }),
    ];
    const projection = evaluateAutomationRules(context, rules);
    expect(projection.projectedNote).toBe("exact range");
    expect(projection.warnings).toHaveLength(1);
    expect(projection.warnings[0]).toContain("Rule excess");
  });

  it("normalizes Unicode NFKC, whitespace, and case without regex input", () => {
    expect(normalizeAutomationText("  ＡＭＺＮ\t Mktp  ")).toBe("amzn mktp");
  });
});
