import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  findAutomationRuleById,
  findExternalCandidate,
  findFileImportSourceDetail,
  listAutomationRuleActions,
  listAutomationRuleConditions,
  listAutomationRuleRowsForBook,
} from "../db/queries";
import {
  evaluateAutomationRules,
  type AutomationProjection,
  type AutomationRule,
  type FileCandidateAutomationContext,
} from "../domain/automation";
import { ServiceError } from "./errors";
import { assertStoredFileImportCandidateProvenance } from "./file-import-provenance-integrity";

function parseStoredJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ServiceError(
      "AUTOMATION_STORED_JSON_INVALID",
      `Stored ${label} is not valid JSON.`,
    );
  }
}

export function hydrateAutomationRule(
  executor: DatabaseExecutor,
  ruleId: string,
): AutomationRule | null {
  const row = findAutomationRuleById(executor, ruleId);
  if (!row) return null;
  return {
    ...row,
    conditions: listAutomationRuleConditions(executor, ruleId).map(
      (condition) => ({
        id: condition.id,
        position: condition.position,
        field: condition.field,
        operator: condition.operator,
        value: parseStoredJson(condition.valueJson, "rule condition"),
        isNegated: condition.isNegated,
      }),
    ),
    actions: listAutomationRuleActions(executor, ruleId).map((action) => ({
      id: action.id,
      position: action.position,
      actionType: action.actionType,
      value: parseStoredJson(action.valueJson, "rule action"),
    })),
  };
}

export function hydrateAutomationRulesForBook(
  executor: DatabaseExecutor,
  bookId: string,
  enabledOnly = false,
): AutomationRule[] {
  return listAutomationRuleRowsForBook(executor, bookId, enabledOnly).map(
    (row) => hydrateAutomationRule(executor, row.id)!,
  );
}

export function buildFileCandidateAutomationContext(
  executor: DatabaseExecutor,
  candidateId: string,
): FileCandidateAutomationContext {
  const provenance = assertStoredFileImportCandidateProvenance(
    executor,
    candidateId,
  );
  const candidate = findExternalCandidate(executor, candidateId)!;
  const sourceDetail = findFileImportSourceDetail(
    executor,
    provenance.source.id,
  )!;
  return {
    bookId: provenance.connection.bookId,
    connectionId: provenance.connection.id,
    fileProfileId: provenance.profile.connectionId,
    sourceFormat: provenance.profile
      .format as FileCandidateAutomationContext["sourceFormat"],
    targetAccountId: provenance.targetAccount.id,
    assetId: provenance.targetAsset.id,
    assetCode: provenance.targetAsset.code,
    assetScale: provenance.targetAsset.scale,
    direction: provenance.candidateDetail.direction as "in" | "out",
    sourcePayee: provenance.candidateDetail.normalizedPayee,
    sourceMemo: provenance.candidateDetail.memo,
    sourceAmountAtomic: provenance.signedAtomic,
    sourceDate: provenance.candidateDetail.sourceDateText,
    identityStrength: sourceDetail.identityStrength,
    candidateStatus: candidate.status,
  };
}

export function projectFileCandidate(
  executor: DatabaseExecutor,
  candidateId: string,
  rules?: readonly AutomationRule[],
): AutomationProjection {
  const context = buildFileCandidateAutomationContext(executor, candidateId);
  return evaluateAutomationRules(
    context,
    rules ?? hydrateAutomationRulesForBook(executor, context.bookId, true),
  );
}

export class AutomationProjectionService {
  constructor(private readonly context: DatabaseContext) {}

  projectCandidate(candidateId: string): AutomationProjection {
    return projectFileCandidate(this.context.db, candidateId);
  }
}
