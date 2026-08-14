import type { Metadata } from "next";
import Link from "next/link";

import { FileImportProfileForm } from "@/components/import/profile-form";
import { StatementUpload } from "@/components/import/statement-upload";
import { ReconcileObservationButton } from "@/components/sync/mutation-controls";
import {
  FileImportReadService,
  LedgerReadService,
  SettingsService,
} from "@/services";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Financial file import" };

const QUEUES = [
  { value: "pending", label: "Review" },
  { value: "matched", label: "Matched" },
  { value: "imported", label: "Imported" },
  { value: "ignored", label: "Ignored" },
  { value: "exceptions", label: "Exceptions" },
] as const;

type Queue = (typeof QUEUES)[number]["value"];

function inQueue(status: string, queue: Queue): boolean {
  return queue === "exceptions"
    ? status === "unsupported" || status === "source_changed"
    : queue === "pending"
      ? status === "pending" || status === "needs_mapping"
      : status === queue;
}

function statusLabel(status: string): string {
  return (
    {
      pending: "New",
      needs_mapping: "Needs mapping",
      matched: "Matched existing",
      imported: "Imported",
      ignored: "Ignored",
      unsupported: "Unsupported",
      source_changed: "Source changed",
    }[status] ?? status
  );
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; queue?: string }>;
}) {
  const query = await searchParams;
  const queue: Queue = QUEUES.some((item) => item.value === query.queue)
    ? (query.queue as Queue)
    : "pending";
  const view = await withDatabase((context) => {
    const ledger = new LedgerReadService(context);
    return {
      overview: new FileImportReadService(context).overview(),
      accounts: ledger
        .getReferenceData(new Date().toISOString())
        .accounts.map((account) => ({
          id: account.id,
          name: account.name,
          assetCode: account.asset.code,
        })),
      timeZone: new SettingsService(context).getTimeZoneOrDefault(),
    };
  });
  const allCandidates = view.overview.profiles.flatMap((profile) =>
    profile.candidates.map((candidate) => ({ ...candidate, profile })),
  );
  const candidates = allCandidates.filter((candidate) =>
    inQueue(candidate.status, queue),
  );
  const recentBatches = view.overview.profiles
    .flatMap((profile) =>
      profile.recentBatches.map((batch) => ({
        ...batch,
        profileName: profile.name,
        targetAccountName: profile.targetAccountName,
      })),
    )
    .sort(
      (left, right) =>
        right.ingestedAt.localeCompare(left.ingestedAt) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, 10);

  return (
    <div className="page-stack import-page">
      <header className="page-heading import-heading">
        <div>
          <p className="eyebrow">Financial files · Explicit resolution</p>
          <h1>Import Studio</h1>
          <p>
            CSV、OFX/QFX 与 camt.053 先生成可审核来源；文件提交本身不会写入
            Ledger。
          </p>
        </div>
        <span className="sync-boundary-seal">Imported file ≠ Ledger</span>
      </header>

      <section className="import-format-rail" aria-label="Supported formats">
        <article>
          <span>CSV</span>
          <strong>Explicit columns</strong>
          <small>encoding · date · amount · currency</small>
        </article>
        <article>
          <span>OFX / QFX</span>
          <strong>Bank & credit card</strong>
          <small>FITID · LEDGERBAL observation</small>
        </article>
        <article>
          <span>camt.053</span>
          <strong>ISO 20022</strong>
          <small>Ntry · exact sign · CLBD observation</small>
        </article>
      </section>

      <div className="import-studio-grid">
        <section className="content-section import-profile-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Account-first</p>
              <h2>Create profile</h2>
            </div>
            <span>No symbol auto-map</span>
          </div>
          <FileImportProfileForm
            accounts={view.accounts}
            defaultAccountId={
              view.accounts.some((account) => account.id === query.account)
                ? query.account
                : undefined
            }
            defaultTimeZone={view.timeZone}
          />
        </section>

        <section className="content-section import-upload-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Parse → Preview → Candidate</p>
              <h2>Upload statement</h2>
            </div>
            <span>Raw file not persisted</span>
          </div>
          <StatementUpload
            key={view.overview.profiles
              .map((profile) => profile.connectionId)
              .join(":")}
            profiles={view.overview.profiles.map((profile) => ({
              connectionId: profile.connectionId,
              name: profile.name,
              format: profile.format,
              targetAccountName: profile.targetAccountName,
              assetCode: profile.assetCode,
            }))}
          />
        </section>
      </div>

      {view.overview.profiles.length > 0 ? (
        <section className="content-section import-profiles-section">
          <div className="section-heading">
            <h2>Saved profiles</h2>
            <span>{view.overview.profiles.length} profiles</span>
          </div>
          <div className="import-profile-cards">
            {view.overview.profiles.map((profile) => (
              <article key={profile.connectionId}>
                <span className="candidate-provider-mark">
                  {profile.format === "camt053"
                    ? "X"
                    : profile.format.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.targetAccountName} · {profile.assetCode} ·{" "}
                    {profile.format}
                  </small>
                </div>
                <code>
                  {profile.statementAccountLast4
                    ? `••••${profile.statementAccountLast4}`
                    : "account identity pending"}
                </code>
                <span>
                  {profile.recentBatches[0]
                    ? `Last ingest ${profile.recentBatches[0].ingestedAt.replace("T", " ").slice(0, 16)} UTC`
                    : "No ingest yet"}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-section import-batches-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Atomic provenance</p>
            <h2>Recent batches</h2>
          </div>
          <span>{recentBatches.length} shown</span>
        </div>
        {recentBatches.length > 0 ? (
          <div className="import-batch-list">
            {recentBatches.map((batch) => (
              <article key={batch.id}>
                <div className="import-batch-heading">
                  <div>
                    <strong>{batch.originalFilename}</strong>
                    <small>
                      {batch.profileName} · {batch.targetAccountName} ·{" "}
                      {batch.format}
                    </small>
                  </div>
                  <time dateTime={batch.ingestedAt}>
                    {batch.ingestedAt.replace("T", " ").slice(0, 16)} UTC
                  </time>
                </div>
                <dl className="import-batch-summary">
                  <div>
                    <dt>Rows</dt>
                    <dd>{batch.sourceRowCount}</dd>
                  </div>
                  <div>
                    <dt>Already imported</dt>
                    <dd>{batch.duplicateCount}</dd>
                  </div>
                  <div>
                    <dt>New candidates</dt>
                    <dd>{batch.newCandidateCount}</dd>
                  </div>
                  <div>
                    <dt>Unsupported</dt>
                    <dd>{batch.unsupportedCount}</dd>
                  </div>
                </dl>
                <code title={batch.fileSha256}>
                  SHA-256 {batch.fileSha256.slice(0, 16)}…
                </code>
                <small>
                  Possible matches are live suggestions in the Review queue;
                  they are never auto-applied or persisted as a batch fact.
                </small>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-inline">No statement batch has been created.</p>
        )}
      </section>

      <section className="content-section import-candidate-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>Transaction candidates</h2>
          </div>
          <span>{candidates.length} shown</span>
        </div>
        <nav className="candidate-tabs" aria-label="Import candidate queues">
          {QUEUES.map((item) => (
            <Link
              aria-current={queue === item.value ? "page" : undefined}
              href={`/import?queue=${item.value}`}
              key={item.value}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {candidates.length > 0 ? (
          <ul className="import-candidate-list">
            {candidates.map((candidate) => (
              <li className="import-candidate-row" key={candidate.id}>
                <Link href={`/import/candidates/${candidate.id}`}>
                  <span className="candidate-provider-mark">
                    {candidate.direction === "out" ? "−" : "+"}
                  </span>
                  <span className="candidate-copy">
                    <strong>{candidate.payee ?? candidate.title}</strong>
                    <small>
                      {candidate.profile.targetAccountName} ·{" "}
                      {candidate.sourceDateText} · {candidate.identityStrength}{" "}
                      ID
                    </small>
                    <code>
                      {candidate.sourceFormat} ·{" "}
                      {candidate.sourceFilename ?? candidate.sourceExternalId}
                    </code>
                  </span>
                  <span className="candidate-state">
                    <strong>{candidate.amountDisplay}</strong>
                    <small
                      className={`candidate-status candidate-status-${candidate.status}`}
                    >
                      {statusLabel(candidate.status)}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inline">This queue is empty.</p>
        )}
      </section>

      {view.overview.profiles.some(
        (profile) => profile.observations.length > 0,
      ) ? (
        <section className="content-section import-observations-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Observation only</p>
              <h2>Statement closing balances</h2>
            </div>
            <span>Explicit Reconcile</span>
          </div>
          <div className="observation-grid">
            {view.overview.profiles.flatMap((profile) =>
              profile.observations.map((observation) => (
                <article className="observation-card" key={observation.id}>
                  <header>
                    <div>
                      <strong>{profile.targetAccountName}</strong>
                      <small>
                        {observation.balanceKind} ·{" "}
                        {observation.datePrecision === "day"
                          ? "source provided date only"
                          : observation.observedAt}
                      </small>
                    </div>
                    <code>{profile.name}</code>
                  </header>
                  <dl>
                    <div>
                      <dt>Observed</dt>
                      <dd>{observation.externalDisplay}</dd>
                    </div>
                    <div>
                      <dt>Talli Ledger</dt>
                      <dd>{observation.ledgerDisplay}</dd>
                    </div>
                    <div>
                      <dt>Difference</dt>
                      <dd
                        className={`difference-${observation.differenceDirection}`}
                      >
                        {observation.differenceDisplay}
                      </dd>
                    </div>
                  </dl>
                  <ReconcileObservationButton
                    accountId={profile.targetAccountId}
                    disabled={observation.reconciled}
                    observationId={observation.id}
                    providerName="statement"
                  />
                </article>
              )),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
