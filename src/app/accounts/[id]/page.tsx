import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteSnapshotAction,
  setAccountArchivedAction,
  updateAccountAction,
  updateSnapshotAction,
  createSnapshotAction,
} from "@/app/actions";
import { AccountForm } from "@/components/forms/account-form";
import { ConfirmActionForm } from "@/components/forms/confirm-action-form";
import { ReconciliationForm } from "@/components/forms/reconciliation-form";
import { EventList } from "@/components/ledger/event-list";
import { LedgerReadService, SettingsService } from "@/services";

import { withDatabase } from "../../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "账户详情" };

function dateLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await withDatabase((context) => {
    try {
      const service = new LedgerReadService(context);
      const queryTime = new Date().toISOString();
      return {
        detail: service.getAccountDetail(id, queryTime),
        assets: service.getReferenceData(queryTime).assets,
        timeZone: new SettingsService(context).getTimeZoneOrDefault(),
        queryTime,
      };
    } catch {
      return null;
    }
  });
  if (!view) {
    notFound();
  }
  const { detail } = view;
  const account = detail.account;
  const updateAction = updateAccountAction.bind(null, account.id);
  const reconcileAction = createSnapshotAction.bind(null, account.id);
  const archiveAction = setAccountArchivedAction.bind(
    null,
    account.id,
    !account.isArchived,
  );

  return (
    <div className="page-stack">
      <header className="account-hero">
        <div>
          <Link className="back-link" href="/accounts">
            ← 返回账户
          </Link>
          <p className="eyebrow" data-testid="account-asset">
            {account.asset.code} · {account.asset.name}
          </p>
          <h1>{account.name}</h1>
          <p>{account.institutionName ?? "独立账户"}</p>
        </div>
        <div className="account-balance-block">
          <span>当前余额</span>
          <strong data-testid="account-balance">
            {account.balanceDisplay}
          </strong>
          {account.isArchived ? <small>已归档 · 不计入总览</small> : null}
          {!account.isArchived ? (
            <Link
              className="secondary-button"
              href={`/import?account=${account.id}`}
            >
              Import statement
            </Link>
          ) : null}
        </div>
      </header>

      <div className="detail-grid">
        <section className="content-section">
          <div className="section-heading">
            <h2>最近流水</h2>
            <Link href="/transactions/new">+ 记一笔</Link>
          </div>
          <EventList events={detail.recentEvents} timeZone={view.timeZone} />
        </section>

        <aside className="content-section anchor-panel">
          <div className="section-heading">
            <h2>调整余额</h2>
          </div>
          {account.isArchived ? (
            <p className="empty-inline">取消归档后才能创建新的余额锚点。</p>
          ) : (
            <ReconciliationForm
              action={reconcileAction}
              assetCode={account.asset.code}
              currentBalance={account.balanceDisplay}
              timeZone={view.timeZone}
              defaultAsOf={view.queryTime}
            />
          )}
        </aside>
      </div>

      <section className="content-section">
        <div className="section-heading">
          <h2>余额锚点</h2>
          <span>{detail.snapshots.length} 条</span>
        </div>
        {detail.snapshots.length > 0 ? (
          <div className="snapshot-list">
            {detail.snapshots.map((snapshot) => {
              const updateSnapshot = updateSnapshotAction.bind(
                null,
                account.id,
                snapshot.id,
              );
              const deleteSnapshot = deleteSnapshotAction.bind(
                null,
                account.id,
                snapshot.id,
              );
              return (
                <article key={snapshot.id} className="snapshot-row">
                  <div>
                    <strong>{snapshot.balanceDisplay}</strong>
                    <time dateTime={snapshot.asOf}>
                      {dateLabel(snapshot.asOf, view.timeZone)}
                    </time>
                    <small>{snapshot.note ?? "余额锚点"}</small>
                  </div>
                  <details>
                    <summary>编辑</summary>
                    <ReconciliationForm
                      action={updateSnapshot}
                      assetCode={account.asset.code}
                      currentBalance={account.balanceDisplay}
                      initial={{
                        actualBalance: snapshot.balanceInput,
                        asOf: snapshot.asOf,
                        note: snapshot.note,
                      }}
                      timeZone={view.timeZone}
                      defaultAsOf={view.queryTime}
                    />
                    <ConfirmActionForm
                      action={deleteSnapshot}
                      message="删除该余额锚点后，将重新计算此时间点之后的余额。确认删除？"
                    >
                      删除锚点
                    </ConfirmActionForm>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-inline">该账户还没有余额锚点。</p>
        )}
      </section>

      <section className="content-section account-settings">
        <div className="section-heading">
          <h2>账户资料</h2>
        </div>
        <AccountForm
          action={updateAction}
          assets={view.assets}
          initial={account}
        />
        <div className="archive-action">
          <div>
            <strong>{account.isArchived ? "重新启用账户" : "归档账户"}</strong>
            <p>
              {account.isArchived
                ? "启用后可继续记账，并重新计入总览。"
                : "历史流水会保留；归档账户不再计入总览，也不能用于新交易。"}
            </p>
          </div>
          <ConfirmActionForm
            action={archiveAction}
            message={
              account.isArchived
                ? "确认重新启用这个账户？"
                : "确认归档这个账户？历史流水和余额锚点都会保留。"
            }
          >
            {account.isArchived ? "取消归档" : "归档账户"}
          </ConfirmActionForm>
        </div>
      </section>
    </div>
  );
}
