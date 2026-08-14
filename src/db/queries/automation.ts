import { and, asc, eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import {
  automationRuleActions,
  automationRuleConditions,
  automationRules,
} from "../schema";

export function findAutomationRuleById(
  executor: DatabaseExecutor,
  ruleId: string,
) {
  return executor
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .get();
}

export function listAutomationRuleRowsForBook(
  executor: DatabaseExecutor,
  bookId: string,
  enabledOnly = false,
) {
  return executor
    .select()
    .from(automationRules)
    .where(
      enabledOnly
        ? and(
            eq(automationRules.bookId, bookId),
            eq(automationRules.isEnabled, true),
          )
        : eq(automationRules.bookId, bookId),
    )
    .orderBy(
      sql<number>`case ${automationRules.stage}
        when 'pre' then 0
        when 'default' then 1
        when 'post' then 2
        else 3
      end`,
      asc(automationRules.sortOrder),
      asc(automationRules.id),
    )
    .all();
}

export function listAutomationRuleConditions(
  executor: DatabaseExecutor,
  ruleId: string,
) {
  return executor
    .select()
    .from(automationRuleConditions)
    .where(eq(automationRuleConditions.ruleId, ruleId))
    .orderBy(
      asc(automationRuleConditions.position),
      asc(automationRuleConditions.id),
    )
    .all();
}

export function listAutomationRuleActions(
  executor: DatabaseExecutor,
  ruleId: string,
) {
  return executor
    .select()
    .from(automationRuleActions)
    .where(eq(automationRuleActions.ruleId, ruleId))
    .orderBy(asc(automationRuleActions.position), asc(automationRuleActions.id))
    .all();
}

export function enabledAutomationRulesReferenceCategory(
  executor: DatabaseExecutor,
  bookId: string,
  categoryId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: automationRules.id })
      .from(automationRuleActions)
      .innerJoin(
        automationRules,
        eq(automationRules.id, automationRuleActions.ruleId),
      )
      .where(
        and(
          eq(automationRules.bookId, bookId),
          eq(automationRules.isEnabled, true),
          eq(automationRuleActions.actionType, "set_category"),
          eq(automationRuleActions.valueJson, JSON.stringify(categoryId)),
        ),
      )
      .get(),
  );
}

export function enabledAutomationRulesReferenceTag(
  executor: DatabaseExecutor,
  bookId: string,
  tagId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: automationRules.id })
      .from(automationRuleActions)
      .innerJoin(
        automationRules,
        eq(automationRules.id, automationRuleActions.ruleId),
      )
      .where(
        and(
          eq(automationRules.bookId, bookId),
          eq(automationRules.isEnabled, true),
          eq(automationRuleActions.actionType, "add_tag"),
          eq(automationRuleActions.valueJson, JSON.stringify(tagId)),
        ),
      )
      .get(),
  );
}

export function enabledAutomationRulesReferenceAccount(
  executor: DatabaseExecutor,
  bookId: string,
  accountId: string,
): boolean {
  return Boolean(
    executor
      .select({ id: automationRules.id })
      .from(automationRuleConditions)
      .innerJoin(
        automationRules,
        eq(automationRules.id, automationRuleConditions.ruleId),
      )
      .where(
        and(
          eq(automationRules.bookId, bookId),
          eq(automationRules.isEnabled, true),
          eq(automationRuleConditions.field, "target_account"),
          eq(automationRuleConditions.valueJson, JSON.stringify(accountId)),
        ),
      )
      .get(),
  );
}

export function insertAutomationRule(
  executor: DatabaseExecutor,
  value: typeof automationRules.$inferInsert,
): void {
  executor.insert(automationRules).values(value).run();
}

export function updateAutomationRule(
  executor: DatabaseExecutor,
  ruleId: string,
  value: Partial<
    Pick<
      typeof automationRules.$inferInsert,
      "name" | "stage" | "matchMode" | "isEnabled" | "sortOrder" | "updatedAt"
    >
  >,
): void {
  executor
    .update(automationRules)
    .set(value)
    .where(eq(automationRules.id, ruleId))
    .run();
}

export function replaceAutomationRuleChildren(
  executor: DatabaseExecutor,
  ruleId: string,
  conditions: Array<typeof automationRuleConditions.$inferInsert>,
  actions: Array<typeof automationRuleActions.$inferInsert>,
): void {
  executor
    .delete(automationRuleConditions)
    .where(eq(automationRuleConditions.ruleId, ruleId))
    .run();
  executor
    .delete(automationRuleActions)
    .where(eq(automationRuleActions.ruleId, ruleId))
    .run();
  if (conditions.length > 0) {
    executor.insert(automationRuleConditions).values(conditions).run();
  }
  if (actions.length > 0) {
    executor.insert(automationRuleActions).values(actions).run();
  }
}

export function deleteAutomationRule(
  executor: DatabaseExecutor,
  ruleId: string,
): void {
  executor.delete(automationRules).where(eq(automationRules.id, ruleId)).run();
}
