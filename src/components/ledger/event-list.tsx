import Link from "next/link";

import type { LedgerEventView } from "@/services";

const TYPE_LABELS = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  exchange: "兑换",
} as const;

function eventAmount(event: LedgerEventView) {
  const main = event.entries.find((entry) => entry.role === "main");
  const source = event.entries.find((entry) => entry.role === "source");
  const destination = event.entries.find(
    (entry) => entry.role === "destination",
  );

  if (main) {
    return <strong className="event-amount">{main.amountDisplay}</strong>;
  }
  if (source && destination && event.type === "exchange") {
    return (
      <strong className="event-amount event-amount-pair">
        {source.amountInput} {source.asset.code}
        <span aria-hidden="true"> → </span>
        {destination.amountInput} {destination.asset.code}
      </strong>
    );
  }
  if (source) {
    return (
      <strong className="event-amount">
        {source.amountInput} {source.asset.code}
      </strong>
    );
  }
  return null;
}

function eventContext(event: LedgerEventView): string {
  const main = event.entries.find((entry) => entry.role === "main");
  const source = event.entries.find((entry) => entry.role === "source");
  const destination = event.entries.find(
    (entry) => entry.role === "destination",
  );
  if (main) {
    return [event.categoryName ?? "未分类", main.accountName].join(" · ");
  }
  if (source && destination) {
    return `${source.accountName} → ${destination.accountName}`;
  }
  return TYPE_LABELS[event.type];
}

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function utcLabel(iso: string): string {
  return `${UTC_DATE_FORMATTER.format(new Date(iso))} UTC`;
}

export function EventList({
  events,
  emptyText = "还没有流水。",
}: {
  events: LedgerEventView[];
  emptyText?: string;
}) {
  if (events.length === 0) {
    return <p className="empty-inline">{emptyText}</p>;
  }
  return (
    <ol className="event-list">
      {events.map((event) => {
        const fee = event.entries.find((entry) => entry.role === "fee");
        return (
          <li key={event.id}>
            <Link className="event-row" href={`/transactions/${event.id}`}>
              <span className={`event-kind event-kind-${event.type}`}>
                {TYPE_LABELS[event.type]}
              </span>
              <span className="event-copy">
                <strong>{event.title}</strong>
                <small>
                  {eventContext(event)}
                  {fee ? ` · 手续费 ${fee.amountDisplay}` : ""}
                </small>
              </span>
              <span className="event-figure">
                {eventAmount(event)}
                <time dateTime={event.occurredAt}>
                  {utcLabel(event.occurredAt)}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
