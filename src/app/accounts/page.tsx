import Link from "next/link";

import { LedgerReadService } from "@/services";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await withDatabase((context) =>
    new LedgerReadService(context).listAccounts(new Date().toISOString()),
  );
  const active = accounts.filter((account) => !account.isArchived);
  const archived = accounts.filter((account) => account.isArchived);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Accounts by native asset</p>
          <h1>账户</h1>
          <p>一个账户只绑定一种资产；各资产余额保持独立。</p>
        </div>
        <Link className="primary-button" href="/accounts/new">
          + 添加账户
        </Link>
      </header>

      <section className="content-section">
        <div className="section-heading">
          <h2>活跃账户</h2>
          <span>{active.length} 个</span>
        </div>
        {active.length > 0 ? (
          <ul className="account-list">
            {active.map((account) => (
              <li key={account.id}>
                <Link href={`/accounts/${account.id}`}>
                  <span className="account-list-code">
                    {account.asset.code}
                  </span>
                  <span className="account-list-copy">
                    <strong>{account.name}</strong>
                    <small>
                      {account.institutionName ?? "独立账户"} ·{" "}
                      {account.asset.name}
                    </small>
                  </span>
                  <strong className="money-text">
                    {account.balanceDisplay}
                  </strong>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-inline">
            还没有账户。添加账户时可以设置真实初始余额。
          </div>
        )}
      </section>

      {archived.length > 0 ? (
        <section className="content-section muted-section">
          <div className="section-heading">
            <h2>已归档</h2>
            <span>{archived.length} 个</span>
          </div>
          <ul className="account-list archived-list">
            {archived.map((account) => (
              <li key={account.id}>
                <Link href={`/accounts/${account.id}`}>
                  <span className="account-list-code">
                    {account.asset.code}
                  </span>
                  <span className="account-list-copy">
                    <strong>{account.name}</strong>
                    <small>已归档 · 不计入总览</small>
                  </span>
                  <strong className="money-text">
                    {account.balanceDisplay}
                  </strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
