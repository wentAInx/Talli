import type { DatabaseContext } from "../db/connection";
import {
  findRecurringOccurrenceLink,
  findRecurringOccurrenceLinkByLedgerEvent,
  findRecurringOccurrenceSkip,
  listRecurringFileCandidates,
  listRecurringItemRowsForAccount,
  listRecurringLedgerCandidates,
} from "../db/queries";
import {
  addLocalDays,
  generateOccurrenceDates,
  isGeneratedOccurrence,
  scoreRecurringMatch,
  type RecurringMatchSuggestion,
} from "../domain/recurring";
import { localDateRangeToUtc, utcInstantToLocalDateTime } from "../domain/time";
import {
  buildFileCandidateAutomationContext,
  projectFileCandidate,
} from "./automation-projection-service";
import { assertStoredFileImportCandidateProvenance } from "./file-import-provenance-integrity";
import { requireRecurringItem } from "./recurring-item-service";
import { defaultServiceRuntime, type ServiceRuntime } from "./runtime";
import { SettingsService } from "./settings-service";

function magnitude(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function utcRangeForWindow(
  occurrenceDate: string,
  beforeDays: number,
  afterDays: number,
  timeZone: string,
) {
  const range = localDateRangeToUtc(
    {
      from: addLocalDays(occurrenceDate, -beforeDays),
      to: addLocalDays(occurrenceDate, afterDays),
    },
    timeZone,
  );
  return {
    startInclusive: range.startInclusive!,
    endExclusive: range.endExclusive!,
  };
}

export class RecurringMatchService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  suggestionsForOccurrence(input: {
    recurringItemId: string;
    occurrenceDate: string;
  }): RecurringMatchSuggestion[] {
    const item = requireRecurringItem(this.context.db, input.recurringItemId);
    if (
      !item.isActive ||
      !isGeneratedOccurrence(item, input.occurrenceDate) ||
      findRecurringOccurrenceLink(
        this.context.db,
        item.id,
        input.occurrenceDate,
      ) ||
      findRecurringOccurrenceSkip(
        this.context.db,
        item.id,
        input.occurrenceDate,
      )
    ) {
      return [];
    }
    const timeZone = new SettingsService(
      this.context,
      this.runtime,
    ).getTimeZoneOrDefault();
    const range = utcRangeForWindow(
      input.occurrenceDate,
      item.dateWindowBeforeDays,
      item.dateWindowAfterDays,
      timeZone,
    );
    const suggestions: RecurringMatchSuggestion[] = [];
    for (const event of listRecurringLedgerCandidates(this.context.db, {
      accountId: item.accountId,
      eventType: item.eventType,
      ...range,
    })) {
      if (
        event.bookId !== item.bookId ||
        findRecurringOccurrenceLinkByLedgerEvent(
          this.context.db,
          event.ledgerEventId,
        )
      ) {
        continue;
      }
      const signedAtomic = BigInt(event.amountAtomic);
      if (
        (item.eventType === "expense" && signedAtomic >= 0n) ||
        (item.eventType === "income" && signedAtomic <= 0n)
      ) {
        continue;
      }
      const scored = scoreRecurringMatch({
        item,
        occurrenceDate: input.occurrenceDate,
        actualDate: utcInstantToLocalDateTime(event.occurredAt, timeZone).slice(
          0,
          10,
        ),
        actualPayee: event.payee,
        actualMagnitudeAtomic: magnitude(signedAtomic),
      });
      if (scored) {
        suggestions.push({
          recurringItemId: item.id,
          occurrenceDate: input.occurrenceDate,
          ledgerEventId: event.ledgerEventId,
          ...scored,
        });
      }
    }
    for (const candidate of listRecurringFileCandidates(this.context.db, {
      accountId: item.accountId,
      ...range,
    })) {
      if (
        candidate.bookId !== item.bookId ||
        candidate.amountAtomic === null ||
        (item.eventType === "expense"
          ? candidate.direction !== "out"
          : candidate.direction !== "in")
      ) {
        continue;
      }
      const provenance = assertStoredFileImportCandidateProvenance(
        this.context.db,
        candidate.candidateId,
      );
      const projection = projectFileCandidate(
        this.context.db,
        candidate.candidateId,
      );
      const scored = scoreRecurringMatch({
        item,
        occurrenceDate: input.occurrenceDate,
        actualDate: provenance.candidateDetail.sourceDateText,
        actualPayee:
          projection.projectedPayee ??
          provenance.candidateDetail.normalizedPayee,
        actualMagnitudeAtomic: magnitude(provenance.signedAtomic),
      });
      if (scored) {
        suggestions.push({
          recurringItemId: item.id,
          occurrenceDate: input.occurrenceDate,
          candidateId: candidate.candidateId,
          ...scored,
        });
      }
    }
    return suggestions.toSorted(
      (left, right) =>
        right.score - left.score ||
        (left.ledgerEventId ?? left.candidateId ?? "").localeCompare(
          right.ledgerEventId ?? right.candidateId ?? "",
        ),
    );
  }

  suggestionsForFileCandidate(candidateId: string): RecurringMatchSuggestion[] {
    const context = buildFileCandidateAutomationContext(
      this.context.db,
      candidateId,
    );
    if (
      context.candidateStatus !== "pending" &&
      context.candidateStatus !== "needs_mapping"
    ) {
      return [];
    }
    const projection = projectFileCandidate(this.context.db, candidateId);
    const actualMagnitudeAtomic = magnitude(context.sourceAmountAtomic);
    const expectedEventType =
      context.direction === "out" ? "expense" : "income";
    const suggestions: RecurringMatchSuggestion[] = [];
    for (const row of listRecurringItemRowsForAccount(
      this.context.db,
      context.targetAccountId,
      true,
    )) {
      const item = requireRecurringItem(this.context.db, row.id);
      if (
        item.bookId !== context.bookId ||
        item.eventType !== expectedEventType ||
        item.assetId !== context.assetId
      ) {
        continue;
      }
      const dates = generateOccurrenceDates(
        item,
        addLocalDays(context.sourceDate, -item.dateWindowAfterDays),
        addLocalDays(context.sourceDate, item.dateWindowBeforeDays),
      );
      for (const occurrenceDate of dates) {
        if (
          findRecurringOccurrenceLink(
            this.context.db,
            item.id,
            occurrenceDate,
          ) ||
          findRecurringOccurrenceSkip(this.context.db, item.id, occurrenceDate)
        ) {
          continue;
        }
        const scored = scoreRecurringMatch({
          item,
          occurrenceDate,
          actualDate: context.sourceDate,
          actualPayee: projection.projectedPayee ?? context.sourcePayee,
          actualMagnitudeAtomic,
        });
        if (scored) {
          suggestions.push({
            recurringItemId: item.id,
            occurrenceDate,
            candidateId,
            ...scored,
          });
        }
      }
    }
    return suggestions
      .toSorted(
        (left, right) =>
          right.score - left.score ||
          left.occurrenceDate.localeCompare(right.occurrenceDate) ||
          left.recurringItemId.localeCompare(right.recurringItemId),
      )
      .slice(0, 5);
  }
}
