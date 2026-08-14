import { assertDomain, DomainValidationError } from "./errors";
import { parseDecimalToAtomic } from "./money";

export type AutomationRuleStage = "pre" | "default" | "post";
export type AutomationRuleMatchMode = "all" | "any";
export type AutomationRuleScope = "file_import_candidate";
export type AutomationConditionField =
  | "source_payee"
  | "projected_payee"
  | "memo"
  | "file_profile"
  | "target_account"
  | "source_format"
  | "direction"
  | "amount_abs"
  | "identity_strength";
export type AutomationConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";
export type AutomationActionType =
  | "set_payee"
  | "set_category"
  | "add_tag"
  | "set_note"
  | "append_note"
  | "suggest_event_type";

export interface AutomationRuleCondition {
  id: string;
  position: number;
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: unknown;
  isNegated: boolean;
}

export interface AutomationRuleAction {
  id: string;
  position: number;
  actionType: AutomationActionType;
  value: unknown;
}

export interface AutomationRule {
  id: string;
  bookId: string;
  name: string;
  targetScope: AutomationRuleScope;
  stage: AutomationRuleStage;
  matchMode: AutomationRuleMatchMode;
  isEnabled: boolean;
  sortOrder: number;
  conditions: AutomationRuleCondition[];
  actions: AutomationRuleAction[];
}

export interface FileCandidateAutomationContext {
  bookId: string;
  connectionId: string;
  fileProfileId: string;
  sourceFormat: "csv" | "ofx" | "qfx" | "camt053";
  targetAccountId: string;
  assetId: string;
  assetCode: string;
  assetScale: number;
  direction: "in" | "out";
  sourcePayee: string | null;
  sourceMemo: string | null;
  sourceAmountAtomic: bigint;
  sourceDate: string;
  identityStrength: "strong" | "weak";
  candidateStatus: string;
}

export interface AutomationProjection {
  projectedPayee: string | null;
  projectedCategoryId: string | null;
  projectedTagIds: string[];
  projectedNote: string | null;
  projectedEventType: "expense" | "income" | "unknown";
  appliedRuleIds: string[];
  warnings: string[];
}

const STAGE_ORDER: Record<AutomationRuleStage, number> = {
  pre: 0,
  default: 1,
  post: 2,
};
const TEXT_FIELDS = new Set<AutomationConditionField>([
  "source_payee",
  "projected_payee",
  "memo",
]);
const TEXT_OPERATORS = new Set<AutomationConditionOperator>([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
]);
const ID_ENUM_FIELDS = new Set<AutomationConditionField>([
  "file_profile",
  "target_account",
  "source_format",
  "direction",
  "identity_strength",
]);
const AMOUNT_OPERATORS = new Set<AutomationConditionOperator>([
  "equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
]);

export function normalizeAutomationText(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

export function automationOperatorIsCompatible(
  field: AutomationConditionField,
  operator: AutomationConditionOperator,
): boolean {
  if (TEXT_FIELDS.has(field)) return TEXT_OPERATORS.has(operator);
  if (ID_ENUM_FIELDS.has(field)) {
    return operator === "equals" || operator === "not_equals";
  }
  return field === "amount_abs" && AMOUNT_OPERATORS.has(operator);
}

function stringValue(value: unknown, label: string): string {
  assertDomain(
    typeof value === "string",
    "AUTOMATION_VALUE_INVALID",
    `${label} must be a string.`,
  );
  return value;
}

function amountBetweenValue(value: unknown): { min: string; max: string } {
  assertDomain(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "AUTOMATION_AMOUNT_VALUE_INVALID",
    "Between amount condition must contain min and max decimal strings.",
  );
  const record = value as Record<string, unknown>;
  return {
    min: stringValue(record.min, "Between minimum"),
    max: stringValue(record.max, "Between maximum"),
  };
}

function textCondition(
  actual: string | null,
  operator: AutomationConditionOperator,
  rawValue: unknown,
): boolean {
  const normalizedActual = normalizeAutomationText(actual);
  if (operator === "is_empty") return normalizedActual.length === 0;
  if (operator === "is_not_empty") return normalizedActual.length > 0;
  const expected = normalizeAutomationText(
    stringValue(rawValue, "Text condition value"),
  );
  switch (operator) {
    case "equals":
      return normalizedActual === expected;
    case "not_equals":
      return normalizedActual !== expected;
    case "contains":
      return normalizedActual.includes(expected);
    case "not_contains":
      return !normalizedActual.includes(expected);
    case "starts_with":
      return normalizedActual.startsWith(expected);
    case "ends_with":
      return normalizedActual.endsWith(expected);
    default:
      return false;
  }
}

function contextValue(
  context: FileCandidateAutomationContext,
  projection: AutomationProjection,
  field: Exclude<AutomationConditionField, "amount_abs">,
): string | null {
  switch (field) {
    case "source_payee":
      return context.sourcePayee;
    case "projected_payee":
      return projection.projectedPayee;
    case "memo":
      return context.sourceMemo;
    case "file_profile":
      return context.fileProfileId;
    case "target_account":
      return context.targetAccountId;
    case "source_format":
      return context.sourceFormat;
    case "direction":
      return context.direction;
    case "identity_strength":
      return context.identityStrength;
  }
}

function amountCondition(
  context: FileCandidateAutomationContext,
  operator: AutomationConditionOperator,
  rawValue: unknown,
): boolean {
  const actual =
    context.sourceAmountAtomic < 0n
      ? -context.sourceAmountAtomic
      : context.sourceAmountAtomic;
  if (operator === "between") {
    const range = amountBetweenValue(rawValue);
    const min = parseDecimalToAtomic(range.min, context.assetScale);
    const max = parseDecimalToAtomic(range.max, context.assetScale);
    assertDomain(
      min >= 0n && max >= min,
      "AUTOMATION_AMOUNT_RANGE_INVALID",
      "Amount condition range must satisfy 0 <= min <= max.",
    );
    return actual >= min && actual <= max;
  }
  const expected = parseDecimalToAtomic(
    stringValue(rawValue, "Amount condition value"),
    context.assetScale,
  );
  assertDomain(
    expected >= 0n,
    "AUTOMATION_AMOUNT_VALUE_INVALID",
    "Amount condition value must be non-negative.",
  );
  switch (operator) {
    case "equals":
      return actual === expected;
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    default:
      return false;
  }
}

function conditionMatches(
  context: FileCandidateAutomationContext,
  projection: AutomationProjection,
  condition: AutomationRuleCondition,
): boolean {
  assertDomain(
    automationOperatorIsCompatible(condition.field, condition.operator),
    "AUTOMATION_OPERATOR_INVALID",
    `Operator ${condition.operator} is not valid for ${condition.field}.`,
  );
  let matched: boolean;
  if (condition.field === "amount_abs") {
    matched = amountCondition(context, condition.operator, condition.value);
  } else if (TEXT_FIELDS.has(condition.field)) {
    matched = textCondition(
      contextValue(context, projection, condition.field),
      condition.operator,
      condition.value,
    );
  } else {
    const actual = normalizeAutomationText(
      contextValue(context, projection, condition.field),
    );
    const expected = normalizeAutomationText(
      stringValue(condition.value, "Condition value"),
    );
    matched =
      condition.operator === "equals"
        ? actual === expected
        : actual !== expected;
  }
  return condition.isNegated ? !matched : matched;
}

function appendProjectedNote(
  current: string | null,
  value: string,
): string | null {
  const next = value.trim();
  if (next.length === 0) return current;
  const prior = current?.trim() ?? "";
  return prior.length === 0 ? next : `${prior}\n${next}`;
}

function applyAction(
  context: FileCandidateAutomationContext,
  projection: AutomationProjection,
  action: AutomationRuleAction,
  ruleId: string,
): void {
  const value = stringValue(action.value, `Action ${action.actionType} value`);
  switch (action.actionType) {
    case "set_payee":
      projection.projectedPayee = value.trim() || null;
      return;
    case "set_category":
      projection.projectedCategoryId = value;
      return;
    case "add_tag":
      if (!projection.projectedTagIds.includes(value)) {
        projection.projectedTagIds.push(value);
      }
      return;
    case "set_note":
      projection.projectedNote = value.trim() || null;
      return;
    case "append_note":
      projection.projectedNote = appendProjectedNote(
        projection.projectedNote,
        value,
      );
      return;
    case "suggest_event_type": {
      const expected = context.direction === "out" ? "expense" : "income";
      if (value !== expected) {
        projection.warnings.push(
          `Rule ${ruleId} event-type suggestion is incompatible with candidate direction.`,
        );
        return;
      }
      projection.projectedEventType = expected;
    }
  }
}

function ruleMatches(
  context: FileCandidateAutomationContext,
  projection: AutomationProjection,
  rule: AutomationRule,
): boolean {
  if (rule.conditions.length === 0) return false;
  const results = rule.conditions
    .toSorted(
      (left, right) =>
        left.position - right.position || left.id.localeCompare(right.id),
    )
    .map((condition) => conditionMatches(context, projection, condition));
  return rule.matchMode === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}

export function evaluateAutomationRules(
  context: FileCandidateAutomationContext,
  rules: readonly AutomationRule[],
): AutomationProjection {
  const projection: AutomationProjection = {
    projectedPayee: context.sourcePayee,
    projectedCategoryId: null,
    projectedTagIds: [],
    projectedNote: context.sourceMemo,
    projectedEventType: "unknown",
    appliedRuleIds: [],
    warnings: [],
  };
  const ordered = rules
    .filter(
      (rule) =>
        rule.isEnabled &&
        rule.bookId === context.bookId &&
        rule.targetScope === "file_import_candidate",
    )
    .toSorted(
      (left, right) =>
        STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage] ||
        left.sortOrder - right.sortOrder ||
        left.id.localeCompare(right.id),
    );
  for (const rule of ordered) {
    try {
      if (!ruleMatches(context, projection, rule)) continue;
      projection.appliedRuleIds.push(rule.id);
      for (const action of rule.actions.toSorted(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      )) {
        applyAction(context, projection, action, rule.id);
      }
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      projection.warnings.push(`Rule ${rule.id}: ${error.message}`);
    }
  }
  return projection;
}

export function possibleRuleDirections(
  rule: Pick<AutomationRule, "matchMode" | "conditions">,
): Array<"in" | "out"> {
  const directionConditions = rule.conditions.filter(
    (condition) => condition.field === "direction",
  );
  if (directionConditions.length === 0) return ["in", "out"];
  if (
    rule.matchMode === "any" &&
    rule.conditions.some((condition) => condition.field !== "direction")
  ) {
    return ["in", "out"];
  }
  return (["in", "out"] as const).filter((direction) => {
    const matches = directionConditions.map((condition) => {
      const expected = normalizeAutomationText(
        stringValue(condition.value, "Direction condition"),
      );
      let result =
        condition.operator === "equals"
          ? direction === expected
          : direction !== expected;
      if (condition.isNegated) result = !result;
      return result;
    });
    return rule.matchMode === "all"
      ? matches.every(Boolean)
      : matches.some(Boolean);
  });
}
