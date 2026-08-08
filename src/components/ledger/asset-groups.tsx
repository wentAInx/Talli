import Link from "next/link";

import type { DashboardAssetGroupView } from "@/services";
import type { PortfolioValuationResult } from "@/domain/valuation";

import { homeValueDisplay, quoteStatusLabel } from "../valuation/display";

export function AssetGroups({
  groups,
  valuation,
}: {
  groups: DashboardAssetGroupView[];
  valuation?: PortfolioValuationResult | null;
}) {
  return (
    <div className="asset-groups">
      {groups.map((group, index) => {
        const valued = valuation?.lines.find(
          (line) => line.asset.id === group.asset.id,
        );
        return (
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
              <div className="asset-totals">
                <strong className="asset-total">{group.totalDisplay}</strong>
                {valued && valuation ? (
                  <div className="asset-valuation">
                    {valued.valueDisplay !== null ? (
                      <span data-testid={`asset-valuation-${group.asset.code}`}>
                        ≈{" "}
                        {homeValueDisplay(
                          valued.valueDisplay,
                          valuation.homeAsset,
                        )}
                      </span>
                    ) : (
                      <span>估值不可用</span>
                    )}
                    <small>{quoteStatusLabel(valued.resolution)}</small>
                  </div>
                ) : null}
              </div>
            </header>
            {valued?.resolution.ok && valued.resolution.legs.length > 0 ? (
              <ul
                className="quote-provenance"
                aria-label={`${group.asset.code} 估值来源`}
              >
                {valued.resolution.legs.map((leg) => (
                  <li
                    key={`${leg.baseAssetId}-${leg.quoteAssetId}-${leg.source}`}
                  >
                    {leg.label} · {leg.rateText}
                  </li>
                ))}
              </ul>
            ) : null}
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
        );
      })}
    </div>
  );
}
