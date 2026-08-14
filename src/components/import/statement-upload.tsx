"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProfileOption {
  connectionId: string;
  name: string;
  format: "csv" | "ofx" | "qfx" | "camt053";
  targetAccountName: string;
  assetCode: string;
}

interface PreviewRow {
  sourceExternalId: string;
  identityStrength: "strong" | "weak";
  originalDateText: string;
  datePrecision: "timestamp" | "day";
  amountText: string;
  currencyCode: string | null;
  payee: string | null;
  memo: string | null;
  unsupportedReason: string | null;
  invalidReason: string | null;
  alreadyKnown: boolean;
  possibleMatches: Array<{
    ledgerEventId: string;
    score: number;
    reasons: string[];
  }>;
}

interface PreviewPayload {
  format: string;
  sanitizedFilename: string;
  fileSha256: string;
  statementIdentity: {
    accountFingerprint: string | null;
    accountLast4: string | null;
    currencyCode: string | null;
  };
  statementFromDate: string | null;
  statementToDate: string | null;
  rowCount: number;
  alreadyKnownCount: number;
  possibleMatchCount: number;
  newCount: number;
  invalidCount: number;
  unsupportedCount: number;
  closingBalance: {
    kind: string;
    rawSignedAmountText: string;
    currencyCode: string;
    datePrecision: string;
  } | null;
  rows: PreviewRow[];
  truncated: boolean;
  warnings: string[];
}

interface CommitResult {
  batchId: string;
  sourceRows: number;
  candidatesCreated: number;
  duplicates: number;
  unsupported: number;
  balanceObservationId: string | null;
  summary: {
    rows: number;
    alreadyImportedCount: number;
    possibleMatchCount: number;
    newCount: number;
    unsupportedCount: number;
    invalidCount: number;
  };
}

interface InvalidPreviewRow {
  sourceExternalId: string;
  invalidReason: string;
}

function rowState(row: PreviewRow): string {
  if (row.invalidReason) return "Invalid";
  if (row.unsupportedReason) return "Unsupported";
  if (row.alreadyKnown) return "Already imported";
  if (row.possibleMatches.length > 0) return "Possible Ledger match";
  return "New";
}

class StatementResponseError extends Error {
  constructor(
    message: string,
    readonly invalidRows: InvalidPreviewRow[],
  ) {
    super(message);
    this.name = "StatementResponseError";
  }
}

async function responsePayload(response: Response) {
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    fatalErrors?: string[];
    preview?: PreviewPayload;
    result?: CommitResult;
    invalidRows?: InvalidPreviewRow[];
  };
  if (!response.ok || !payload.ok) {
    throw new StatementResponseError(
      payload.error ?? payload.fatalErrors?.[0] ?? "Statement 操作未完成。",
      payload.invalidRows ?? [],
    );
  }
  return payload;
}

export function StatementUpload({ profiles }: { profiles: ProfileOption[] }) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState(
    profiles[0]?.connectionId ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [invalidRows, setInvalidRows] = useState<InvalidPreviewRow[]>([]);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function previewFile(): Promise<void> {
    if (!file || !connectionId) {
      setError("请选择 import profile 与 statement file。");
      return;
    }
    setPending("preview");
    setError(null);
    setResult(null);
    setInvalidRows([]);
    setIdentityConfirmed(false);
    try {
      const form = new FormData();
      form.set("connectionId", connectionId);
      form.set("file", file);
      const payload = await responsePayload(
        await fetch("/api/import/preview", { method: "POST", body: form }),
      );
      setPreview(payload.preview ?? null);
    } catch (requestError) {
      setPreview(null);
      setInvalidRows(
        requestError instanceof StatementResponseError
          ? requestError.invalidRows
          : [],
      );
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Preview 未完成。",
      );
    } finally {
      setPending(null);
    }
  }

  async function commitFile(): Promise<void> {
    if (!file || !connectionId || !preview) return;
    if (preview.statementIdentity.accountFingerprint && !identityConfirmed) {
      setError("请先确认 masked statement account 与 currency。");
      return;
    }
    if (
      !window.confirm(
        "这一步只创建 source / batch / review candidate / balance observation，不会创建 Ledger event 或 snapshot。确认继续？",
      )
    ) {
      return;
    }
    setPending("commit");
    setError(null);
    try {
      const form = new FormData();
      form.set("connectionId", connectionId);
      form.set("file", file);
      form.set("confirmed", "true");
      if (identityConfirmed) form.set("confirmedStatementIdentity", "true");
      const payload = await responsePayload(
        await fetch("/api/import/commit", { method: "POST", body: form }),
      );
      setResult(payload.result ?? null);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Candidate commit 未完成。",
      );
    } finally {
      setPending(null);
    }
  }

  if (profiles.length === 0) {
    return (
      <div className="empty-inline">
        先创建一个 account-first import profile，再上传 statement。
      </div>
    );
  }

  return (
    <div className="statement-upload-flow">
      <div className="import-upload-grid">
        <label className="field">
          <span>Import profile</span>
          <select
            onChange={(event) => {
              setConnectionId(event.target.value);
              setPreview(null);
              setResult(null);
              setInvalidRows([]);
            }}
            value={connectionId}
          >
            {profiles.map((profile) => (
              <option key={profile.connectionId} value={profile.connectionId}>
                {profile.name} · {profile.targetAccountName} ·{" "}
                {profile.assetCode}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Statement file</span>
          <input
            accept=".csv,.ofx,.qfx,.xml,application/xml,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setInvalidRows([]);
            }}
            type="file"
          />
          <small>Max 20 MiB · CSV / OFX-QFX / camt.053</small>
        </label>
      </div>
      <button
        className="secondary-button"
        disabled={pending !== null || !file}
        onClick={() => void previewFile()}
        type="button"
      >
        {pending === "preview"
          ? "Parsing outside DB transaction…"
          : "Preview file"}
      </button>

      {preview ? (
        <div className="import-preview-stack">
          <section className="statement-fingerprint">
            <div>
              <p className="eyebrow">Statement fingerprint</p>
              <strong>
                {preview.statementIdentity.accountLast4
                  ? `••••${preview.statementIdentity.accountLast4}`
                  : "CSV profile mapping"}
              </strong>
              <small>
                {preview.statementIdentity.currencyCode ??
                  "currency unresolved"}{" "}
                · {preview.format}
              </small>
            </div>
            <code title={preview.fileSha256}>
              SHA-256 {preview.fileSha256.slice(0, 12)}…
            </code>
          </section>

          <dl className="import-stat-rail">
            <div>
              <dt>Rows</dt>
              <dd>{preview.rowCount}</dd>
            </div>
            <div>
              <dt>Already imported</dt>
              <dd>{preview.alreadyKnownCount}</dd>
            </div>
            <div>
              <dt>Possible match</dt>
              <dd>{preview.possibleMatchCount}</dd>
            </div>
            <div>
              <dt>Unsupported</dt>
              <dd>{preview.unsupportedCount}</dd>
            </div>
            <div>
              <dt>New</dt>
              <dd>{preview.newCount}</dd>
            </div>
            <div>
              <dt>Invalid</dt>
              <dd>{preview.invalidCount}</dd>
            </div>
          </dl>

          {preview.closingBalance ? (
            <p className="import-observation-note">
              Closing {preview.closingBalance.kind}:{" "}
              {preview.closingBalance.rawSignedAmountText}{" "}
              {preview.closingBalance.currencyCode}. Commit stores an
              observation only; Reconcile remains separate.
            </p>
          ) : null}

          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Date</th>
                  <th>Payee / memo</th>
                  <th>Amount</th>
                  <th>Identity</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className="import-preview-row" key={row.sourceExternalId}>
                    <td>
                      <span className="candidate-status candidate-status-pending">
                        {rowState(row)}
                      </span>
                    </td>
                    <td>
                      {row.originalDateText}
                      {row.datePrecision === "day" ? (
                        <small>date-only</small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{row.payee ?? "—"}</strong>
                      <small>{row.memo ?? row.unsupportedReason ?? "—"}</small>
                    </td>
                    <td className="money-text">
                      {row.amountText} {row.currencyCode}
                    </td>
                    <td>{row.identityStrength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.truncated ? (
            <p className="import-truncated-note">
              Preview shows the first 20 rows only.
            </p>
          ) : null}
          {preview.statementIdentity.accountFingerprint ? (
            <label className="checkbox-row import-identity-confirmation">
              <input
                checked={identityConfirmed}
                onChange={(event) => setIdentityConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>
                I explicitly confirm account ••••
                {preview.statementIdentity.accountLast4} and{" "}
                {preview.statementIdentity.currencyCode} for this profile.
              </span>
            </label>
          ) : null}
          <button
            className="primary-button"
            disabled={
              pending !== null ||
              Boolean(
                preview.statementIdentity.accountFingerprint &&
                !identityConfirmed,
              )
            }
            onClick={() => void commitFile()}
            type="button"
          >
            {pending === "commit"
              ? "Creating review candidates…"
              : "Create review candidates"}
          </button>
        </div>
      ) : null}

      {invalidRows.length > 0 ? (
        <div
          aria-label="Invalid statement rows"
          className="import-preview-table-wrap"
        >
          <table className="import-preview-table import-invalid-table">
            <thead>
              <tr>
                <th>State</th>
                <th>File / row</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {invalidRows.map((row) => (
                <tr key={row.sourceExternalId}>
                  <td>
                    <span className="candidate-status candidate-status-unsupported">
                      Invalid
                    </span>
                  </td>
                  <td>{row.sourceExternalId}</td>
                  <td>{row.invalidReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result ? (
        <p className="import-commit-result" role="status">
          Batch {result.batchId}: {result.summary.rows} rows ·{" "}
          {result.summary.alreadyImportedCount} already imported ·{" "}
          {result.summary.possibleMatchCount} possible matches ·{" "}
          {result.summary.newCount} new · {result.summary.unsupportedCount}{" "}
          unsupported · {result.summary.invalidCount} invalid.{" "}
          {result.candidatesCreated} review candidates created; No Ledger event
          was created.
        </p>
      ) : null}
      {error ? (
        <div className="import-invalid-result" role="alert">
          <span className="candidate-status candidate-status-unsupported">
            Invalid
          </span>
          <p className="form-error">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
