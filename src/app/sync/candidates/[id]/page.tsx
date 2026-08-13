import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateReviewForm } from "@/components/sync/mutation-controls";
import { evmChainIdentity } from "@/domain/evm";
import { ExternalSyncReadService } from "@/services/external-sync-read-service";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "审核外部候选" };

function roleLabel(role: string): string {
  return (
    {
      source: "卖出 / 转出",
      destination: "买入 / 转入",
      fee: "手续费",
      external_in: "外部转入",
      external_out: "外部转出",
      unknown: "未知",
    }[role] ?? role
  );
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const candidate = await withDatabase((context) => {
    try {
      return new ExternalSyncReadService(context).candidate(id);
    } catch {
      return null;
    }
  });
  if (!candidate) notFound();
  const evmChain = candidate.evmDetail
    ? evmChainIdentity(candidate.evmDetail.chainId)
    : null;
  const importable =
    (candidate.status === "pending" || candidate.status === "needs_mapping") &&
    (candidate.allowedEventTypes === undefined ||
      candidate.allowedEventTypes.length > 0);

  return (
    <div className="page-stack candidate-review-page">
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/sync">
            ← 返回外部同步
          </Link>
          <p className="eyebrow">Provider source → Talli event</p>
          <h1>{candidate.title}</h1>
          <p>
            {candidate.connectionName} · {candidate.occurredAt}
          </p>
        </div>
        <span
          className={"candidate-status candidate-status-" + candidate.status}
        >
          {candidate.status}
        </span>
      </header>

      <section className="provenance-track" aria-label="导入来源轨道">
        <div>
          <span>1</span>
          <strong>{candidate.providerName} source</strong>
          <small>{candidate.sources.length} 个证据对象</small>
        </div>
        <div>
          <span>2</span>
          <strong>Normalized legs</strong>
          <small>Version {candidate.normalizationVersion}</small>
        </div>
        <div>
          <span>3</span>
          <strong>Talli Ledger</strong>
          <small>
            {candidate.importLink ? "已建立 provenance" : "等待明确 Import"}
          </small>
        </div>
      </section>

      {candidate.warnings.length > 0 ? (
        <aside className="candidate-warnings">
          <strong>导入前注意</strong>
          {candidate.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </aside>
      ) : null}

      {candidate.evmDetail ? (
        <section className="content-section evm-candidate-facts">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {evmChain?.displayName ?? "EVM"} transaction identity
              </p>
              <h2>
                {candidate.evmDetail.candidateKind === "gas"
                  ? "Network fee"
                  : "Movement"}
              </h2>
            </div>
            <span>{candidate.evmDetail.classification}</span>
          </div>
          <dl className="credential-facts">
            <div>
              <dt>Chain</dt>
              <dd>
                {evmChain?.displayName} · chainId {candidate.evmDetail.chainId}
              </dd>
            </div>
            <div>
              <dt>Tx hash</dt>
              <dd>{candidate.evmDetail.txHash}</dd>
            </div>
            <div>
              <dt>Receipt</dt>
              <dd>{candidate.evmDetail.txStatus}</dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd>{candidate.evmDetail.blockNumberText ?? "unresolved"}</dd>
            </div>
            <div>
              <dt>From / to</dt>
              <dd>
                {candidate.evmDetail.fromAddressLower} →{" "}
                {candidate.evmDetail.toAddressLower ?? "contract creation"}
              </dd>
            </div>
            <div>
              <dt>Native trace</dt>
              <dd>{candidate.evmDetail.nativeTraceStatus}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {candidate.evmL2GasFee ? (
        <section className="content-section evm-fee-breakdown">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Exact fee provenance · wei</p>
              <h2>
                {candidate.evmL2GasFee.feeStatus === "exact"
                  ? "Network fee breakdown"
                  : "Fee incomplete"}
              </h2>
            </div>
            <span>{candidate.evmL2GasFee.feeModel}</span>
          </div>
          {candidate.evmL2GasFee.feeStatus === "exact" ? (
            <dl className="credential-facts evm-fee-facts">
              <div>
                <dt>
                  {candidate.evmL2GasFee.chainId === 42161
                    ? "Child execution"
                    : "L2 execution"}
                </dt>
                <dd>{candidate.evmL2GasFee.executionFeeAtomicText} wei</dd>
              </div>
              <div>
                <dt>
                  {candidate.evmL2GasFee.chainId === 42161
                    ? "Parent calldata"
                    : "L1 data / security"}
                </dt>
                <dd>{candidate.evmL2GasFee.parentDataFeeAtomicText} wei</dd>
              </div>
              {candidate.evmL2GasFee.chainId === 8453 ? (
                <div>
                  <dt>Operator fee</dt>
                  <dd>{candidate.evmL2GasFee.operatorFeeAtomicText} wei</dd>
                </div>
              ) : null}
              <div className="evm-fee-total">
                <dt>Total network fee</dt>
                <dd>{candidate.evmL2GasFee.totalFeeAtomicText} wei</dd>
              </div>
            </dl>
          ) : (
            <p className="sync-partial-warning" role="status">
              至少一个链上 fee component 无法精确取回；此候选不可导入，且不会以
              execution-only 冒充总费用。
            </p>
          )}
        </section>
      ) : null}

      <div className="candidate-detail-grid">
        <section className="content-section">
          <div className="section-heading">
            <h2>Provider sources</h2>
            <span>仅显示安全标识，不展示 credential</span>
          </div>
          <ul className="source-id-list">
            {candidate.sources.map((source) => (
              <li key={source.id}>
                <span>{source.relation}</span>
                <strong>{source.objectType}</strong>
                <code>{source.externalId}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <h2>Normalized legs</h2>
            <span>原始十进制文本</span>
          </div>
          <ul className="candidate-leg-list">
            {candidate.legs.map((leg) => (
              <li key={leg.id}>
                <span>{roleLabel(leg.role)}</span>
                <strong>
                  {leg.amountText} {leg.providerAssetKey}
                </strong>
                <small>
                  {leg.talliAssetCode ?? "未映射资产"} ·{" "}
                  {leg.mappedAccountName ?? "未映射账户"} ·{" "}
                  {leg.precisionStatus}
                </small>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {candidate.importLink ? (
        <section className="content-section imported-result">
          <div>
            <p className="eyebrow">Imported with provenance</p>
            <h2>已导入 Talli</h2>
            <p>再次同步不会重复创建账本事件；source 改变只会标记异常。</p>
          </div>
          <Link
            className="primary-button"
            href={"/transactions/" + candidate.importLink.ledgerEventId}
          >
            查看原始交易页
          </Link>
        </section>
      ) : importable ? (
        <section className="content-section candidate-import-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Explicit financial write</p>
              <h2>选择导入方式</h2>
            </div>
          </div>
          <CandidateReviewForm
            accounts={candidate.accounts}
            allowedEventTypes={candidate.allowedEventTypes}
            candidateId={candidate.id}
            legs={candidate.legs}
            providerName={candidate.providerName}
            suggestedEventType={candidate.suggestedEventType}
            unresolvedFee={candidate.unresolvedFee}
          />
        </section>
      ) : (
        <section className="content-section">
          <p className="empty-inline">
            当前状态不可导入；请返回同步队列查看原因。
          </p>
        </section>
      )}
    </div>
  );
}
