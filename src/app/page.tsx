import Link from "next/link";

import { AssetGroups } from "@/components/ledger/asset-groups";
import { EventList } from "@/components/ledger/event-list";
import { LedgerReadService, SettingsService } from "@/services";

import { withDatabase } from "./server-runtime";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const queryTime = new Date().toISOString();
  const view = await withDatabase((context) => ({
    dashboard: new LedgerReadService(context).getDashboard(queryTime),
    timeZone: new SettingsService(context).getTimeZoneOrDefault(),
  }));
  const { dashboard } = view;

  return (
    <div className="page-stack">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">Native quantities · 原生数量</p>
          <h1>资产总览</h1>
          <p>
            {dashboard.assetCount} 种资产 · {dashboard.activeAccountCount}{" "}
            个活跃账户
          </p>
        </div>
      </header>

      {dashboard.assetGroups.length > 0 ? (
        <AssetGroups groups={dashboard.assetGroups} />
      ) : (
        <section className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            0
          </span>
          <h2>还没有账户</h2>
          <p>先添加一个账户，并按需要设置初始余额。</p>
          <Link className="primary-button" href="/accounts/new">
            + 添加账户
          </Link>
        </section>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Latest ledger events</p>
            <h2>最近流水</h2>
          </div>
          <Link href="/transactions">查看全部</Link>
        </div>
        <EventList
          events={dashboard.recentEvents}
          timeZone={view.timeZone}
          emptyText="录入第一笔交易后，逻辑事件会显示在这里。"
        />
      </section>
    </div>
  );
}
