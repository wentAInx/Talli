import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecurringTimeline } from "@/components/automation/recurring-timeline";
import {
  findAccountWithAsset,
  findLedgerEventById,
  listCategoriesForBook,
  listTagsForBook,
} from "@/db/queries";
import { formatAtomic } from "@/domain/money";
import { addLocalDays } from "@/domain/recurring";
import { utcInstantToLocalDateTime } from "@/domain/time";
import {
  RecurringItemService,
  RecurringMatchService,
  SettingsService,
} from "@/services";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recurring timeline" };

export default async function RecurringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await withDatabase((context) => {
    const recurring = new RecurringItemService(context);
    const item = recurring.get(id);
    if (!item) return null;
    const account = findAccountWithAsset(context.db, item.accountId);
    if (!account) return null;
    const timeZone = new SettingsService(context).getTimeZoneOrDefault();
    const currentLocalDate = utcInstantToLocalDateTime(
      new Date().toISOString(),
      timeZone,
    ).slice(0, 10);
    const amount = (value: bigint) =>
      formatAtomic(value, account.asset.scale, { trimTrailingZeros: false });
    const expectationDisplay =
      item.amountMode === "range"
        ? `${amount(item.minAmountAtomic!)}–${amount(item.maxAmountAtomic!)} ${account.asset.code}`
        : `${item.amountMode === "approx" ? "≈" : ""}${amount(item.amountAtomic!)} ${account.asset.code}`;
    const defaultActualAmount =
      item.amountMode === "range"
        ? amount(item.minAmountAtomic!)
        : amount(item.amountAtomic!);
    const matcher = new RecurringMatchService(context);
    const occurrences = recurring
      .occurrences({
        recurringItemId: item.id,
        fromDate: addLocalDays(currentLocalDate, -30),
        toDate: addLocalDays(currentLocalDate, 90),
        currentLocalDate,
      })
      .slice(0, 60)
      .map((occurrence, index) => ({
        ...occurrence,
        suggestions:
          item.isActive &&
          index < 20 &&
          occurrence.status !== "linked" &&
          occurrence.status !== "skipped"
            ? matcher
                .suggestionsForOccurrence({
                  recurringItemId: item.id,
                  occurrenceDate: occurrence.occurrenceDate,
                })
                .filter((suggestion) => suggestion.ledgerEventId)
                .slice(0, 5)
                .map((suggestion) => {
                  const event = findLedgerEventById(
                    context.db,
                    suggestion.ledgerEventId!,
                  );
                  return {
                    ...suggestion,
                    occurredAt: event?.occurredAt,
                    payee: event?.payee,
                  };
                })
            : [],
      }));
    return {
      item: {
        id: item.id,
        name: item.name,
        eventType: item.eventType,
        payeeText: item.payeeText,
        categoryId: item.categoryId,
        tagIds: item.tagIds,
        note: item.note,
        isActive: item.isActive,
        frequency: item.frequency,
        intervalCount: item.intervalCount,
        anchorDate: item.anchorDate,
        monthlyDayMode: item.monthlyDayMode,
        expectationDisplay,
        defaultActualAmount,
      },
      account: {
        name: account.account.name,
        assetCode: account.asset.code,
      },
      occurrences,
      categories: listCategoriesForBook(context.db, item.bookId)
        .filter(
          (category) =>
            !category.isArchived &&
            (category.categoryType === "both" ||
              category.categoryType === item.eventType),
        )
        .map(({ id, name }) => ({ id, name })),
      tags: listTagsForBook(context.db, item.bookId)
        .filter((tag) => !tag.isArchived)
        .map(({ id, name }) => ({ id, name })),
    };
  });
  if (!data) notFound();

  return (
    <div className="page-stack recurring-detail-page">
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/automation?tab=recurring">
            ← Back to Recurring
          </Link>
          <p className="eyebrow">Generated timeline · no future transactions</p>
          <h1>{data.item.name}</h1>
          <p>
            {data.item.eventType} · {data.account.name} ·{" "}
            {data.item.expectationDisplay}
          </p>
        </div>
        <span
          className={`rule-state ${data.item.isActive ? "enabled" : "disabled"}`}
        >
          {data.item.isActive ? "Active" : "Archived"}
        </span>
      </header>
      <section className="content-section recurring-definition-summary">
        <dl className="credential-facts">
          <div>
            <dt>Cadence</dt>
            <dd>
              {data.item.frequency} · every {data.item.intervalCount}
            </dd>
          </div>
          <div>
            <dt>Anchor</dt>
            <dd>{data.item.anchorDate}</dd>
          </div>
          <div>
            <dt>Monthly mode</dt>
            <dd>{data.item.monthlyDayMode ?? "not applicable"}</dd>
          </div>
          <div>
            <dt>Boundary</dt>
            <dd>Expectation only · explicit Post / Link required</dd>
          </div>
        </dl>
      </section>
      {!data.item.isActive ? (
        <aside className="candidate-warnings">
          <strong>Archived definition</strong>
          <p>
            History remains visible. Restore the item before creating new links,
            skips, or Ledger events.
          </p>
        </aside>
      ) : null}
      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Bounded local-date window</p>
            <h2>Occurrences</h2>
          </div>
          <span>{data.occurrences.length} generated in memory</span>
        </div>
        <RecurringTimeline
          categories={data.categories}
          item={{
            payeeText: data.item.payeeText,
            categoryId: data.item.categoryId,
            tagIds: data.item.tagIds,
            note: data.item.note,
            expectedAmount: data.item.expectationDisplay,
            defaultActualAmount: data.item.defaultActualAmount,
          }}
          occurrences={data.occurrences}
          recurringItemId={data.item.id}
          tags={data.tags}
        />
      </section>
    </div>
  );
}
