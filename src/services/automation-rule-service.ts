import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  deleteAutomationRule,
  findAccountWithAsset,
  findAutomationRuleById,
  findBookById,
  findCategoryById,
  findExternalConnection,
  findFileImportProfile,
  findTagById,
  insertAutomationRule,
  listAutomationRuleRowsForBook,
  listFileImportProfiles,
  listFileTransactionCandidates,
  replaceAutomationRuleChildren,
  updateAutomationRule,
} from "../db/queries";
import {
  automationOperatorIsCompatible,
  evaluateAutomationRules,
  possibleRuleDirections,
  type AutomationActionType,
  type AutomationConditionField,
  type AutomationConditionOperator,
  type AutomationProjection,
  type AutomationRule,
  type AutomationRuleMatchMode,
  type AutomationRuleStage,
} from "../domain/automation";
import { assertService } from "./errors";
import {
  buildFileCandidateAutomationContext,
  hydrateAutomationRule,
  hydrateAutomationRulesForBook,
} from "./automation-projection-service";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

const MAX_RULES_PER_BOOK = 1000;
const MAX_CONDITIONS = 50;
const MAX_ACTIONS = 20;
const PLAIN_UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export interface AutomationRuleDraftCondition {
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: unknown;
  isNegated?: boolean;
}

export interface AutomationRuleDraftAction {
  actionType: AutomationActionType;
  value: unknown;
}

export interface AutomationRuleDraft {
  id?: string;
  bookId: string;
  name: string;
  stage: AutomationRuleStage;
  matchMode: AutomationRuleMatchMode;
  isEnabled: boolean;
  sortOrder: number;
  conditions: AutomationRuleDraftCondition[];
  actions: AutomationRuleDraftAction[];
}

export interface AutomationRulePreview {
  matchedCandidateCount: number;
  evaluatedCandidateCount: number;
  samples: Array<{
    candidateId: string;
    sourcePayee: string | null;
    sourceMemo: string | null;
    sourceAmountAtomic: string;
    sourceDate: string;
    projection: AutomationProjection;
  }>;
}

function boundedString(
  value: unknown,
  label: string,
  max: number,
  allowEmpty = false,
): string {
  assertService(
    typeof value === "string",
    "AUTOMATION_VALUE_INVALID",
    `${label} must be text.`,
  );
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  assertService(
    (allowEmpty || normalized.length > 0) && normalized.length <= max,
    "AUTOMATION_VALUE_INVALID",
    `${label} ${allowEmpty ? "must not exceed" : "is required and must not exceed"} ${max} characters.`,
  );
  return normalized;
}

function decimalString(value: unknown, label: string): string {
  const normalized = boundedString(value, label, 200);
  assertService(
    PLAIN_UNSIGNED_DECIMAL.test(normalized),
    "AUTOMATION_AMOUNT_VALUE_INVALID",
    `${label} must be a non-negative plain decimal string.`,
  );
  return normalized;
}

function compareUnsignedDecimals(left: string, right: string): number {
  const [leftIntegerRaw, leftFractionRaw = ""] = left.split(".");
  const [rightIntegerRaw, rightFractionRaw = ""] = right.split(".");
  const leftInteger = leftIntegerRaw!.replace(/^0+(?=\d)/, "");
  const rightInteger = rightIntegerRaw!.replace(/^0+(?=\d)/, "");
  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length - rightInteger.length;
  }
  const integerOrder = leftInteger.localeCompare(rightInteger);
  if (integerOrder !== 0) return integerOrder;
  const fractionLength = Math.max(
    leftFractionRaw.length,
    rightFractionRaw.length,
  );
  return leftFractionRaw
    .padEnd(fractionLength, "0")
    .localeCompare(rightFractionRaw.padEnd(fractionLength, "0"));
}

function validateReferenceCondition(
  executor: DatabaseExecutor,
  bookId: string,
  field: AutomationConditionField,
  value: string,
  enabled: boolean,
): void {
  if (field === "file_profile") {
    const profile = findFileImportProfile(executor, value);
    const connection = profile
      ? findExternalConnection(executor, profile.connectionId)
      : null;
    assertService(
      profile &&
        connection?.provider === "file_import" &&
        connection.bookId === bookId &&
        (!enabled || connection.isEnabled),
      "AUTOMATION_PROFILE_INVALID",
      "Rule file profile must be an available file-import profile in the same book.",
    );
  }
  if (field === "target_account") {
    const account = findAccountWithAsset(executor, value);
    assertService(
      account &&
        account.account.bookId === bookId &&
        (!enabled ||
          (!account.account.isArchived && !account.asset.isArchived)),
      "AUTOMATION_ACCOUNT_INVALID",
      "Rule target account must be an active account in the same book.",
    );
  }
}

function normalizedCondition(
  executor: DatabaseExecutor,
  draft: AutomationRuleDraft,
  condition: AutomationRuleDraftCondition,
  position: number,
): AutomationRule["conditions"][number] {
  assertService(
    automationOperatorIsCompatible(condition.field, condition.operator),
    "AUTOMATION_OPERATOR_INVALID",
    `Operator ${condition.operator} is not valid for ${condition.field}.`,
  );
  let value: unknown;
  if (condition.field === "amount_abs") {
    if (condition.operator === "between") {
      assertService(
        condition.value !== null &&
          typeof condition.value === "object" &&
          !Array.isArray(condition.value),
        "AUTOMATION_AMOUNT_VALUE_INVALID",
        "Between amount condition requires min and max.",
      );
      const record = condition.value as Record<string, unknown>;
      const min = decimalString(record.min, "Minimum amount");
      const max = decimalString(record.max, "Maximum amount");
      assertService(
        compareUnsignedDecimals(min, max) <= 0,
        "AUTOMATION_AMOUNT_RANGE_INVALID",
        "Amount condition range must satisfy min <= max.",
      );
      value = { min, max };
    } else {
      value = decimalString(condition.value, "Amount condition value");
    }
  } else if (
    condition.operator === "is_empty" ||
    condition.operator === "is_not_empty"
  ) {
    value = "";
  } else {
    value = boundedString(condition.value, "Condition value", 500);
  }
  if (condition.field === "source_format") {
    assertService(
      ["csv", "ofx", "qfx", "camt053"].includes(value as string),
      "AUTOMATION_ENUM_VALUE_INVALID",
      "Source format condition is invalid.",
    );
  } else if (condition.field === "direction") {
    assertService(
      value === "in" || value === "out",
      "AUTOMATION_ENUM_VALUE_INVALID",
      "Direction condition is invalid.",
    );
  } else if (condition.field === "identity_strength") {
    assertService(
      value === "strong" || value === "weak",
      "AUTOMATION_ENUM_VALUE_INVALID",
      "Identity strength condition is invalid.",
    );
  }
  if (typeof value === "string") {
    validateReferenceCondition(
      executor,
      draft.bookId,
      condition.field,
      value,
      draft.isEnabled,
    );
  }
  return {
    id: `draft-condition-${position}`,
    position,
    field: condition.field,
    operator: condition.operator,
    value,
    isNegated: condition.isNegated === true,
  };
}

function normalizeDraft(
  executor: DatabaseExecutor,
  draft: AutomationRuleDraft,
): AutomationRule {
  assertService(
    findBookById(executor, draft.bookId),
    "BOOK_NOT_FOUND",
    "Automation rule book was not found.",
  );
  assertService(
    ["pre", "default", "post"].includes(draft.stage),
    "AUTOMATION_STAGE_INVALID",
    "Automation stage is invalid.",
  );
  assertService(
    draft.matchMode === "all" || draft.matchMode === "any",
    "AUTOMATION_MATCH_MODE_INVALID",
    "Automation match mode is invalid.",
  );
  assertService(
    Number.isInteger(draft.sortOrder) && Math.abs(draft.sortOrder) <= 1_000_000,
    "AUTOMATION_SORT_ORDER_INVALID",
    "Automation sort order must be a bounded integer.",
  );
  assertService(
    draft.conditions.length >= 1 && draft.conditions.length <= MAX_CONDITIONS,
    "AUTOMATION_CONDITION_COUNT_INVALID",
    `Rules require 1 to ${MAX_CONDITIONS} conditions.`,
  );
  assertService(
    draft.actions.length >= 1 && draft.actions.length <= MAX_ACTIONS,
    "AUTOMATION_ACTION_COUNT_INVALID",
    `Rules require 1 to ${MAX_ACTIONS} actions.`,
  );
  const normalized: AutomationRule = {
    id: draft.id ?? "draft-rule",
    bookId: draft.bookId,
    name: boundedString(draft.name, "Rule name", 120),
    targetScope: "file_import_candidate",
    stage: draft.stage,
    matchMode: draft.matchMode,
    isEnabled: draft.isEnabled,
    sortOrder: draft.sortOrder,
    conditions: draft.conditions.map((condition, position) =>
      normalizedCondition(executor, draft, condition, position),
    ),
    actions: [],
  };
  const possibleDirections = possibleRuleDirections(normalized);
  normalized.actions = draft.actions.map((action, position) => {
    let value: string;
    if (action.actionType === "set_payee") {
      value = boundedString(action.value, "Projected payee", 200);
    } else if (
      action.actionType === "set_note" ||
      action.actionType === "append_note"
    ) {
      value = boundedString(action.value, "Projected note", 2000, true);
    } else if (action.actionType === "set_category") {
      value = boundedString(action.value, "Category id", 200);
      const category = findCategoryById(executor, value);
      assertService(
        category &&
          category.bookId === draft.bookId &&
          (!draft.isEnabled || !category.isArchived),
        "AUTOMATION_CATEGORY_INVALID",
        "Rule category must be available in the same book.",
      );
      const compatible = possibleDirections.every((direction) => {
        const expected = direction === "out" ? "expense" : "income";
        return (
          category.categoryType === "both" || category.categoryType === expected
        );
      });
      assertService(
        compatible,
        "AUTOMATION_CATEGORY_DIRECTION_INVALID",
        "Rule category is incompatible with a direction the rule can match.",
      );
    } else if (action.actionType === "add_tag") {
      value = boundedString(action.value, "Tag id", 200);
      const tag = findTagById(executor, value);
      assertService(
        tag &&
          tag.bookId === draft.bookId &&
          (!draft.isEnabled || !tag.isArchived),
        "AUTOMATION_TAG_INVALID",
        "Rule tag must be available in the same book.",
      );
    } else {
      value = boundedString(action.value, "Suggested event type", 20);
      assertService(
        value === "expense" || value === "income",
        "AUTOMATION_EVENT_TYPE_INVALID",
        "Rules may suggest Expense or Income only.",
      );
      const requiredDirection = value === "expense" ? "out" : "in";
      assertService(
        possibleDirections.length > 0 &&
          possibleDirections.every(
            (direction) => direction === requiredDirection,
          ),
        "AUTOMATION_EVENT_TYPE_DIRECTION_INVALID",
        "Event-type suggestion requires a rule constrained to the matching direction.",
      );
    }
    return {
      id: `draft-action-${position}`,
      position,
      actionType: action.actionType,
      value,
    };
  });
  return normalized;
}

function allBookCandidateIds(executor: DatabaseExecutor, bookId: string) {
  return listFileImportProfiles(executor)
    .filter((profile) => {
      const connection = findExternalConnection(executor, profile.connectionId);
      return (
        connection?.provider === "file_import" && connection.bookId === bookId
      );
    })
    .flatMap((profile) =>
      listFileTransactionCandidates(executor, profile.connectionId)
        .filter(
          (candidate) =>
            candidate.status === "pending" ||
            candidate.status === "needs_mapping",
        )
        .map((candidate) => candidate.id),
    )
    .sort((left, right) => left.localeCompare(right));
}

export class AutomationRuleService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  list(bookId: string): AutomationRule[] {
    return hydrateAutomationRulesForBook(this.context.db, bookId);
  }

  get(ruleId: string): AutomationRule | null {
    return hydrateAutomationRule(this.context.db, ruleId);
  }

  preview(draft: AutomationRuleDraft): AutomationRulePreview {
    const normalized = normalizeDraft(this.context.db, {
      ...draft,
      isEnabled: true,
    });
    const existing = hydrateAutomationRulesForBook(
      this.context.db,
      draft.bookId,
      true,
    ).filter((rule) => rule.id !== normalized.id);
    const rules = [...existing, normalized];
    let matchedCandidateCount = 0;
    const samples: AutomationRulePreview["samples"] = [];
    const candidateIds = allBookCandidateIds(this.context.db, draft.bookId);
    for (const candidateId of candidateIds) {
      const context = buildFileCandidateAutomationContext(
        this.context.db,
        candidateId,
      );
      const projection = evaluateAutomationRules(context, rules);
      if (!projection.appliedRuleIds.includes(normalized.id)) continue;
      matchedCandidateCount += 1;
      if (samples.length < 20) {
        samples.push({
          candidateId,
          sourcePayee: context.sourcePayee,
          sourceMemo: context.sourceMemo,
          sourceAmountAtomic: context.sourceAmountAtomic.toString(),
          sourceDate: context.sourceDate,
          projection,
        });
      }
    }
    return {
      matchedCandidateCount,
      evaluatedCandidateCount: candidateIds.length,
      samples,
    };
  }

  save(draft: AutomationRuleDraft): string {
    return this.context.db.transaction(
      (transaction) => {
        const normalized = normalizeDraft(transaction, draft);
        const existing = draft.id
          ? findAutomationRuleById(transaction, draft.id)
          : null;
        if (draft.id) {
          assertService(
            existing && existing.bookId === draft.bookId,
            "AUTOMATION_RULE_NOT_FOUND",
            "Automation rule was not found in this book.",
          );
        }
        if (normalized.isEnabled && !existing?.isEnabled) {
          const enabledCount = listAutomationRuleRowsForBook(
            transaction,
            draft.bookId,
            true,
          ).length;
          assertService(
            enabledCount < MAX_RULES_PER_BOOK,
            "AUTOMATION_RULE_LIMIT",
            `A book can enable at most ${MAX_RULES_PER_BOOK} rules.`,
          );
        }
        const now = runtimeNow(this.runtime);
        const ruleId = existing?.id ?? this.runtime.id();
        if (existing) {
          updateAutomationRule(transaction, ruleId, {
            name: normalized.name,
            stage: normalized.stage,
            matchMode: normalized.matchMode,
            isEnabled: normalized.isEnabled,
            sortOrder: normalized.sortOrder,
            updatedAt: now,
          });
        } else {
          insertAutomationRule(transaction, {
            id: ruleId,
            bookId: normalized.bookId,
            name: normalized.name,
            targetScope: "file_import_candidate",
            stage: normalized.stage,
            matchMode: normalized.matchMode,
            isEnabled: normalized.isEnabled,
            sortOrder: normalized.sortOrder,
            createdAt: now,
            updatedAt: now,
          });
        }
        replaceAutomationRuleChildren(
          transaction,
          ruleId,
          normalized.conditions.map((condition) => ({
            id: this.runtime.id(),
            ruleId,
            position: condition.position,
            field: condition.field,
            operator: condition.operator,
            valueJson: JSON.stringify(condition.value),
            isNegated: condition.isNegated,
          })),
          normalized.actions.map((action) => ({
            id: this.runtime.id(),
            ruleId,
            position: action.position,
            actionType: action.actionType,
            valueJson: JSON.stringify(action.value),
          })),
        );
        return ruleId;
      },
      { behavior: "immediate" },
    );
  }

  setEnabled(ruleId: string, isEnabled: boolean): void {
    const rule = this.get(ruleId);
    assertService(
      rule,
      "AUTOMATION_RULE_NOT_FOUND",
      "Automation rule was not found.",
    );
    this.save({
      id: rule.id,
      bookId: rule.bookId,
      name: rule.name,
      stage: rule.stage,
      matchMode: rule.matchMode,
      isEnabled,
      sortOrder: rule.sortOrder,
      conditions: rule.conditions,
      actions: rule.actions,
    });
  }

  duplicate(ruleId: string): string {
    const rule = this.get(ruleId);
    assertService(
      rule,
      "AUTOMATION_RULE_NOT_FOUND",
      "Automation rule was not found.",
    );
    return this.save({
      bookId: rule.bookId,
      name: `${rule.name} copy`.slice(0, 120),
      stage: rule.stage,
      matchMode: rule.matchMode,
      isEnabled: false,
      sortOrder: rule.sortOrder + 1,
      conditions: rule.conditions,
      actions: rule.actions,
    });
  }

  move(ruleId: string, direction: "up" | "down"): void {
    this.context.db.transaction(
      (transaction) => {
        const current = findAutomationRuleById(transaction, ruleId);
        assertService(
          current,
          "AUTOMATION_RULE_NOT_FOUND",
          "Automation rule was not found.",
        );
        const peers = listAutomationRuleRowsForBook(
          transaction,
          current.bookId,
        ).filter((rule) => rule.stage === current.stage);
        const index = peers.findIndex((rule) => rule.id === current.id);
        const otherIndex = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || otherIndex < 0 || otherIndex >= peers.length) return;
        const reordered = [...peers];
        [reordered[index], reordered[otherIndex]] = [
          reordered[otherIndex]!,
          reordered[index]!,
        ];
        const now = runtimeNow(this.runtime);
        reordered.forEach((rule, position) =>
          updateAutomationRule(transaction, rule.id, {
            sortOrder: (position + 1) * 100,
            updatedAt: now,
          }),
        );
      },
      { behavior: "immediate" },
    );
  }

  deleteDisabled(ruleId: string): void {
    this.context.db.transaction(
      (transaction) => {
        const rule = findAutomationRuleById(transaction, ruleId);
        assertService(
          rule && !rule.isEnabled,
          "AUTOMATION_RULE_DELETE_FORBIDDEN",
          "Disable a rule before deleting it.",
        );
        deleteAutomationRule(transaction, ruleId);
      },
      { behavior: "immediate" },
    );
  }
}
