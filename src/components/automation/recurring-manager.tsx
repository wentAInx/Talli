"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AmountMode = "exact" | "approx" | "range";
type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringView {
  id: string;
  name: string;
  eventType: "expense" | "income";
  accountId: string;
  accountName: string;
  assetCode: string;
  payeeText: string | null;
  payeeMatchMode: "any" | "exact" | "contains";
  categoryId: string | null;
  tagIds: string[];
  note: string | null;
  amountMode: AmountMode;
  amount: string | null;
  toleranceBps: number | null;
  minAmount: string | null;
  maxAmount: string | null;
  expectationDisplay: string;
  frequency: Frequency;
  intervalCount: number;
  anchorDate: string;
  monthlyDayMode: "fixed" | "last" | null;
  dateWindowBeforeDays: number;
  dateWindowAfterDays: number;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  nextOccurrence: string | null;
  nextStatus: string | null;
}

export type RecurringPrefill = Pick<
  RecurringView,
  | "name"
  | "eventType"
  | "accountId"
  | "payeeText"
  | "payeeMatchMode"
  | "categoryId"
  | "tagIds"
  | "note"
  | "amountMode"
  | "amount"
  | "toleranceBps"
  | "minAmount"
  | "maxAmount"
  | "frequency"
  | "intervalCount"
  | "anchorDate"
  | "monthlyDayMode"
  | "dateWindowBeforeDays"
  | "dateWindowAfterDays"
  | "startsOn"
  | "endsOn"
  | "isActive"
> & { sourceLabel: string };

async function postRecurring(body: unknown) {
  const response = await fetch("/api/automation/recurring", {
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
    throw new Error(payload.error ?? "Recurring request failed.");
  }
  return payload.result;
}

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function RecurringManager({
  bookId,
  items,
  accounts,
  categories,
  tags,
  prefill = null,
}: {
  bookId: string;
  items: RecurringView[];
  accounts: Array<{ id: string; name: string; assetCode: string }>;
  categories: Array<{
    id: string;
    name: string;
    categoryType: "expense" | "income" | "both";
  }>;
  tags: Array<{ id: string; name: string }>;
  prefill?: RecurringPrefill | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringView | null>(null);
  const [amountMode, setAmountMode] = useState<AmountMode>(
    prefill?.amountMode ?? "exact",
  );
  const [frequency, setFrequency] = useState<Frequency>(
    prefill?.frequency ?? "monthly",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    | "all"
    | "active"
    | "overdue"
    | "upcoming"
    | "expense"
    | "income"
    | "archived"
  >("all");

  async function mutate(body: unknown): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await postRecurring(body);
      router.refresh();
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Recurring request failed.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function save(formData: FormData): Promise<void> {
    const saved = await mutate({
      action: "save",
      draft: {
        id: editing?.id,
        bookId,
        accountId: text(formData, "accountId"),
        name: text(formData, "name") ?? "",
        eventType: text(formData, "eventType"),
        payeeText: text(formData, "payeeText"),
        payeeMatchMode: text(formData, "payeeMatchMode"),
        categoryId: text(formData, "categoryId"),
        tagIds: formData
          .getAll("tagIds")
          .filter((value): value is string => typeof value === "string"),
        note: text(formData, "note"),
        amountMode,
        amount: text(formData, "amount"),
        toleranceBps:
          amountMode === "approx"
            ? Number(text(formData, "toleranceBps"))
            : null,
        minAmount: text(formData, "minAmount"),
        maxAmount: text(formData, "maxAmount"),
        frequency,
        intervalCount: Number(text(formData, "intervalCount")),
        anchorDate: text(formData, "anchorDate") ?? "",
        monthlyDayMode:
          frequency === "monthly" ? text(formData, "monthlyDayMode") : null,
        dateWindowBeforeDays: Number(text(formData, "beforeDays")),
        dateWindowAfterDays: Number(text(formData, "afterDays")),
        startsOn: text(formData, "startsOn"),
        endsOn: text(formData, "endsOn"),
        isActive: formData.get("isActive") === "on",
      },
    });
    if (saved) {
      setEditing(null);
      if (prefill) router.replace("/automation?tab=recurring");
    }
  }

  function beginEdit(item: RecurringView): void {
    setEditing(item);
    setAmountMode(item.amountMode);
    setFrequency(item.frequency);
    setError(null);
    document
      .getElementById("recurring-editor")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  const initial = editing ?? prefill;
  const visibleItems = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "active") return item.isActive;
    if (filter === "archived") return !item.isActive;
    if (filter === "expense" || filter === "income") {
      return item.eventType === filter;
    }
    return item.nextStatus === filter;
  });
  return (
    <div className="automation-workspace recurring-workspace">
      <section className="content-section recurring-list-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Expectations · no auto-post</p>
            <h2>Recurring</h2>
          </div>
          <label className="recurring-filter">
            <span>{visibleItems.length} shown</span>
            <select
              aria-label="Recurring filter"
              onChange={(event) =>
                setFilter(event.target.value as typeof filter)
              }
              value={filter}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <div className="recurring-card-grid">
          {visibleItems.map((item) => (
            <article className="recurring-card" key={item.id}>
              <div className="recurring-card-heading">
                <span
                  className={`rule-state ${item.isActive ? "enabled" : "disabled"}`}
                >
                  {item.isActive ? "Active" : "Archived"}
                </span>
                <strong>{item.name}</strong>
              </div>
              <p>
                {item.eventType} · {item.accountName}
              </p>
              <p className="recurring-expectation">{item.expectationDisplay}</p>
              <dl>
                <div>
                  <dt>Cadence</dt>
                  <dd>
                    {item.frequency} · every {item.intervalCount}
                  </dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>{item.nextOccurrence ?? "No future occurrence"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{item.nextStatus ?? "—"}</dd>
                </div>
              </dl>
              <div className="inline-actions">
                <Link
                  className="primary-button"
                  href={`/automation/recurring/${item.id}`}
                >
                  Timeline
                </Link>
                <button
                  className="secondary-button"
                  onClick={() => beginEdit(item)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className={
                    item.isActive ? "danger-button" : "secondary-button"
                  }
                  disabled={pending}
                  onClick={() =>
                    void mutate({
                      action: "set_active",
                      recurringItemId: item.id,
                      isActive: !item.isActive,
                    })
                  }
                  type="button"
                >
                  {item.isActive ? "Archive" : "Restore"}
                </button>
              </div>
            </article>
          ))}
          {visibleItems.length === 0 ? (
            <p className="empty-state">
              {items.length === 0
                ? "No recurring expectations yet."
                : "No recurring expectation matches this filter."}
            </p>
          ) : null}
        </div>
      </section>

      {prefill && !editing ? (
        <aside className="candidate-warnings recurring-prefill-note">
          <div>
            <strong>Prefilled from {prefill.sourceLabel}</strong>
            <p>
              This is an editable draft only. Review cadence and amount, then
              save explicitly to create a recurring definition.
            </p>
          </div>
          <Link href="/automation?tab=recurring">Clear prefill</Link>
        </aside>
      ) : null}

      <section
        className="content-section recurring-editor"
        id="recurring-editor"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Date-only recurrence</p>
            <h2>
              {editing
                ? "Edit recurring item"
                : prefill
                  ? "Review recurring prefill"
                  : "Create recurring item"}
            </h2>
          </div>
          {editing ? (
            <button
              className="text-button"
              onClick={() => {
                setEditing(null);
                setAmountMode(prefill?.amountMode ?? "exact");
                setFrequency(prefill?.frequency ?? "monthly");
              }}
              type="button"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
        <form
          action={save}
          className="recurring-form"
          key={editing?.id ?? prefill?.sourceLabel ?? "new"}
        >
          <div className="field-grid field-grid-two">
            <label className="field">
              <span>Name</span>
              <input
                defaultValue={initial?.name ?? ""}
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="field">
              <span>Account</span>
              <select
                defaultValue={initial?.accountId ?? ""}
                name="accountId"
                required
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.assetCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Event type</span>
              <select
                defaultValue={initial?.eventType ?? "expense"}
                name="eventType"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <select
                defaultValue={initial?.categoryId ?? ""}
                name="categoryId"
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} · {category.categoryType}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Payee text</span>
              <input
                defaultValue={initial?.payeeText ?? ""}
                maxLength={200}
                name="payeeText"
              />
            </label>
            <label className="field">
              <span>Payee match</span>
              <select
                defaultValue={initial?.payeeMatchMode ?? "any"}
                name="payeeMatchMode"
              >
                <option value="any">Any</option>
                <option value="exact">Exact</option>
                <option value="contains">Contains</option>
              </select>
            </label>
          </div>

          {tags.length > 0 ? (
            <fieldset className="tag-picker">
              <legend>Tags</legend>
              <div className="tag-options">
                {tags.map((tag) => (
                  <label className="tag-option" key={tag.id}>
                    <input
                      defaultChecked={initial?.tagIds.includes(tag.id)}
                      name="tagIds"
                      type="checkbox"
                      value={tag.id}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="field-grid field-grid-three">
            <label className="field">
              <span>Amount mode</span>
              <select
                onChange={(event) =>
                  setAmountMode(event.target.value as AmountMode)
                }
                value={amountMode}
              >
                <option value="exact">Exact</option>
                <option value="approx">Approx</option>
                <option value="range">Range</option>
              </select>
            </label>
            {amountMode === "range" ? (
              <>
                <label className="field">
                  <span>Minimum</span>
                  <input
                    defaultValue={initial?.minAmount ?? ""}
                    inputMode="decimal"
                    name="minAmount"
                    required
                  />
                </label>
                <label className="field">
                  <span>Maximum</span>
                  <input
                    defaultValue={initial?.maxAmount ?? ""}
                    inputMode="decimal"
                    name="maxAmount"
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Expected amount</span>
                  <input
                    defaultValue={initial?.amount ?? ""}
                    inputMode="decimal"
                    name="amount"
                    required
                  />
                </label>
                {amountMode === "approx" ? (
                  <label className="field">
                    <span>Tolerance bps</span>
                    <input
                      defaultValue={initial?.toleranceBps ?? 500}
                      max="10000"
                      min="0"
                      name="toleranceBps"
                      type="number"
                    />
                  </label>
                ) : (
                  <div />
                )}
              </>
            )}
          </div>

          <div className="field-grid field-grid-three">
            <label className="field">
              <span>Frequency</span>
              <select
                onChange={(event) =>
                  setFrequency(event.target.value as Frequency)
                }
                value={frequency}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="field">
              <span>Every</span>
              <input
                defaultValue={initial?.intervalCount ?? 1}
                max="10000"
                min="1"
                name="intervalCount"
                type="number"
              />
            </label>
            <label className="field">
              <span>Anchor date</span>
              <input
                defaultValue={
                  initial?.anchorDate ?? new Date().toISOString().slice(0, 10)
                }
                name="anchorDate"
                type="date"
              />
            </label>
            {frequency === "monthly" ? (
              <label className="field">
                <span>Monthly day mode</span>
                <select
                  defaultValue={initial?.monthlyDayMode ?? "fixed"}
                  name="monthlyDayMode"
                >
                  <option value="fixed">Fixed day (missing = skip)</option>
                  <option value="last">Last day</option>
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Match days before</span>
              <input
                defaultValue={initial?.dateWindowBeforeDays ?? 2}
                max="31"
                min="0"
                name="beforeDays"
                type="number"
              />
            </label>
            <label className="field">
              <span>Match days after</span>
              <input
                defaultValue={initial?.dateWindowAfterDays ?? 2}
                max="31"
                min="0"
                name="afterDays"
                type="number"
              />
            </label>
            <label className="field">
              <span>Starts on (optional)</span>
              <input
                defaultValue={initial?.startsOn ?? ""}
                name="startsOn"
                type="date"
              />
            </label>
            <label className="field">
              <span>Ends on (optional)</span>
              <input
                defaultValue={initial?.endsOn ?? ""}
                name="endsOn"
                type="date"
              />
            </label>
          </div>
          <label className="field">
            <span>Note</span>
            <textarea
              defaultValue={initial?.note ?? ""}
              maxLength={2000}
              name="note"
            />
          </label>
          <label className="checkbox-row">
            <input
              defaultChecked={initial?.isActive ?? true}
              name="isActive"
              type="checkbox"
            />
            <span>Active after save</span>
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Saving…" : "Save recurring item"}
          </button>
          <p className="boundary-note">
            Future occurrences are generated in memory. Nothing posts or links
            automatically.
          </p>
        </form>
      </section>
    </div>
  );
}
