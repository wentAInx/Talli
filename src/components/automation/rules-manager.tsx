"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Stage = "pre" | "default" | "post";
type MatchMode = "all" | "any";
type Field =
  | "source_payee"
  | "projected_payee"
  | "memo"
  | "file_profile"
  | "target_account"
  | "source_format"
  | "direction"
  | "amount_abs"
  | "identity_strength";
type Operator =
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
type ActionType =
  | "set_payee"
  | "set_category"
  | "add_tag"
  | "set_note"
  | "append_note"
  | "suggest_event_type";

export interface RuleView {
  id: string;
  bookId: string;
  name: string;
  stage: Stage;
  matchMode: MatchMode;
  isEnabled: boolean;
  sortOrder: number;
  conditions: Array<{
    id: string;
    field: Field;
    operator: Operator;
    value: unknown;
    isNegated: boolean;
  }>;
  actions: Array<{
    id: string;
    actionType: ActionType;
    value: unknown;
  }>;
}

interface EditorCondition {
  key: string;
  field: Field;
  operator: Operator;
  value: unknown;
  isNegated: boolean;
}

interface EditorAction {
  key: string;
  actionType: ActionType;
  value: unknown;
}

interface DraftState {
  id?: string;
  name: string;
  stage: Stage;
  matchMode: MatchMode;
  isEnabled: boolean;
  sortOrder: number;
  conditions: EditorCondition[];
  actions: EditorAction[];
}

interface PreviewResult {
  matchedCandidateCount: number;
  evaluatedCandidateCount: number;
  samples: Array<{
    candidateId: string;
    sourcePayee: string | null;
    sourceMemo: string | null;
    projection: {
      projectedPayee: string | null;
      projectedCategoryId: string | null;
      projectedTagIds: string[];
      projectedNote: string | null;
      projectedEventType: string;
      appliedRuleIds: string[];
      warnings: string[];
    };
  }>;
}

const FIELD_LABELS: Record<Field, string> = {
  source_payee: "Source payee",
  projected_payee: "Projected payee",
  memo: "Memo",
  file_profile: "File profile",
  target_account: "Target account",
  source_format: "Source format",
  direction: "Direction",
  amount_abs: "Absolute amount",
  identity_strength: "Identity strength",
};
const ACTION_LABELS: Record<ActionType, string> = {
  set_payee: "Set payee",
  set_category: "Set category",
  add_tag: "Add tag",
  set_note: "Set note",
  append_note: "Append note",
  suggest_event_type: "Suggest event type",
};
const TEXT_OPERATORS: Operator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
];
const ID_OPERATORS: Operator[] = ["equals", "not_equals"];
const AMOUNT_OPERATORS: Operator[] = [
  "equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
];

let editorKeySequence = 0;

function editorKey(): string {
  editorKeySequence += 1;
  return `rule-editor-${editorKeySequence}`;
}

function emptyDraft(): DraftState {
  return {
    name: "",
    stage: "default",
    matchMode: "all",
    isEnabled: true,
    sortOrder: 100,
    conditions: [
      {
        key: editorKey(),
        field: "source_payee",
        operator: "contains",
        value: "",
        isNegated: false,
      },
    ],
    actions: [{ key: editorKey(), actionType: "set_payee", value: "" }],
  };
}

function operatorsFor(field: Field): Operator[] {
  if (field === "amount_abs") return AMOUNT_OPERATORS;
  if (
    field === "source_payee" ||
    field === "projected_payee" ||
    field === "memo"
  ) {
    return TEXT_OPERATORS;
  }
  return ID_OPERATORS;
}

async function postAutomation(body: unknown) {
  const response = await fetch("/api/automation/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    result?: unknown;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Automation request failed.");
  }
  return payload.result;
}

function apiDraft(bookId: string, draft: DraftState) {
  return {
    id: draft.id,
    bookId,
    name: draft.name,
    stage: draft.stage,
    matchMode: draft.matchMode,
    isEnabled: draft.isEnabled,
    sortOrder: draft.sortOrder,
    conditions: draft.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value:
        condition.operator === "is_empty" ||
        condition.operator === "is_not_empty"
          ? ""
          : condition.value,
      isNegated: condition.isNegated,
    })),
    actions: draft.actions.map((action) => ({
      actionType: action.actionType,
      value: action.value,
    })),
  };
}

export function RulesManager({
  bookId,
  rules,
  accounts,
  categories,
  tags,
  profiles,
}: {
  bookId: string;
  rules: RuleView[];
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  profiles: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState>(() => emptyDraft());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(rule: RuleView): void {
    setDraft({
      id: rule.id,
      name: rule.name,
      stage: rule.stage,
      matchMode: rule.matchMode,
      isEnabled: rule.isEnabled,
      sortOrder: rule.sortOrder,
      conditions: rule.conditions.map((condition) => ({
        ...condition,
        key: condition.id,
      })),
      actions: rule.actions.map((action) => ({ ...action, key: action.id })),
    });
    setPreview(null);
    setError(null);
    document
      .getElementById("rule-editor")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  async function mutate(body: unknown, refresh = true): Promise<unknown> {
    setPending(true);
    setError(null);
    try {
      const result = await postAutomation(body);
      if (refresh) router.refresh();
      return result;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Automation request failed.",
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  async function save(): Promise<void> {
    const result = await mutate({
      action: "save",
      draft: apiDraft(bookId, draft),
    });
    if (result) {
      setDraft(emptyDraft());
      setPreview(null);
    }
  }

  async function runPreview(): Promise<void> {
    const result = await mutate(
      { action: "preview", draft: apiDraft(bookId, draft) },
      false,
    );
    if (result) setPreview(result as PreviewResult);
  }

  return (
    <div className="automation-workspace">
      <section className="content-section automation-list-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Definitions only</p>
            <h2>Rules</h2>
          </div>
          <span>{rules.length} total</span>
        </div>
        {rules.length === 0 ? (
          <p className="empty-state">
            No rules yet. Create the first deterministic projection below.
          </p>
        ) : (
          <div className="automation-rule-list">
            {rules.map((rule) => (
              <article className="automation-rule-row" key={rule.id}>
                <div>
                  <div className="automation-rule-title">
                    <span
                      className={`rule-state ${rule.isEnabled ? "enabled" : "disabled"}`}
                    >
                      {rule.isEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="rule-stage">{rule.stage}</span>
                    <strong>{rule.name}</strong>
                  </div>
                  <p>
                    {rule.matchMode.toUpperCase()} · {rule.conditions.length}{" "}
                    condition(s) · {rule.actions.length} action(s) · file_import
                    candidates
                  </p>
                </div>
                <div className="inline-actions rule-row-actions">
                  <button
                    className="secondary-button"
                    onClick={() => edit(rule)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() =>
                      void mutate({
                        action: "move",
                        ruleId: rule.id,
                        direction: "up",
                      })
                    }
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() =>
                      void mutate({
                        action: "move",
                        ruleId: rule.id,
                        direction: "down",
                      })
                    }
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() =>
                      void mutate({ action: "duplicate", ruleId: rule.id })
                    }
                    type="button"
                  >
                    Duplicate
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() =>
                      void mutate({
                        action: "set_enabled",
                        ruleId: rule.id,
                        isEnabled: !rule.isEnabled,
                      })
                    }
                    type="button"
                  >
                    {rule.isEnabled ? "Disable" : "Enable"}
                  </button>
                  {!rule.isEnabled ? (
                    <button
                      className="danger-button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm("Delete this disabled rule?")) {
                          void mutate({ action: "delete", ruleId: rule.id });
                        }
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="automation-editor-grid" id="rule-editor">
        <section className="content-section rule-editor-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pure deterministic evaluator</p>
              <h2>{draft.id ? "Edit rule" : "Create rule"}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setDraft(emptyDraft());
                setPreview(null);
              }}
              type="button"
            >
              Reset
            </button>
          </div>
          <div className="field-grid field-grid-two">
            <label className="field">
              <span>Name</span>
              <input
                maxLength={120}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                value={draft.name}
              />
            </label>
            <label className="field">
              <span>Stage</span>
              <select
                onChange={(event) =>
                  setDraft({ ...draft, stage: event.target.value as Stage })
                }
                value={draft.stage}
              >
                <option value="pre">pre</option>
                <option value="default">default</option>
                <option value="post">post</option>
              </select>
            </label>
            <label className="field">
              <span>Match mode</span>
              <select
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    matchMode: event.target.value as MatchMode,
                  })
                }
                value={draft.matchMode}
              >
                <option value="all">ALL</option>
                <option value="any">ANY</option>
              </select>
            </label>
            <label className="field">
              <span>Sort order</span>
              <input
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
                }
                type="number"
                value={draft.sortOrder}
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              checked={draft.isEnabled}
              onChange={(event) =>
                setDraft({ ...draft, isEnabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>Enabled after save</span>
          </label>

          <div className="rule-builder-section">
            <div className="section-heading compact-heading">
              <h3>Conditions</h3>
              <button
                className="secondary-button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    conditions: [
                      ...draft.conditions,
                      {
                        key: editorKey(),
                        field: "source_payee",
                        operator: "contains",
                        value: "",
                        isNegated: false,
                      },
                    ],
                  })
                }
                type="button"
              >
                + Condition
              </button>
            </div>
            {draft.conditions.map((condition, index) => (
              <ConditionEditor
                accounts={accounts}
                condition={condition}
                key={condition.key}
                onChange={(next) => {
                  const conditions = [...draft.conditions];
                  conditions[index] = next;
                  setDraft({ ...draft, conditions });
                }}
                onRemove={() =>
                  setDraft({
                    ...draft,
                    conditions: draft.conditions.filter(
                      (row) => row.key !== condition.key,
                    ),
                  })
                }
                profiles={profiles}
              />
            ))}
          </div>

          <div className="rule-builder-section">
            <div className="section-heading compact-heading">
              <h3>Actions</h3>
              <button
                className="secondary-button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    actions: [
                      ...draft.actions,
                      { key: editorKey(), actionType: "set_payee", value: "" },
                    ],
                  })
                }
                type="button"
              >
                + Action
              </button>
            </div>
            {draft.actions.map((action, index) => (
              <ActionEditor
                action={action}
                categories={categories}
                key={action.key}
                onChange={(next) => {
                  const actions = [...draft.actions];
                  actions[index] = next;
                  setDraft({ ...draft, actions });
                }}
                onRemove={() =>
                  setDraft({
                    ...draft,
                    actions: draft.actions.filter(
                      (row) => row.key !== action.key,
                    ),
                  })
                }
                tags={tags}
              />
            ))}
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="inline-actions">
            <button
              className="primary-button"
              disabled={pending}
              onClick={() => void save()}
              type="button"
            >
              {pending ? "Working…" : "Save rule"}
            </button>
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => void runPreview()}
              type="button"
            >
              Preview
            </button>
          </div>
          <p className="boundary-note">
            Rules only compute a projection. They never create or edit Ledger
            facts.
          </p>
        </section>

        <section className="content-section rule-preview-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Read-only sample</p>
              <h2>Preview</h2>
            </div>
            <span>
              {preview
                ? `${preview.matchedCandidateCount}/${preview.evaluatedCandidateCount} matched`
                : "Not run"}
            </span>
          </div>
          {preview ? (
            preview.samples.length > 0 ? (
              <div className="rule-preview-samples">
                {preview.samples.map((sample) => (
                  <article key={sample.candidateId}>
                    <code>{sample.candidateId}</code>
                    <dl>
                      <div>
                        <dt>Before</dt>
                        <dd>
                          {sample.sourcePayee ?? sample.sourceMemo ?? "empty"}
                        </dd>
                      </div>
                      <div>
                        <dt>After</dt>
                        <dd>
                          {sample.projection.projectedPayee ?? "empty"} ·{" "}
                          {sample.projection.projectedEventType}
                        </dd>
                      </div>
                      <div>
                        <dt>Order</dt>
                        <dd>{sample.projection.appliedRuleIds.join(" → ")}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                No unresolved file candidate matched.
              </p>
            )
          ) : (
            <p className="empty-state">
              Preview evaluates unresolved file candidates without writing
              candidates or Ledger.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  accounts,
  profiles,
}: {
  condition: EditorCondition;
  onChange: (value: EditorCondition) => void;
  onRemove: () => void;
  accounts: Array<{ id: string; name: string }>;
  profiles: Array<{ id: string; name: string }>;
}) {
  const operators = operatorsFor(condition.field);
  const emptyOperator =
    condition.operator === "is_empty" || condition.operator === "is_not_empty";
  return (
    <div className="rule-builder-row">
      <select
        aria-label="Condition field"
        onChange={(event) => {
          const field = event.target.value as Field;
          onChange({
            ...condition,
            field,
            operator: operatorsFor(field)[0]!,
            value: field === "amount_abs" ? "0" : "",
          });
        }}
        value={condition.field}
      >
        {Object.entries(FIELD_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Condition operator"
        onChange={(event) => {
          const operator = event.target.value as Operator;
          onChange({
            ...condition,
            operator,
            value:
              operator === "between" ? { min: "0", max: "0" } : condition.value,
          });
        }}
        value={condition.operator}
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {operator}
          </option>
        ))}
      </select>
      {emptyOperator ? (
        <span className="read-only-value">No value</span>
      ) : condition.operator === "between" ? (
        <div className="range-value-inputs">
          <input
            aria-label="Minimum amount"
            inputMode="decimal"
            onChange={(event) =>
              onChange({
                ...condition,
                value: {
                  min: event.target.value,
                  max:
                    typeof condition.value === "object" &&
                    condition.value &&
                    "max" in condition.value
                      ? String(condition.value.max)
                      : "0",
                },
              })
            }
            value={
              typeof condition.value === "object" &&
              condition.value &&
              "min" in condition.value
                ? String(condition.value.min)
                : "0"
            }
          />
          <input
            aria-label="Maximum amount"
            inputMode="decimal"
            onChange={(event) =>
              onChange({
                ...condition,
                value: {
                  min:
                    typeof condition.value === "object" &&
                    condition.value &&
                    "min" in condition.value
                      ? String(condition.value.min)
                      : "0",
                  max: event.target.value,
                },
              })
            }
            value={
              typeof condition.value === "object" &&
              condition.value &&
              "max" in condition.value
                ? String(condition.value.max)
                : "0"
            }
          />
        </div>
      ) : condition.field === "file_profile" ? (
        <select
          aria-label="File profile"
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          value={String(condition.value)}
        >
          <option value="">Select profile</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      ) : condition.field === "target_account" ? (
        <select
          aria-label="Target account"
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          value={String(condition.value)}
        >
          <option value="">Select account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      ) : condition.field === "source_format" ? (
        <select
          aria-label="Source format"
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          value={String(condition.value)}
        >
          {["csv", "ofx", "qfx", "camt053"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      ) : condition.field === "direction" ? (
        <select
          aria-label="Direction"
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          value={String(condition.value)}
        >
          <option value="in">in</option>
          <option value="out">out</option>
        </select>
      ) : condition.field === "identity_strength" ? (
        <select
          aria-label="Identity strength"
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          value={String(condition.value)}
        >
          <option value="strong">strong</option>
          <option value="weak">weak</option>
        </select>
      ) : (
        <input
          aria-label="Condition value"
          inputMode={condition.field === "amount_abs" ? "decimal" : undefined}
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          value={String(condition.value)}
        />
      )}
      <label className="compact-checkbox">
        <input
          checked={condition.isNegated}
          onChange={(event) =>
            onChange({ ...condition, isNegated: event.target.checked })
          }
          type="checkbox"
        />
        <span>NOT</span>
      </label>
      <button
        aria-label="Remove condition"
        className="text-button"
        onClick={onRemove}
        type="button"
      >
        Remove
      </button>
    </div>
  );
}

function ActionEditor({
  action,
  onChange,
  onRemove,
  categories,
  tags,
}: {
  action: EditorAction;
  onChange: (value: EditorAction) => void;
  onRemove: () => void;
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="rule-builder-row action-builder-row">
      <select
        aria-label="Action type"
        onChange={(event) =>
          onChange({
            ...action,
            actionType: event.target.value as ActionType,
            value: "",
          })
        }
        value={action.actionType}
      >
        {Object.entries(ACTION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {action.actionType === "set_category" ? (
        <select
          aria-label="Action category"
          onChange={(event) =>
            onChange({ ...action, value: event.target.value })
          }
          value={String(action.value)}
        >
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      ) : action.actionType === "add_tag" ? (
        <select
          aria-label="Action tag"
          onChange={(event) =>
            onChange({ ...action, value: event.target.value })
          }
          value={String(action.value)}
        >
          <option value="">Select tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      ) : action.actionType === "suggest_event_type" ? (
        <select
          aria-label="Suggested event type"
          onChange={(event) =>
            onChange({ ...action, value: event.target.value })
          }
          value={String(action.value)}
        >
          <option value="">Select type</option>
          <option value="expense">expense</option>
          <option value="income">income</option>
        </select>
      ) : action.actionType === "set_note" ||
        action.actionType === "append_note" ? (
        <textarea
          aria-label="Action value"
          maxLength={2000}
          onChange={(event) =>
            onChange({ ...action, value: event.target.value })
          }
          value={String(action.value)}
        />
      ) : (
        <input
          aria-label="Action value"
          maxLength={200}
          onChange={(event) =>
            onChange({ ...action, value: event.target.value })
          }
          value={String(action.value)}
        />
      )}
      <button
        aria-label="Remove action"
        className="text-button"
        onClick={onRemove}
        type="button"
      >
        Remove
      </button>
    </div>
  );
}
