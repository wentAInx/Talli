import type { Metadata } from "next";
import Link from "next/link";

import { createLedgerOperationAction } from "@/app/actions";
import { TransactionForm } from "@/components/forms/transaction-form";
import { LedgerReadService, SettingsService } from "@/services";

import { withDatabase } from "../../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "记一笔" };

const TYPES = [
  "expense",
  "income",
  "transfer",
  "exchange",
  "reconcile",
] as const;

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initialType = TYPES.includes(type as (typeof TYPES)[number])
    ? (type as (typeof TYPES)[number])
    : "expense";
  const view = await withDatabase((context) => {
    const now = new Date().toISOString();
    return {
      reference: new LedgerReadService(context).getReferenceData(now),
      timeZone: new SettingsService(context).getTimeZoneOrDefault(),
      now,
    };
  });

  return (
    <div className="transaction-page page-stack">
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/transactions">
            ← 返回流水
          </Link>
          <h1>记一笔</h1>
          <p>选择操作类型；资产、方向与精度会在服务端再次校验。</p>
        </div>
      </header>
      {view.reference.accounts.length > 0 ? (
        <section className="form-card transaction-card">
          <TransactionForm
            action={createLedgerOperationAction}
            accounts={view.reference.accounts}
            categories={view.reference.categories}
            tags={view.reference.tags}
            initialType={initialType}
            timeZone={view.timeZone}
            defaultOccurredAt={view.now}
          />
        </section>
      ) : (
        <section className="empty-state">
          <h2>请先添加账户</h2>
          <p>交易必须写入一个明确绑定原生资产的账户。</p>
          <Link className="primary-button" href="/accounts/new">
            + 添加账户
          </Link>
        </section>
      )}
    </div>
  );
}
