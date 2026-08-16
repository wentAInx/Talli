// HISTORICAL DESIGN CONTRACT ONLY. NOT CURRENT SOURCE OR API.
// Current source and migrations take precedence.

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

export type RecurringEventType = "expense" | "income";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringAmountMode = "exact" | "approx" | "range";
export type RecurringPayeeMatchMode = "any" | "exact" | "contains";
export type MonthlyDayMode = "fixed" | "last";

export interface RecurringItem {
  id: string;
  bookId: string;
  accountId: string;
  assetId: string;
  name: string;
  eventType: RecurringEventType;
  payeeText: string | null;
  payeeMatchMode: RecurringPayeeMatchMode;
  categoryId: string | null;
  tagIds: string[];
  note: string | null;
  amountMode: RecurringAmountMode;
  amountAtomic: bigint | null;
  toleranceBps: number | null;
  minAmountAtomic: bigint | null;
  maxAmountAtomic: bigint | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  anchorDate: string;
  monthlyDayMode: MonthlyDayMode | null;
  dateWindowBeforeDays: number;
  dateWindowAfterDays: number;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
}

export interface GeneratedOccurrence {
  recurringItemId: string;
  occurrenceDate: string;
  status: "linked" | "skipped" | "upcoming" | "due" | "overdue";
  linkedLedgerEventId: string | null;
}

export interface RecurringMatchSuggestion {
  recurringItemId: string;
  occurrenceDate: string;
  ledgerEventId?: string;
  candidateId?: string;
  score: number;
  reasons: string[];
}

/*
Services:

AutomationRuleService
- CRUD + ordering
- validates category/tag/account references
- preview(ruleDraft)

AutomationProjectionService
- pure deterministic projection for file candidate
- no writes

RecurringItemService
- CRUD/archive
- generate occurrences
- skip/unskip
- explicit link/unlink
- explicit post occurrence via V1 writer

RecurringMatchService
- suggestions only
- no automatic links

FileImportReadService / candidate page
- attaches AutomationProjection
- attaches RecurringMatchSuggestion

ExternalImportService
- accepts explicit payee/tag/category/note user choices
- optionally explicit recurring occurrence link
- all in same transaction
*/
