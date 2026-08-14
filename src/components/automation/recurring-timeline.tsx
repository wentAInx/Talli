"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Suggestion {
  ledgerEventId?: string;
  score: number;
  reasons: string[];
  occurredAt?: string;
  payee?: string | null;
}

export interface TimelineOccurrence {
  occurrenceDate: string;
  status: "linked" | "skipped" | "upcoming" | "due" | "overdue";
  linkedLedgerEventId: string | null;
  suggestions: Suggestion[];
}

async function postOccurrence(body: unknown) {
  const response = await fetch("/api/automation/recurring/occurrences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    result?: { ledgerEventId?: string };
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Occurrence request failed.");
  }
  return payload.result;
}

export function RecurringTimeline({
  recurringItemId,
  item,
  occurrences,
  categories,
  tags,
}: {
  recurringItemId: string;
  item: {
    payeeText: string | null;
    categoryId: string | null;
    tagIds: string[];
    note: string | null;
    expectedAmount: string;
    defaultActualAmount: string;
  };
  occurrences: TimelineOccurrence[];
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(
    occurrenceDate: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    setPendingKey(occurrenceDate);
    setError(null);
    try {
      const result = await postOccurrence({
        ...body,
        recurringItemId,
        occurrenceDate,
      });
      if (result?.ledgerEventId) {
        router.push(`/transactions/${result.ledgerEventId}`);
      }
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Occurrence request failed.",
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="recurring-timeline">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {occurrences.map((occurrence) => (
        <article
          className={`occurrence-card occurrence-${occurrence.status}`}
          key={occurrence.occurrenceDate}
        >
          <div className="occurrence-heading">
            <div>
              <time dateTime={occurrence.occurrenceDate}>
                {occurrence.occurrenceDate}
              </time>
              <span>{occurrence.status}</span>
            </div>
            <strong>{item.expectedAmount}</strong>
          </div>
          {occurrence.linkedLedgerEventId ? (
            <div className="inline-actions">
              <Link
                className="primary-button"
                href={`/transactions/${occurrence.linkedLedgerEventId}`}
              >
                View Ledger event
              </Link>
              <button
                className="secondary-button"
                disabled={pendingKey === occurrence.occurrenceDate}
                onClick={() =>
                  void mutate(occurrence.occurrenceDate, { action: "unlink" })
                }
                type="button"
              >
                Unlink
              </button>
            </div>
          ) : occurrence.status === "skipped" ? (
            <button
              className="secondary-button"
              disabled={pendingKey === occurrence.occurrenceDate}
              onClick={() =>
                void mutate(occurrence.occurrenceDate, { action: "unskip" })
              }
              type="button"
            >
              Undo skip
            </button>
          ) : (
            <div className="occurrence-open-actions">
              {occurrence.suggestions.length > 0 ? (
                <form
                  action={(formData) => {
                    const ledgerEventId = formData.get("ledgerEventId");
                    if (typeof ledgerEventId === "string" && ledgerEventId) {
                      void mutate(occurrence.occurrenceDate, {
                        action: "link",
                        ledgerEventId,
                        confirmed: true,
                      });
                    }
                  }}
                  className="occurrence-link-form"
                >
                  <label className="field">
                    <span>Link existing suggestion</span>
                    <select defaultValue="" name="ledgerEventId" required>
                      <option value="">Select Ledger event</option>
                      {occurrence.suggestions.map((suggestion) => (
                        <option
                          key={suggestion.ledgerEventId}
                          value={suggestion.ledgerEventId}
                        >
                          {suggestion.payee ?? suggestion.ledgerEventId} · score{" "}
                          {suggestion.score}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary-button"
                    disabled={pendingKey === occurrence.occurrenceDate}
                    type="submit"
                  >
                    Link explicitly
                  </button>
                </form>
              ) : (
                <p className="empty-state">
                  No deterministic Ledger match suggestion.
                </p>
              )}

              <details className="occurrence-post-panel">
                <summary>Post occurrence explicitly</summary>
                <form
                  action={(formData) =>
                    void mutate(occurrence.occurrenceDate, {
                      action: "post",
                      actualAmount: String(formData.get("actualAmount") ?? ""),
                      occurredAtLocal: String(
                        formData.get("occurredAtLocal") ?? "",
                      ),
                      payee: String(formData.get("payee") ?? "") || null,
                      categoryId:
                        String(formData.get("categoryId") ?? "") || null,
                      tagIds: formData
                        .getAll("tagIds")
                        .filter(
                          (value): value is string => typeof value === "string",
                        ),
                      note: String(formData.get("note") ?? "") || null,
                      confirmed: true,
                    })
                  }
                  className="recurring-post-form"
                >
                  <div className="field-grid field-grid-two">
                    <label className="field">
                      <span>Actual amount</span>
                      <input
                        defaultValue={item.defaultActualAmount}
                        inputMode="decimal"
                        name="actualAmount"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Actual local time</span>
                      <input
                        defaultValue={`${occurrence.occurrenceDate}T12:00`}
                        name="occurredAtLocal"
                        type="datetime-local"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Payee</span>
                      <input
                        defaultValue={item.payeeText ?? ""}
                        maxLength={200}
                        name="payee"
                      />
                    </label>
                    <label className="field">
                      <span>Category</span>
                      <select
                        defaultValue={item.categoryId ?? ""}
                        name="categoryId"
                      >
                        <option value="">No category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
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
                              defaultChecked={item.tagIds.includes(tag.id)}
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
                  <label className="field">
                    <span>Note</span>
                    <textarea
                      defaultValue={item.note ?? ""}
                      maxLength={2000}
                      name="note"
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={pendingKey === occurrence.occurrenceDate}
                    type="submit"
                  >
                    Create Ledger event + link
                  </button>
                </form>
              </details>
              <button
                className="text-button"
                disabled={pendingKey === occurrence.occurrenceDate}
                onClick={() => {
                  if (window.confirm(`Skip ${occurrence.occurrenceDate}?`)) {
                    void mutate(occurrence.occurrenceDate, {
                      action: "skip",
                      note: null,
                    });
                  }
                }}
                type="button"
              >
                Skip occurrence
              </button>
            </div>
          )}
        </article>
      ))}
      {occurrences.length === 0 ? (
        <p className="empty-state">
          No generated occurrence in this bounded window.
        </p>
      ) : null}
    </div>
  );
}
