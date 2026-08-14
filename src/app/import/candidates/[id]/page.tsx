import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MatchExistingControl,
  UnlinkMatchControl,
} from "@/components/import/match-controls";
import { CandidateReviewForm } from "@/components/sync/mutation-controls";
import { FileImportReadService } from "@/services/file-import-read-service";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review file candidate" };

function statusLabel(status: string): string {
  return (
    {
      pending: "New review candidate",
      needs_mapping: "Needs mapping",
      matched: "Matched existing event",
      imported: "Imported to Ledger",
      ignored: "Ignored",
      unsupported: "Unsupported",
      source_changed: "Source changed after resolution",
    }[status] ?? status
  );
}

export default async function FileCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const candidate = await withDatabase((context) => {
    try {
      return new FileImportReadService(context).candidate(id);
    } catch {
      return null;
    }
  });
  if (!candidate) notFound();
  const importable =
    candidate.status === "pending" || candidate.status === "needs_mapping";
  const sameAssetAccounts = candidate.accounts.filter(
    (account) => account.assetId === candidate.targetAccount.assetId,
  );

  return (
    <div className="page-stack candidate-review-page file-candidate-page">
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/import">
            ← Back to Import Studio
          </Link>
          <p className="eyebrow">Statement source → Explicit resolution</p>
          <h1>{candidate.payee ?? candidate.title}</h1>
          <p>
            {candidate.targetAccount.name} · {candidate.sourceDateText} ·{" "}
            {candidate.amountDisplay}
          </p>
        </div>
        <span
          className={`candidate-status candidate-status-${candidate.status}`}
        >
          {statusLabel(candidate.status)}
        </span>
      </header>

      <section className="provenance-track" aria-label="File provenance track">
        <div>
          <span>1</span>
          <strong>{candidate.sourceFormat.toUpperCase()} source</strong>
          <small>
            {candidate.identityStrength} identity · raw file discarded
          </small>
        </div>
        <div>
          <span>2</span>
          <strong>Review candidate</strong>
          <small>Exact signed amount · no rounding</small>
        </div>
        <div>
          <span>3</span>
          <strong>Explicit resolution</strong>
          <small>
            {candidate.matchLink
              ? "Matched without Ledger edits"
              : candidate.importLink
                ? "Imported through V1 writer"
                : "No Ledger write yet"}
          </small>
        </div>
      </section>

      {candidate.status === "source_changed" ? (
        <aside className="candidate-warnings">
          <strong>Source payload changed after resolution</strong>
          <p>
            Existing Ledger remains untouched. Review provenance before any
            unlink or new action.
          </p>
        </aside>
      ) : null}

      <div className="candidate-detail-grid">
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Audited selected fields</p>
              <h2>Statement fact</h2>
            </div>
            <span>{candidate.datePrecision}</span>
          </div>
          <dl className="credential-facts file-candidate-facts">
            <div>
              <dt>Amount</dt>
              <dd>{candidate.amountDisplay}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>{candidate.direction === "out" ? "outgoing" : "incoming"}</dd>
            </div>
            <div>
              <dt>Payee</dt>
              <dd>{candidate.payee ?? "not supplied"}</dd>
            </div>
            <div>
              <dt>Memo</dt>
              <dd>{candidate.memo ?? "not supplied"}</dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>
                {candidate.identityStrength} · {candidate.sourceIdKind}
              </dd>
            </div>
          </dl>
        </section>

        <section className="content-section statement-fingerprint-detail">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Provenance</p>
              <h2>Source identity</h2>
            </div>
          </div>
          <code>{candidate.sourceExternalId}</code>
          <dl className="credential-facts">
            <div>
              <dt>File</dt>
              <dd>{candidate.sourceFilename ?? "unknown batch"}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>
                {candidate.targetAccount.name} ·{" "}
                {candidate.targetAccount.assetCode}
              </dd>
            </div>
            <div>
              <dt>Source date</dt>
              <dd>
                {candidate.sourceDateText}
                {candidate.datePrecision === "day" ? " · date-only" : ""}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {candidate.matchLink ? (
        <section className="content-section imported-result">
          <div>
            <p className="eyebrow">Matched provenance</p>
            <h2>Existing Ledger event linked</h2>
            <p>
              Match did not edit Ledger. Unlink first if the event must be
              edited or deleted.
            </p>
          </div>
          <div className="linked-event-actions">
            <Link
              className="primary-button"
              href={`/transactions/${candidate.matchLink.ledgerEventId}`}
            >
              View Ledger event
            </Link>
            {candidate.status === "matched" ||
            candidate.status === "source_changed" ? (
              <UnlinkMatchControl candidateId={candidate.id} />
            ) : null}
          </div>
        </section>
      ) : candidate.importLink ? (
        <section className="content-section imported-result">
          <div>
            <p className="eyebrow">Imported provenance</p>
            <h2>Ledger event created explicitly</h2>
            <p>Reimport cannot create another event for this candidate.</p>
          </div>
          <Link
            className="primary-button"
            href={`/transactions/${candidate.importLink.ledgerEventId}`}
          >
            View Ledger event
          </Link>
        </section>
      ) : null}

      {importable ? (
        <div className="candidate-detail-grid candidate-resolution-grid">
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">No automatic match</p>
                <h2>Match Existing</h2>
              </div>
              <span>Exact account + signed amount</span>
            </div>
            <MatchExistingControl
              candidateId={candidate.id}
              suggestions={candidate.suggestions}
            />
          </section>

          <section className="content-section candidate-import-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Explicit Ledger write</p>
                <h2>
                  {candidate.direction === "out"
                    ? "Expense or Transfer"
                    : "Income or Transfer"}
                </h2>
              </div>
            </div>
            <CandidateReviewForm
              accounts={sameAssetAccounts}
              allowedEventTypes={
                candidate.direction === "out"
                  ? ["expense", "transfer"]
                  : ["income", "transfer"]
              }
              candidateId={candidate.id}
              legs={[
                {
                  role:
                    candidate.direction === "out"
                      ? "external_out"
                      : "external_in",
                  providerAssetKey: candidate.targetAccount.assetCode,
                  amountText: candidate.amountText,
                  mappedAccountId: candidate.targetAccount.id,
                },
              ]}
              lockedMainAccountId={candidate.targetAccount.id}
              providerName="statement"
              returnPath="/import"
              suggestedEventType="unknown"
              unresolvedFee={null}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
