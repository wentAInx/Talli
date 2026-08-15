import type { Metadata } from "next";

import {
  addLocalDateDays,
  enumerateLocalDates,
  lastCompletedLocalDate,
} from "@/domain/time";
import {
  PriceDecimal,
  decimalText,
  roundDecimalText,
} from "@/domain/price-decimal";
import {
  HistoricalAnalyticsService,
  HistoricalHistoryStatusService,
  ReferenceDataService,
  SettingsService,
} from "@/services";
import { AllocationPanel } from "@/components/analytics/allocation-panel";
import { HistoricalNetWorthChart } from "@/components/analytics/historical-net-worth-chart";
import { HistoryRefreshControl } from "@/components/analytics/history-refresh-control";
import { ConfirmActionForm } from "@/components/forms/confirm-action-form";
import { SettingsActionForm } from "@/components/forms/settings-action-form";

import { withDatabase } from "../server-runtime";
import {
  deleteHistoricalManualQuoteAction,
  saveHistoricalManualQuoteAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

function displayValue(value: string | null, code: string): string {
  return value === null ? "—" : `${roundDecimalText(value, 2)} ${code}`;
}

function displayInstant(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function signedChange(
  first: string | null,
  last: string | null,
): string | null {
  if (first === null || last === null) return null;
  return decimalText(new PriceDecimal(last).sub(new PriceDecimal(first)));
}

function safeRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
  lastCompleted: string,
) {
  const fallback = {
    fromDate: addLocalDateDays(lastCompleted, -29),
    toDate: lastCompleted,
    warning: null as string | null,
  };
  if (!rawFrom && !rawTo) return fallback;
  try {
    const fromDate = rawFrom ?? fallback.fromDate;
    const toDate = rawTo ?? fallback.toDate;
    enumerateLocalDates(fromDate, toDate, 5_000);
    if (toDate > lastCompleted) {
      throw new Error("open day");
    }
    return { fromDate, toDate, warning: null };
  } catch {
    return {
      ...fallback,
      warning:
        "日期范围无效、超过 5000 天，或包含尚未结束的 App 自然日；已显示最近 30 个完整日。",
    };
  }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const fromValue = Array.isArray(raw.from) ? raw.from[0] : raw.from;
  const toValue = Array.isArray(raw.to) ? raw.to[0] : raw.to;
  const now = new Date().toISOString();
  const result = await withDatabase((context) => {
    const references = new ReferenceDataService(context);
    const bookId = references.getDefaultBookId();
    const timeZone = new SettingsService(context).getTimeZoneOrDefault();
    const range = safeRange(
      fromValue,
      toValue,
      lastCompletedLocalDate(now, timeZone),
    );
    return {
      range,
      dashboard: new HistoricalAnalyticsService(context).dashboard({
        bookId,
        fromDate: range.fromDate,
        toDate: range.toDate,
      }),
      status: new HistoricalHistoryStatusService(context).read({ bookId }),
    };
  });
  const { dashboard, status, range } = result;
  const home = dashboard.homeAsset;
  const firstPoint = dashboard.series.points[0];
  const lastPoint = dashboard.series.points.at(-1);
  const change = signedChange(
    firstPoint?.completeValueText ?? null,
    lastPoint?.completeValueText ?? null,
  );
  const hasProviderHistory =
    status.coverage.crypto.length > 0 || status.coverage.fx.length > 0;
  const activeRun =
    status.recentRuns.find(
      (run) => run.nextAction !== "done" && run.nextAction !== "restart",
    ) ?? null;
  const latestRun = status.recentRuns[0] ?? null;
  const assetById = new Map(dashboard.assets.map((asset) => [asset.id, asset]));
  const selectableBaseAssets = dashboard.assets.filter(
    (asset) => asset.id !== home.id,
  );

  return (
    <div className="page-stack analytics-page">
      <header className="page-heading analytics-heading">
        <div>
          <p className="eyebrow">Derived historical valuation · V6.0</p>
          <h1>Analytics</h1>
          <p>
            Home Asset：{home.code} · App 时区：{dashboard.timeZone} ·
            截至每个本地自然日末
          </p>
        </div>
        <span
          className={
            dashboard.series.points.every((point) => point.isComplete)
              ? "analytics-status is-complete"
              : "analytics-status is-incomplete"
          }
        >
          {dashboard.series.points.every((point) => point.isComplete)
            ? "范围完整"
            : "存在报价缺口"}
        </span>
      </header>

      <section className="content-section analytics-range">
        <form autoComplete="off" method="get">
          <label className="field">
            <span>起始日期</span>
            <input
              defaultValue={range.fromDate}
              name="from"
              required
              type="date"
            />
          </label>
          <label className="field">
            <span>结束日期</span>
            <input defaultValue={range.toDate} name="to" required type="date" />
          </label>
          <button className="primary-button" type="submit">
            查看范围
          </button>
        </form>
        <p>默认不包含今天；最大 5000 个完整自然日。</p>
      </section>
      {range.warning ? (
        <p className="form-error" role="alert">
          {range.warning}
        </p>
      ) : null}

      {!hasProviderHistory && dashboard.manualQuotes.length === 0 ? (
        <section className="empty-state analytics-empty-history">
          <span aria-hidden="true" className="empty-mark">
            ↗
          </span>
          <h2>还没有历史报价缓存</h2>
          <p>
            先显式刷新 provider 历史，或为缺失资产添加指定日期的手工 exact-pair
            价格。缺失值不会按 0 计。
          </p>
        </section>
      ) : null}

      <section className="analytics-kpis" aria-label="历史净值摘要">
        <article className="content-section analytics-kpi is-primary">
          <span>≈ 期末净值</span>
          <strong>
            {displayValue(lastPoint?.completeValueText ?? null, home.code)}
          </strong>
          <small>
            {lastPoint?.isComplete
              ? lastPoint.isDegraded
                ? "完整 · 含回退报价"
                : "完整报价"
              : `已知小计 ${displayValue(lastPoint?.knownValueText ?? "0", home.code)}`}
          </small>
        </article>
        <article className="content-section analytics-kpi">
          <span>区间变化</span>
          <strong>{displayValue(change, home.code)}</strong>
          <small>
            {range.fromDate} → {range.toDate}
          </small>
        </article>
        <article className="content-section analytics-kpi">
          <span>Gross assets</span>
          <strong>
            {displayValue(dashboard.allocation.grossAssetsText, home.code)}
          </strong>
          <small>只以正值作为配置占比分母</small>
        </article>
        <article className="content-section analytics-kpi is-liability">
          <span>Liabilities</span>
          <strong>
            {displayValue(dashboard.allocation.grossLiabilitiesText, home.code)}
          </strong>
          <small>负值单列，不塞入 pie denominator</small>
        </article>
      </section>

      <section className="content-section analytics-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Daily end-of-day series</p>
            <h2>历史净值</h2>
          </div>
          <span>{dashboard.series.points.length} points</span>
        </div>
        <HistoricalNetWorthChart
          points={dashboard.series.points}
          homeCode={home.code}
        />
      </section>

      <div className="analytics-two-column">
        <section className="content-section analytics-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Positive holdings only</p>
              <h2>资产配置</h2>
            </div>
            <span>{dashboard.allocation.localDate}</span>
          </div>
          <AllocationPanel result={dashboard.allocation} homeCode={home.code} />
        </section>

        <section className="content-section analytics-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Provider cache · foreground only</p>
              <h2>历史数据状态</h2>
            </div>
            <span>{hasProviderHistory ? "有缓存" : "待刷新"}</span>
          </div>
          <HistoryRefreshControl
            fromDate={range.fromDate}
            resumeRun={activeRun ?? latestRun}
            toDate={range.toDate}
          />
          <dl className="history-status-grid">
            <div>
              <dt>CoinGecko coverage</dt>
              <dd>{status.coverage.crypto.length} assets</dd>
            </div>
            <div>
              <dt>ECB coverage</dt>
              <dd>{status.coverage.fx.length} currencies</dd>
            </div>
            <div>
              <dt>Manual overrides</dt>
              <dd>{status.manualQuotes}</dd>
            </div>
            <div>
              <dt>Missing mappings</dt>
              <dd>{status.missingMappings.length}</dd>
            </div>
            <div className="history-status-wide">
              <dt>Last refresh</dt>
              <dd>
                {latestRun
                  ? `${latestRun.status} · ${displayInstant(latestRun.updatedAt, dashboard.timeZone)}`
                  : "尚未刷新"}
              </dd>
            </div>
          </dl>
          {status.missingMappings.length > 0 ? (
            <p className="analytics-warning" role="status">
              缺映射：
              {status.missingMappings.map((asset) => asset.code).join("、")}
            </p>
          ) : null}
          <ul className="analytics-sources">
            {status.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="content-section analytics-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Event-time valuation · monthly buckets</p>
            <h2>历史现金流</h2>
          </div>
          <span>Income · expense · fees</span>
        </div>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">月份</th>
                <th scope="col">收入</th>
                <th scope="col">支出</th>
                <th scope="col">手续费</th>
                <th scope="col">净流量</th>
                <th scope="col">完整性</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.cashFlow.buckets.map((bucket) => (
                <tr key={bucket.period}>
                  <th scope="row">{bucket.period}</th>
                  <td>{displayValue(bucket.incomeText, home.code)}</td>
                  <td>{displayValue(bucket.expenseText, home.code)}</td>
                  <td>{displayValue(bucket.feesText, home.code)}</td>
                  <td>{displayValue(bucket.netFlowText, home.code)}</td>
                  <td>
                    {bucket.isComplete
                      ? "完整"
                      : `缺 ${bucket.missingCount} 个 event-time 报价`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section analytics-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Exact valuation-change identity</p>
            <h2>净值变化桥接</h2>
          </div>
          <span>不是税务成本基础或已实现盈亏</span>
        </div>
        <p className="analytics-callout">
          这是代数估值变化归因：Market & FX + 数量事件 + snapshot
          reconciliation。它不计算 tax lots、FIFO/LIFO 或 realized P&amp;L。
        </p>
        <div className="report-table-wrap">
          <table className="report-table bridge-table">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">Δ Net worth</th>
                <th scope="col">Market &amp; FX</th>
                <th scope="col">Income</th>
                <th scope="col">Expense</th>
                <th scope="col">Fees</th>
                <th scope="col">Trade / rebalance</th>
                <th scope="col">Reconciliation</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.decomposition.points.map((point) => (
                <tr key={point.localDate}>
                  <th scope="row">{point.localDate}</th>
                  <td>{displayValue(point.deltaText, home.code)}</td>
                  <td>{displayValue(point.marketAndFxText, home.code)}</td>
                  <td>{displayValue(point.incomeText, home.code)}</td>
                  <td>{displayValue(point.expenseText, home.code)}</td>
                  <td>{displayValue(point.feesText, home.code)}</td>
                  <td>{displayValue(point.tradeRebalanceText, home.code)}</td>
                  <td>{displayValue(point.reconciliationText, home.code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dashboard.decomposition.points.some(
          (point) =>
            point.internalTransferText !== "0" &&
            point.internalTransferText !== null,
        ) ? (
          <p className="analytics-warning" role="alert">
            检测到非零 internal-transfer effect，请审查跨资产/数据不变量。
          </p>
        ) : null}
      </section>

      <section
        className="content-section analytics-section"
        id="manual-history"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">User-authored · Backup V8</p>
            <h2>手工历史价格</h2>
          </div>
          <span>Exact base → {home.code} / date</span>
        </div>
        <p className="analytics-callout">
          仅作用于指定自然日和精确资产对；不会回写
          Ledger，也不会复用“当前手动价格”。归档资产仍可补录历史事实。
        </p>
        <SettingsActionForm
          action={saveHistoricalManualQuoteAction}
          className="analytics-manual-form"
          submitLabel="保存历史价格"
        >
          <div className="settings-form-grid">
            <label className="field">
              <span>基础资产</span>
              <select name="baseAssetId" required>
                {selectableBaseAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                    {asset.isArchived ? "（已归档）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>报价资产</span>
              <input readOnly value={`${home.code} · ${home.name}`} />
              <input name="quoteAssetId" type="hidden" value={home.id} />
            </label>
            <label className="field">
              <span>估值日期</span>
              <input
                defaultValue={range.toDate}
                name="valuationDate"
                required
                type="date"
              />
            </label>
            <label className="field">
              <span>1 基础资产 = {home.code}</span>
              <input
                inputMode="decimal"
                name="rateText"
                placeholder="例如 476000.25…"
                required
              />
            </label>
          </div>
          <label className="field">
            <span>备注（可选）</span>
            <input maxLength={1000} name="note" />
          </label>
        </SettingsActionForm>
        <div className="settings-records compact-records analytics-manual-records">
          {dashboard.manualQuotes.map((quote) => {
            const base = assetById.get(quote.baseAssetId);
            const target = assetById.get(quote.quoteAssetId);
            return (
              <details className="settings-record" key={quote.id}>
                <summary>
                  <span>
                    <strong>{base?.code ?? quote.baseAssetId}</strong> →{" "}
                    {target?.code ?? quote.quoteAssetId}
                  </span>
                  <small>
                    {quote.valuationDate} · {quote.rateText}
                  </small>
                </summary>
                <SettingsActionForm
                  action={saveHistoricalManualQuoteAction}
                  className="analytics-manual-form"
                  submitLabel="更新历史价格"
                >
                  <input name="id" type="hidden" value={quote.id} />
                  <input
                    name="baseAssetId"
                    type="hidden"
                    value={quote.baseAssetId}
                  />
                  <input
                    name="quoteAssetId"
                    type="hidden"
                    value={quote.quoteAssetId}
                  />
                  <div className="settings-form-grid">
                    <label className="field">
                      <span>估值日期</span>
                      <input
                        defaultValue={quote.valuationDate}
                        name="valuationDate"
                        required
                        type="date"
                      />
                    </label>
                    <label className="field">
                      <span>价格</span>
                      <input
                        defaultValue={quote.rateText}
                        inputMode="decimal"
                        name="rateText"
                        required
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>备注</span>
                    <input
                      defaultValue={quote.note ?? ""}
                      maxLength={1000}
                      name="note"
                    />
                  </label>
                </SettingsActionForm>
                <ConfirmActionForm
                  action={deleteHistoricalManualQuoteAction.bind(
                    null,
                    quote.id,
                  )}
                  message="删除这条手工历史价格？Provider 缓存不会替代它写入 Backup。"
                >
                  删除历史价格
                </ConfirmActionForm>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
