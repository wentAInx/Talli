import type { Metadata } from "next";
import Link from "next/link";

import { EventList } from "@/components/ledger/event-list";
import {
  TransactionFilters,
  type TransactionFilterValues,
} from "@/components/ledger/transaction-filters";
import { DomainValidationError } from "@/domain/errors";
import { localDateRangeToUtc } from "@/domain/time";
import { LedgerReadService, ServiceError, SettingsService } from "@/services";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "流水" };

type SearchParams = Record<string, string | string[] | undefined>;

function valueOf(value: string | string[] | undefined): string | undefined {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected?.trim() || undefined;
}

function nextPageHref(values: TransactionFilterValues, cursor: string): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      query.set(key, value);
    }
  }
  query.set("cursor", cursor);
  return `/transactions?${query.toString()}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const values: TransactionFilterValues = {
    from: valueOf(params.from),
    to: valueOf(params.to),
    type: valueOf(params.type),
    account: valueOf(params.account),
    asset: valueOf(params.asset),
    category: valueOf(params.category),
    tag: valueOf(params.tag),
    q: valueOf(params.q),
  };
  const cursor = valueOf(params.cursor);
  const eventType = ["expense", "income", "transfer", "exchange"].includes(
    values.type ?? "",
  )
    ? (values.type as "expense" | "income" | "transfer" | "exchange")
    : undefined;
  const typeWarning =
    values.type && !eventType ? "交易类型无效，已忽略该条件。" : null;

  const result = await withDatabase((context) => {
    const reads = new LedgerReadService(context);
    const timeZone = new SettingsService(context).getTimeZoneOrDefault();
    const dateFilter = (() => {
      try {
        return {
          range: localDateRangeToUtc(
            { from: values.from, to: values.to },
            timeZone,
          ),
          warning: null,
        };
      } catch (error) {
        if (error instanceof DomainValidationError) {
          return {
            range: {} as ReturnType<typeof localDateRangeToUtc>,
            warning: "日期范围无效，已忽略日期条件。",
          };
        }
        throw error;
      }
    })();

    const input = {
      ...dateFilter.range,
      eventType,
      accountId: values.account,
      assetId: values.asset,
      categoryId: values.category,
      tagId: values.tag,
      query: values.q,
      cursor,
      limit: 50,
    };
    try {
      return {
        page: reads.listEventPage(input),
        references: reads.getEventFilterReferences(),
        timeZone,
        warning: dateFilter.warning ?? typeWarning,
      };
    } catch (error) {
      if (cursor && error instanceof ServiceError) {
        return {
          page: reads.listEventPage({ ...input, cursor: undefined }),
          references: reads.getEventFilterReferences(),
          timeZone,
          warning: "翻页链接无效，已回到筛选结果第一页。",
        };
      }
      throw error;
    }
  });

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Logical ledger events</p>
          <h1>流水</h1>
          <p>转账和兑换按一笔逻辑事件展示 · 日期按 {result.timeZone} 解释</p>
        </div>
      </header>
      <section className="content-section">
        <div className="section-heading">
          <h2>筛选流水</h2>
          <span>每页最多 50 笔</span>
        </div>
        <TransactionFilters values={values} references={result.references} />
        {result.warning ? (
          <p className="form-error" role="alert">
            {result.warning}
          </p>
        ) : null}
      </section>
      <section className="content-section">
        <EventList
          events={result.page.events}
          timeZone={result.timeZone}
          emptyText="还没有流水。先添加账户，再记录第一笔交易。"
        />
        {result.page.nextCursor ? (
          <nav className="pagination" aria-label="流水翻页">
            <Link
              className="secondary-button"
              href={nextPageHref(values, result.page.nextCursor)}
            >
              下一页
            </Link>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
