"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface MatchSuggestion {
  ledgerEventId: string;
  eventType: string;
  occurredAt: string;
  payee: string | null;
  note: string | null;
  amountDisplay: string;
  score: number;
  reasons: string[];
}

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Match operation failed.");
  }
}

export function MatchExistingControl({
  candidateId,
  suggestions,
}: {
  candidateId: string;
  suggestions: MatchSuggestion[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(suggestions[0]?.ledgerEventId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function match(): Promise<void> {
    if (!selected) return;
    if (
      !window.confirm(
        "Match Existing 只建立 provenance，不会修改所选 Ledger event 的日期、payee、note 或 entries。确认匹配？",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await post(`/api/import/candidates/${candidateId}/match`, {
        ledgerEventId: selected,
        confirmed: true,
      });
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Match failed.",
      );
    } finally {
      setPending(false);
    }
  }

  if (suggestions.length === 0) {
    return (
      <p className="empty-inline">
        No exact-amount Ledger candidates within ±3 calendar days.
      </p>
    );
  }
  return (
    <div className="match-existing-control">
      <div className="match-suggestion-list">
        {suggestions.map((suggestion) => (
          <label key={suggestion.ledgerEventId}>
            <input
              checked={selected === suggestion.ledgerEventId}
              name="ledgerMatch"
              onChange={() => setSelected(suggestion.ledgerEventId)}
              type="radio"
            />
            <span>
              <strong>
                {suggestion.amountDisplay} ·{" "}
                {suggestion.payee ?? suggestion.eventType}
              </strong>
              <small>
                {suggestion.occurredAt.slice(0, 10)} · score {suggestion.score}{" "}
                · {suggestion.reasons.join(", ")}
              </small>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="secondary-button"
        disabled={pending || !selected}
        onClick={() => void match()}
        type="button"
      >
        {pending ? "Matching…" : "Match Existing"}
      </button>
    </div>
  );
}

export function UnlinkMatchControl({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink(): Promise<void> {
    if (
      !window.confirm(
        "Unlink 会移除 match provenance，Ledger event 本身保持不变。确认继续？",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await post(`/api/import/candidates/${candidateId}/unlink`, {
        confirmed: true,
      });
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unlink failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="match-existing-control">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => void unlink()}
        type="button"
      >
        {pending ? "Unlinking…" : "Unlink match"}
      </button>
    </div>
  );
}
