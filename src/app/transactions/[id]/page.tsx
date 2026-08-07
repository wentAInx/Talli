import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteLedgerEventAction,
  updateLedgerEventAction,
} from "@/app/actions";
import { ConfirmActionForm } from "@/components/forms/confirm-action-form";
import { TransactionForm } from "@/components/forms/transaction-form";
import { LedgerReadService, SettingsService } from "@/services";

import { withDatabase } from "../../server-runtime";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await withDatabase((context) => {
    const service = new LedgerReadService(context);
    try {
      return {
        event: service.getEvent(id),
        reference: service.getReferenceData(new Date().toISOString()),
        timeZone: new SettingsService(context).getTimeZoneOrDefault(),
        now: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  });
  if (!view) {
    notFound();
  }
  const updateAction = updateLedgerEventAction.bind(null, view.event.id);
  const deleteAction = deleteLedgerEventAction.bind(null, view.event.id);

  return (
    <div className="transaction-page page-stack">
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/transactions">
            ← 返回流水
          </Link>
          <p className="eyebrow">Edit logical event</p>
          <h1>编辑{view.event.title}</h1>
          <p>保存后会在一个数据库 transaction 内原子替换事件与分录。</p>
        </div>
      </header>
      <section className="form-card transaction-card">
        <TransactionForm
          action={updateAction}
          accounts={view.reference.accounts}
          categories={view.reference.categories}
          tags={view.reference.tags}
          initial={view.event}
          allowReconcile={false}
          timeZone={view.timeZone}
          defaultOccurredAt={view.now}
        />
      </section>
      <section className="danger-zone">
        <div>
          <h2>删除这笔流水</h2>
          <p>删除后将重新计算相关账户余额。此操作无法撤销。</p>
        </div>
        <ConfirmActionForm
          action={deleteAction}
          message="删除后将重新计算相关账户余额。此操作无法撤销。确认删除？"
        >
          删除交易
        </ConfirmActionForm>
      </section>
    </div>
  );
}
