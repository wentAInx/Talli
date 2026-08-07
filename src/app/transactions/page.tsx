import { EventList } from "@/components/ledger/event-list";
import { LedgerReadService } from "@/services";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const events = await withDatabase((context) =>
    new LedgerReadService(context).listEvents(50),
  );
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Logical ledger events</p>
          <h1>流水</h1>
          <p>最近 50 笔逻辑事件；转账和兑换按一笔操作展示。</p>
        </div>
      </header>
      <section className="content-section">
        <EventList
          events={events}
          emptyText="还没有流水。先添加账户，再记录第一笔交易。"
        />
      </section>
    </div>
  );
}
