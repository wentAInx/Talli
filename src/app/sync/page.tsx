import type { Metadata } from "next";
import Link from "next/link";

import {
  createKrakenConnectionAction,
  updateExternalMappingAction,
} from "@/app/actions";
import { SettingsActionForm } from "@/components/forms/settings-action-form";
import {
  ReconcileObservationButton,
  SyncRunButton,
} from "@/components/sync/mutation-controls";
import { safeKrakenConfigurationView } from "@/providers/kraken/server-factory";
import { ExternalSyncReadService } from "@/services/external-sync-read-service";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "外部同步" };

const QUEUES = [
  { value: "pending", label: "待审核" },
  { value: "needs_mapping", label: "需映射" },
  { value: "imported", label: "已导入" },
  { value: "ignored", label: "已忽略" },
  { value: "exceptions", label: "异常" },
] as const;

type Queue = (typeof QUEUES)[number]["value"];

function candidateMatchesQueue(status: string, queue: Queue): boolean {
  return queue === "exceptions"
    ? status === "unsupported" || status === "source_changed"
    : status === queue;
}

function statusLabel(status: string): string {
  return (
    {
      pending: "待审核",
      needs_mapping: "需映射",
      imported: "已导入",
      ignored: "已忽略",
      unsupported: "不支持",
      source_changed: "来源已变化",
    }[status] ?? status
  );
}

function eventTypeLabel(value: string): string {
  return (
    {
      exchange: "兑换",
      transfer: "转账",
      income: "收入",
      expense: "支出",
      unknown: "需人工判断",
    }[value] ?? value
  );
}

function connectionStatus(connection: {
  state: {
    lastSuccessAt: string | null;
    lastErrorCode: string | null;
    permissions: {
      ok: boolean;
      forbiddenWritePermissions: string[];
    } | null;
  } | null;
  configured: boolean;
}) {
  if (!connection.configured) {
    return { tone: "danger", label: "凭据缺失" };
  }
  if (connection.state?.permissions?.forbiddenWritePermissions.length) {
    return { tone: "danger", label: "权限不安全" };
  }
  if (connection.state?.lastErrorCode) {
    return { tone: "warning", label: "最近同步失败" };
  }
  if (connection.state?.lastSuccessAt) {
    return { tone: "success", label: "只读同步正常" };
  }
  return { tone: "neutral", label: "等待首次同步" };
}

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const query = await searchParams;
  const queue: Queue = QUEUES.some((item) => item.value === query.queue)
    ? (query.queue as Queue)
    : "pending";
  const credentials = safeKrakenConfigurationView();
  const overview = await withDatabase((context) =>
    new ExternalSyncReadService(context).overview(),
  );
  const connections = overview.connections.map((connection) => ({
    ...connection,
    configured: credentials.configured,
    credentialRef: credentials.credentialRef,
  }));

  return (
    <div className="page-stack sync-page">
      <header className="page-heading sync-heading">
        <div>
          <p className="eyebrow">External observations · Explicit writes</p>
          <h1>外部同步</h1>
          <p>Kraken 数据先进入审核区；只读同步不会自动修改 Talli 账本。</p>
        </div>
        <span className="sync-boundary-seal">External ≠ Ledger</span>
      </header>

      {connections.length === 0 ? (
        <section className="empty-state sync-empty-state">
          <span className="empty-mark" aria-hidden="true">
            K
          </span>
          <h2>还没有 Kraken 连接</h2>
          <p>
            创建连接只会保存 <code>env:kraken.primary</code> 引用；API key 与
            secret 只从服务端环境读取。
          </p>
          <SettingsActionForm
            action={createKrakenConnectionAction}
            className="sync-connect-form"
            submitLabel="创建 Kraken 只读连接"
          >
            <span className="sr-only">使用服务端环境凭据</span>
          </SettingsActionForm>
        </section>
      ) : (
        connections.map((connection) => {
          const status = connectionStatus(connection);
          const candidates = connection.candidates.filter((candidate) =>
            candidateMatchesQueue(candidate.status, queue),
          );
          return (
            <div className="sync-workbench" key={connection.id}>
              <section className="content-section sync-connection-card">
                <div className="sync-connection-heading">
                  <div>
                    <p className="eyebrow">Kraken Spot · Read only</p>
                    <h2>{connection.name}</h2>
                    <span className={"sync-status sync-status-" + status.tone}>
                      {status.label}
                    </span>
                  </div>
                  <SyncRunButton connectionId={connection.id} />
                </div>
                <p className="sync-safety-copy">
                  此按钮只抓取 Balance、Ledgers 与 Trades History；Import 或
                  Reconcile 仍需单独确认。
                </p>
                <dl className="credential-facts">
                  <div>
                    <dt>Credential</dt>
                    <dd>{connection.credentialRef}</dd>
                  </div>
                  <div>
                    <dt>API key</dt>
                    <dd>{connection.configured ? "已配置" : "未配置"}</dd>
                  </div>
                  <div>
                    <dt>最近成功</dt>
                    <dd>{connection.state?.lastSuccessAt ?? "尚未同步"}</dd>
                  </div>
                </dl>
                <div className="permission-checks" aria-label="Kraken 权限状态">
                  {["query-funds", "query-ledger", "query-closed-trades"].map(
                    (permission) => (
                      <span key={permission}>
                        {connection.state?.permissions?.permissions.includes(
                          permission,
                        )
                          ? "✓"
                          : "○"}{" "}
                        {permission}
                      </span>
                    ),
                  )}
                  <span>
                    {connection.state?.permissions?.forbiddenWritePermissions
                      .length
                      ? "! 检测到危险写权限"
                      : "✓ 未检测到危险写权限"}
                  </span>
                </div>
                {connection.state?.lastErrorCode ? (
                  <p className="form-error" role="alert">
                    {connection.state.lastErrorCode} ·{" "}
                    {connection.state.lastErrorMessage}
                  </p>
                ) : null}
              </section>

              <section className="content-section sync-mapping-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Identity before amounts</p>
                    <h2>资产与账户映射</h2>
                  </div>
                  <span>{connection.mappings.length} 个 raw asset</span>
                </div>
                {connection.mappings.length > 0 ? (
                  <div className="sync-table-scroll">
                    <table className="sync-mapping-table">
                      <thead>
                        <tr>
                          <th>Kraken raw</th>
                          <th>Canonical</th>
                          <th>Talli asset / account</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connection.mappings.map((mapping) => {
                          const action = updateExternalMappingAction.bind(
                            null,
                            connection.id,
                            mapping.providerAssetKey,
                          );
                          return (
                            <tr key={mapping.providerAssetKey}>
                              <td data-label="Kraken raw">
                                <code>{mapping.providerAssetKey}</code>
                              </td>
                              <td data-label="Canonical">
                                {mapping.providerDisplayCode ?? "未解析"}
                              </td>
                              <td data-label="Talli mapping">
                                <SettingsActionForm
                                  action={action}
                                  className="mapping-inline-form"
                                  submitLabel="保存映射"
                                >
                                  <label className="field compact-field">
                                    <span className="sr-only">映射状态</span>
                                    <select
                                      defaultValue={mapping.mappingStatus}
                                      name="mappingStatus"
                                    >
                                      <option value="mapped">映射</option>
                                      <option value="unmapped">未映射</option>
                                      <option value="ignored">忽略</option>
                                    </select>
                                  </label>
                                  <label className="field compact-field">
                                    <span className="sr-only">Talli 资产</span>
                                    <select
                                      defaultValue={mapping.talliAssetId ?? ""}
                                      name="talliAssetId"
                                    >
                                      <option value="">选择资产</option>
                                      {connection.assets.map((asset) => (
                                        <option key={asset.id} value={asset.id}>
                                          {asset.code} · {asset.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="field compact-field">
                                    <span className="sr-only">Talli 账户</span>
                                    <select
                                      defaultValue={
                                        mapping.talliAccountId ?? ""
                                      }
                                      name="talliAccountId"
                                    >
                                      <option value="">选择账户</option>
                                      {connection.accounts.map((account) => (
                                        <option
                                          key={account.id}
                                          value={account.id}
                                        >
                                          {account.name} · {account.assetCode}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </SettingsActionForm>
                              </td>
                              <td data-label="状态">
                                <span
                                  className={
                                    "mapping-state mapping-state-" +
                                    mapping.mappingStatus
                                  }
                                >
                                  {mapping.mappingStatus === "mapped"
                                    ? mapping.talliAssetCode +
                                      " · " +
                                      mapping.talliAccountName
                                    : mapping.mappingStatus === "ignored"
                                      ? "已忽略"
                                      : "待处理"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-inline">
                    首次同步后会显示 Kraken raw asset。
                  </p>
                )}
              </section>

              <section className="content-section sync-observations-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Observed, never auto-posted</p>
                    <h2>余额观测</h2>
                  </div>
                  <span>{connection.observations.length} 个最新观测</span>
                </div>
                {connection.observations.length > 0 ? (
                  <div className="observation-grid">
                    {connection.observations.map((observation) => (
                      <article
                        className="observation-card"
                        key={observation.id}
                      >
                        <header>
                          <div>
                            <strong>Kraken {observation.assetCode}</strong>
                            <small>
                              {observation.accountName ?? "尚未映射账户"}
                            </small>
                          </div>
                          <code>{observation.providerAssetKey}</code>
                        </header>
                        <dl>
                          <div>
                            <dt>外部观测</dt>
                            <dd>{observation.externalDisplay}</dd>
                          </div>
                          <div>
                            <dt>Talli 账本</dt>
                            <dd>
                              {observation.ledgerDisplay ?? "映射后可比较"}
                            </dd>
                          </div>
                          <div>
                            <dt>差异</dt>
                            <dd
                              className={
                                "difference-" +
                                (observation.differenceDirection ?? "unknown")
                              }
                            >
                              {observation.differenceDisplay ??
                                observation.precisionStatus}
                            </dd>
                          </div>
                        </dl>
                        <time dateTime={observation.observedAt}>
                          观察时间 {observation.observedAt}
                        </time>
                        {observation.accountId &&
                        observation.differenceDisplay ? (
                          <ReconcileObservationButton
                            accountId={observation.accountId}
                            disabled={observation.reconciled}
                            observationId={observation.id}
                          />
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-inline">
                    同步后才会生成 append-only 余额观测。
                  </p>
                )}
              </section>

              <section className="content-section candidate-queue-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Review before ledger</p>
                    <h2>交易候选</h2>
                  </div>
                  <span>{connection.candidates.length} 个候选</span>
                </div>
                <nav className="candidate-tabs" aria-label="候选状态">
                  {QUEUES.map((item) => (
                    <Link
                      aria-current={queue === item.value ? "page" : undefined}
                      href={"/sync?queue=" + item.value}
                      key={item.value}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                {candidates.length > 0 ? (
                  <ul className="candidate-list">
                    {candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <Link href={"/sync/candidates/" + candidate.id}>
                          <span className="candidate-provider-mark">K</span>
                          <span className="candidate-copy">
                            <strong>{candidate.title}</strong>
                            <small>
                              {candidate.legs.length > 0
                                ? candidate.legs
                                    .map(
                                      (leg) =>
                                        leg.amountText +
                                        " " +
                                        (leg.assetCode ?? leg.providerAssetKey),
                                    )
                                    .join(" · ")
                                : "没有可导入的标准化 legs"}
                            </small>
                            <code>{candidate.stableKey}</code>
                          </span>
                          <span className="candidate-state">
                            <strong>{statusLabel(candidate.status)}</strong>
                            <small>
                              建议：
                              {eventTypeLabel(candidate.suggestedEventType)}
                            </small>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-inline">这个队列目前为空。</p>
                )}
              </section>
            </div>
          );
        })
      )}
    </div>
  );
}
