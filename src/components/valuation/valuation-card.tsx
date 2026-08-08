import type { PortfolioValuationResult } from "@/domain/valuation";

import { homeValueDisplay, quoteFailureMessage } from "./display";
import { RefreshPrices } from "./refresh-prices";

export function ValuationCard({
  valuation,
  timeZone,
}: {
  valuation: PortfolioValuationResult | null;
  timeZone: string;
}) {
  if (!valuation) {
    return (
      <section className="valuation-card valuation-card-empty">
        <div>
          <p className="eyebrow">Approximate current valuation</p>
          <h2>尚未设置估值币种</h2>
          <p>选择 Home Asset 后可查看近似总资产。</p>
        </div>
        <a className="primary-button" href="/settings#valuation">
          前往估值设置
        </a>
      </section>
    );
  }

  const nonZeroCount =
    valuation.valuedNonZeroAssetCount + valuation.missingNonZeroAssetCount;
  const missing = valuation.lines.filter(
    (line) => line.quantityAtomic !== "0" && !line.resolution.ok,
  );
  const fetchedAt = valuation.lines
    .flatMap((line) =>
      line.resolution.ok
        ? line.resolution.legs.flatMap((leg) =>
            leg.fetchedAt ? [leg.fetchedAt] : [],
          )
        : [],
    )
    .sort()
    .at(-1);
  const autoRefresh = valuation.lines.some(
    (line) =>
      line.quantityAtomic !== "0" &&
      ((line.resolution.ok && line.resolution.status === "stale") ||
        (!line.resolution.ok &&
          ["missing_quote", "provider_error"].includes(
            line.resolution.status,
          ))),
  );
  const totalLabel = valuation.isComplete
    ? "估算总资产"
    : "已估值部分（不完整）";

  return (
    <section
      aria-label={totalLabel}
      className={`valuation-card ${valuation.isComplete ? "is-complete" : "is-incomplete"}`}
      data-testid="valuation-card"
    >
      <div className="valuation-card-main">
        <p className="eyebrow">Approximate current valuation</p>
        <h2>{totalLabel}</h2>
        <strong
          aria-label={`${totalLabel} ${valuation.totalValueDisplay} ${valuation.homeAsset.code}`}
          className="valuation-total"
          data-testid="valuation-total"
        >
          ≈ {homeValueDisplay(valuation.totalValueDisplay, valuation.homeAsset)}
        </strong>
        <p>
          {valuation.valuedNonZeroAssetCount} / {nonZeroCount} 个非零资产已估值
          · {valuation.isComplete ? "估值完整" : "估值不完整"}
        </p>
        {fetchedAt ? (
          <small>
            最近缓存：
            {new Intl.DateTimeFormat("zh-CN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone,
            }).format(new Date(fetchedAt))}
          </small>
        ) : null}
      </div>
      <RefreshPrices autoRefresh={autoRefresh} />
      {missing.length > 0 ? (
        <details className="valuation-missing">
          <summary>{missing.length} 个非零资产缺少可用价格</summary>
          <ul>
            {missing.map((line) => (
              <li key={line.asset.id}>
                <strong>{line.quantityDisplay}</strong>
                <span>{quoteFailureMessage(line.resolution)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
