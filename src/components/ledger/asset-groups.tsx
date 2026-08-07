import Link from "next/link";

import type { DashboardAssetGroupView } from "@/services";

export function AssetGroups({ groups }: { groups: DashboardAssetGroupView[] }) {
  return (
    <div className="asset-groups">
      {groups.map((group, index) => (
        <article
          key={group.asset.id}
          className="asset-group"
          data-testid={`asset-group-${group.asset.code}`}
          style={{ "--asset-index": index } as React.CSSProperties}
        >
          <header className="asset-group-header">
            <div>
              <h2 className="asset-code">{group.asset.code}</h2>
              <span className="asset-name">{group.asset.name}</span>
            </div>
            <strong className="asset-total">{group.totalDisplay}</strong>
          </header>
          <ul className="account-breakdown">
            {group.accounts.map((account) => (
              <li key={account.id}>
                <Link href={`/accounts/${account.id}`}>
                  <span>
                    <strong>{account.name}</strong>
                    <small>{account.institutionName ?? "独立账户"}</small>
                  </span>
                  <span className="money-text">{account.balanceDisplay}</span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
