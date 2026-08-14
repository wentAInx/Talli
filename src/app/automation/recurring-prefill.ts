import type { RecurringPrefill } from "../../components/automation/recurring-manager";
import { formatAtomic } from "../../domain/money";
import type { FileImportReadService } from "../../services/file-import-read-service";
import type { RecurringCalendarService } from "../../services/recurring-calendar-service";

type FileCandidate = ReturnType<FileImportReadService["candidate"]>;

interface CandidateAccount {
  id: string;
  assetScale: number;
  isArchived: boolean;
}

export function buildCandidateRecurringPrefill({
  candidate,
  account,
  calendar,
}: {
  candidate: FileCandidate;
  account: CandidateAccount | null;
  calendar: Pick<RecurringCalendarService, "localDateForInstant">;
}): RecurringPrefill | null {
  if (
    !account ||
    account.id !== candidate.targetAccount.id ||
    account.isArchived ||
    (candidate.status !== "pending" && candidate.status !== "needs_mapping")
  ) {
    return null;
  }

  const projection = candidate.automation.projection;
  const eventType =
    projection.projectedEventType === "expense" ||
    projection.projectedEventType === "income"
      ? projection.projectedEventType
      : candidate.direction === "out"
        ? "expense"
        : "income";
  const signedAtomic = BigInt(candidate.amountAtomic);
  const magnitude = signedAtomic < 0n ? -signedAtomic : signedAtomic;
  const payee = projection.projectedPayee ?? candidate.payee;

  return {
    sourceLabel: `file candidate ${candidate.id}`,
    name: `Recurring ${payee ?? candidate.title}`.slice(0, 120),
    eventType,
    accountId: account.id,
    payeeText: payee,
    payeeMatchMode: payee ? "exact" : "any",
    categoryId: projection.projectedCategoryId,
    tagIds: projection.projectedTagIds,
    note: projection.projectedNote,
    amountMode: "exact",
    amount: formatAtomic(magnitude, account.assetScale, {
      trimTrailingZeros: false,
    }),
    toleranceBps: null,
    minAmount: null,
    maxAmount: null,
    frequency: "monthly",
    intervalCount: 1,
    anchorDate: calendar.localDateForInstant(candidate.occurredAt),
    monthlyDayMode: "fixed",
    dateWindowBeforeDays: 2,
    dateWindowAfterDays: 2,
    startsOn: null,
    endsOn: null,
    isActive: true,
  };
}
