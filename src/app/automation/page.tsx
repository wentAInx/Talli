import type { Metadata } from "next";
import Link from "next/link";

import {
  RecurringManager,
  type RecurringPrefill,
} from "@/components/automation/recurring-manager";
import { RulesManager } from "@/components/automation/rules-manager";
import {
  findAccountWithAsset,
  findEntriesForEvent,
  findExternalConnection,
  findLedgerEventById,
  findTagIdsForEvent,
  listAccountsForBook,
  listCategoriesForBook,
  listFileImportProfiles,
  listTagsForBook,
} from "@/db/queries";
import { addLocalDays } from "@/domain/recurring";
import { formatAtomic } from "@/domain/money";
import {
  AutomationRuleService,
  FileImportReadService,
  RecurringCalendarService,
  RecurringItemService,
  ReferenceDataService,
} from "@/services";

import { buildCandidateRecurringPrefill } from "./recurring-prefill";
import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automation" };

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    fromEvent?: string;
    fromCandidate?: string;
  }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "recurring" ? "recurring" : "rules";
  const data = await withDatabase((context) => {
    const references = new ReferenceDataService(context);
    const bookId = references.getDefaultBookId();
    const calendar = new RecurringCalendarService(context);
    const currentLocalDate = calendar.currentLocalDate();
    const allAccounts = listAccountsForBook(context.db, bookId).flatMap(
      (account) => {
        const withAsset = findAccountWithAsset(context.db, account.id);
        return withAsset
          ? [
              {
                id: account.id,
                name: account.name,
                assetCode: withAsset.asset.code,
                assetScale: withAsset.asset.scale,
                isArchived: account.isArchived || withAsset.asset.isArchived,
              },
            ]
          : [];
      },
    );
    const accounts = allAccounts.filter((account) => !account.isArchived);
    const categories = listCategoriesForBook(context.db, bookId).filter(
      (category) => !category.isArchived,
    );
    const tags = listTagsForBook(context.db, bookId).filter(
      (tag) => !tag.isArchived,
    );
    const profiles = listFileImportProfiles(context.db).flatMap((profile) => {
      const connection = findExternalConnection(
        context.db,
        profile.connectionId,
      );
      return connection?.bookId === bookId && connection.isEnabled
        ? [{ id: profile.connectionId, name: connection.name }]
        : [];
    });
    const recurringService = new RecurringItemService(context);
    const recurring = recurringService.list(bookId).map((item) => {
      const account = allAccounts.find(
        (candidate) => candidate.id === item.accountId,
      )!;
      const amount = (value: bigint) =>
        formatAtomic(value, account.assetScale, { trimTrailingZeros: false });
      const expectationDisplay =
        item.amountMode === "range"
          ? `${amount(item.minAmountAtomic!)}–${amount(item.maxAmountAtomic!)} ${account.assetCode}`
          : `${item.amountMode === "approx" ? "≈" : ""}${amount(item.amountAtomic!)} ${account.assetCode}`;
      const next = item.isActive
        ? (recurringService
            .occurrences({
              recurringItemId: item.id,
              fromDate: currentLocalDate,
              toDate: addLocalDays(currentLocalDate, 366),
              currentLocalDate,
            })
            .find(
              (occurrence) =>
                occurrence.status !== "linked" &&
                occurrence.status !== "skipped",
            ) ?? null)
        : null;
      return {
        id: item.id,
        name: item.name,
        eventType: item.eventType,
        accountId: item.accountId,
        accountName: account.name,
        assetCode: account.assetCode,
        payeeText: item.payeeText,
        payeeMatchMode: item.payeeMatchMode,
        categoryId: item.categoryId,
        tagIds: item.tagIds,
        note: item.note,
        amountMode: item.amountMode,
        amount: item.amountAtomic === null ? null : amount(item.amountAtomic),
        toleranceBps: item.toleranceBps,
        minAmount:
          item.minAmountAtomic === null ? null : amount(item.minAmountAtomic),
        maxAmount:
          item.maxAmountAtomic === null ? null : amount(item.maxAmountAtomic),
        expectationDisplay,
        frequency: item.frequency,
        intervalCount: item.intervalCount,
        anchorDate: item.anchorDate,
        monthlyDayMode: item.monthlyDayMode,
        dateWindowBeforeDays: item.dateWindowBeforeDays,
        dateWindowAfterDays: item.dateWindowAfterDays,
        startsOn: item.startsOn,
        endsOn: item.endsOn,
        isActive: item.isActive,
        nextOccurrence: next?.occurrenceDate ?? null,
        nextStatus: next?.status ?? null,
      };
    });
    let recurringPrefill: RecurringPrefill | null = null;
    if (params.fromEvent) {
      const event = findLedgerEventById(context.db, params.fromEvent);
      const mainEntries = event
        ? findEntriesForEvent(context.db, event.id).filter(
            (entry) => entry.entryRole === "main",
          )
        : [];
      const main = mainEntries.length === 1 ? mainEntries[0]! : null;
      const account = main
        ? allAccounts.find((candidate) => candidate.id === main.accountId)
        : null;
      if (
        event &&
        main &&
        account &&
        !account.isArchived &&
        (event.eventType === "expense" || event.eventType === "income")
      ) {
        const signedAtomic = BigInt(main.amountAtomic);
        const directionIsValid =
          event.eventType === "expense" ? signedAtomic < 0n : signedAtomic > 0n;
        if (directionIsValid) {
          const magnitude = signedAtomic < 0n ? -signedAtomic : signedAtomic;
          recurringPrefill = {
            sourceLabel: `Ledger event ${event.id}`,
            name: `Recurring ${event.payee ?? event.eventType}`.slice(0, 120),
            eventType: event.eventType,
            accountId: account.id,
            payeeText: event.payee,
            payeeMatchMode: event.payee ? "exact" : "any",
            categoryId: event.categoryId,
            tagIds: findTagIdsForEvent(context.db, event.id),
            note: event.note,
            amountMode: "exact",
            amount: formatAtomic(magnitude, account.assetScale, {
              trimTrailingZeros: false,
            }),
            toleranceBps: null,
            minAmount: null,
            maxAmount: null,
            frequency: "monthly",
            intervalCount: 1,
            anchorDate: calendar.localDateForInstant(event.occurredAt),
            monthlyDayMode: "fixed",
            dateWindowBeforeDays: 2,
            dateWindowAfterDays: 2,
            startsOn: null,
            endsOn: null,
            isActive: true,
          };
        }
      }
    } else if (params.fromCandidate) {
      try {
        const candidate = new FileImportReadService(context).candidate(
          params.fromCandidate,
        );
        const account = allAccounts.find(
          (entry) => entry.id === candidate.targetAccount.id,
        );
        recurringPrefill = buildCandidateRecurringPrefill({
          candidate,
          account: account ?? null,
          calendar,
        });
      } catch {
        recurringPrefill = null;
      }
    }
    return {
      bookId,
      rules: new AutomationRuleService(context).list(bookId),
      recurring,
      accounts,
      categories,
      tags,
      profiles,
      recurringPrefill,
      currentLocalDate,
    };
  });

  return (
    <div className="page-stack automation-page">
      <header className="page-heading automation-heading">
        <div>
          <p className="eyebrow">Rules & recurring automation</p>
          <h1>Automation</h1>
          <p>
            Rules produce review projections. Recurring items produce date-only
            expectations. Neither becomes a Ledger fact without an explicit
            action.
          </p>
        </div>
      </header>
      <nav className="automation-tabs" aria-label="Automation sections">
        <Link
          aria-current={tab === "rules" ? "page" : undefined}
          href="/automation?tab=rules"
        >
          Rules
        </Link>
        <Link
          aria-current={tab === "recurring" ? "page" : undefined}
          href="/automation?tab=recurring"
        >
          Recurring
        </Link>
      </nav>
      {tab === "rules" ? (
        <RulesManager
          accounts={data.accounts.map(({ id, name }) => ({ id, name }))}
          bookId={data.bookId}
          categories={data.categories.map(({ id, name }) => ({ id, name }))}
          profiles={data.profiles}
          rules={data.rules}
          tags={data.tags.map(({ id, name }) => ({ id, name }))}
        />
      ) : (
        <RecurringManager
          accounts={data.accounts.map(({ id, name, assetCode }) => ({
            id,
            name,
            assetCode,
          }))}
          bookId={data.bookId}
          categories={data.categories.map(({ id, name, categoryType }) => ({
            id,
            name,
            categoryType,
          }))}
          items={data.recurring}
          currentLocalDate={data.currentLocalDate}
          prefill={data.recurringPrefill}
          tags={data.tags.map(({ id, name }) => ({ id, name }))}
        />
      )}
    </div>
  );
}
