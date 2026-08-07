import type { Metadata } from "next";
import Link from "next/link";

import { DomainValidationError } from "@/domain/errors";
import { monthInTimeZone, monthUtcRange } from "@/domain/time";
import {
  ReferenceDataService,
  ReportService,
  SettingsService,
} from "@/services";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "月度收支" };

function adjacentMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawMonthValue = (await searchParams).month;
  const rawMonth = Array.isArray(rawMonthValue)
    ? rawMonthValue[0]
    : rawMonthValue;
  const result = await withDatabase((context) => {
    const bookId = new ReferenceDataService(context).getDefaultBookId();
    const timeZone = new SettingsService(context).getTimeZoneOrDefault();
    const currentMonth = monthInTimeZone(new Date().toISOString(), timeZone);
    let month = rawMonth?.trim() || currentMonth;
    let warning: string | null = null;
    try {
      monthUtcRange(month, timeZone);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        month = currentMonth;
        warning = "月份格式无效，已显示当前月份。";
      } else {
        throw error;
      }
    }
    return {
      report: new ReportService(context).monthlyIncomeExpense({
        bookId,
        month,
      }),
      warning,
    };
  });

  const report = result.report;
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Income and expense by native asset</p>
          <h1>月度收支</h1>
          <p>每种资产独立统计 · {report.timeZone} · 不做行情或跨资产换算</p>
        </div>
      </header>

      <section className="content-section report-controls">
        <Link
          className="secondary-button"
          href={`/reports?month=${adjacentMonth(report.month, -1)}`}
        >
          上一月
        </Link>
        <form autoComplete="off" method="get">
          <label className="field">
            <span>报表月份</span>
            <input defaultValue={report.month} name="month" type="month" />
          </label>
          <button className="primary-button" type="submit">
            查看
          </button>
        </form>
        <Link
          className="secondary-button"
          href={`/reports?month=${adjacentMonth(report.month, 1)}`}
        >
          下一月
        </Link>
      </section>
      {result.warning ? (
        <p className="form-error" role="alert">
          {result.warning}
        </p>
      ) : null}

      {report.assets.length === 0 ? (
        <section className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            0
          </span>
          <h2>本月没有收支</h2>
          <p>转账与兑换本金不会显示为收入或支出。</p>
        </section>
      ) : (
        <div className="report-assets">
          {report.assets.map((bucket) => (
            <section
              className="content-section report-asset"
              key={bucket.asset.id}
            >
              <div className="section-heading">
                <div>
                  <p className="asset-code">{bucket.asset.code}</p>
                  <h2>{bucket.asset.name}</h2>
                </div>
                {bucket.asset.isArchived ? <span>已归档资产</span> : null}
              </div>
              <dl className="report-totals">
                <div>
                  <dt>收入</dt>
                  <dd>{bucket.incomeDisplay}</dd>
                </div>
                <div>
                  <dt>支出</dt>
                  <dd>{bucket.expenseDisplay}</dd>
                </div>
              </dl>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">分类</th>
                      <th scope="col">收入</th>
                      <th scope="col">支出</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.categories.map((category) => (
                      <tr key={category.key}>
                        <th scope="row">{category.name}</th>
                        <td>{category.incomeDisplay}</td>
                        <td>{category.expenseDisplay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
