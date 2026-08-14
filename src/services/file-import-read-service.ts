import { atomicFromDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import {
  findAccountWithAsset,
  findExternalCandidate,
  findExternalCandidateMatchLink,
  findExternalConnection,
  findExternalImportLink,
  findExternalSourceObjectById,
  findFileImportBalanceObservationDetail,
  findFileImportCandidateDetail,
  findFileImportProfile,
  findFileImportSourceDetail,
  findLedgerEventById,
  findSnapshotAtTime,
  listAccountsForBook,
  listExactLedgerAccountEntriesInRange,
  listExternalBalanceObservations,
  listExternalCandidateLegs,
  listExternalCandidateSourceLinks,
  listFileImportBatches,
  listFileImportBatchesForSource,
  listFileImportProfiles,
  listFileTransactionCandidates,
  queryBalanceAt,
} from "../db/queries";
import { formatAtomic } from "../domain/money";
import { scoreFileImportLedgerMatch } from "../domain/file-import";
import { utcInstantToLocalDateTime } from "../domain/time";
import { assertService } from "./errors";

function profileTimezone(format: string, configJson: string): string {
  const config = JSON.parse(configJson) as {
    timezone?: string;
    timezoneForDateOnly?: string;
  };
  return format === "csv"
    ? (config.timezone ?? "UTC")
    : (config.timezoneForDateOnly ?? "UTC");
}

function localDate(instant: string, timezone: string): string {
  return utcInstantToLocalDateTime(instant, timezone).slice(0, 10);
}

function matchingRange(instant: string) {
  const parsed = Date.parse(instant);
  const padding = 4 * 86_400_000;
  return {
    startInclusive: new Date(parsed - padding).toISOString(),
    endInclusive: new Date(parsed + padding).toISOString(),
  };
}

function amountDisplay(amountAtomic: string, scale: number, code: string) {
  return `${formatAtomic(BigInt(amountAtomic), scale, {
    trimTrailingZeros: false,
  })} ${code}`;
}

export class FileImportReadService {
  constructor(private readonly context: DatabaseContext) {}

  overview() {
    return {
      profiles: listFileImportProfiles(this.context.db).map((profile) => {
        const connection = findExternalConnection(
          this.context.db,
          profile.connectionId,
        )!;
        const account = findAccountWithAsset(
          this.context.db,
          profile.targetAccountId,
        )!;
        const candidates = listFileTransactionCandidates(
          this.context.db,
          profile.connectionId,
        ).map((candidate) => {
          const detail = findFileImportCandidateDetail(
            this.context.db,
            candidate.id,
          )!;
          const leg = listExternalCandidateLegs(
            this.context.db,
            candidate.id,
          )[0]!;
          const sourceLink = listExternalCandidateSourceLinks(
            this.context.db,
            candidate.id,
          ).find((link) => link.relation === "primary")!;
          const source = findExternalSourceObjectById(
            this.context.db,
            sourceLink.sourceObjectId,
          )!;
          const sourceDetail = findFileImportSourceDetail(
            this.context.db,
            source.id,
          )!;
          const latestBatch = listFileImportBatchesForSource(
            this.context.db,
            source.id,
          )[0]?.batch;
          return {
            id: candidate.id,
            status: candidate.status,
            occurredAt: candidate.occurredAt,
            title: candidate.title,
            amountText: leg.amountText,
            amountDisplay: amountDisplay(
              leg.amountAtomic!,
              account.asset.scale,
              account.asset.code,
            ),
            direction: detail.direction,
            payee: detail.normalizedPayee,
            memo: detail.memo,
            sourceDateText: detail.sourceDateText,
            datePrecision: detail.datePrecision,
            identityStrength: sourceDetail.identityStrength,
            sourceIdKind: sourceDetail.sourceIdKind,
            sourceExternalId: source.externalId,
            sourceFilename: latestBatch?.originalFilename ?? null,
            sourceFormat: latestBatch?.format ?? profile.format,
            ledgerEventId:
              findExternalImportLink(this.context.db, candidate.id)
                ?.ledgerEventId ??
              findExternalCandidateMatchLink(this.context.db, candidate.id)
                ?.ledgerEventId ??
              null,
          };
        });
        const observations = listExternalBalanceObservations(
          this.context.db,
          profile.connectionId,
          20,
        ).flatMap((observation) => {
          const detail = findFileImportBalanceObservationDetail(
            this.context.db,
            observation.id,
          );
          if (
            !detail ||
            observation.mappedAmountAtomic === null ||
            observation.precisionStatus !== "exact"
          ) {
            return [];
          }
          const externalAtomic = atomicFromDb(observation.mappedAmountAtomic);
          const ledgerAtomic = queryBalanceAt(
            this.context.db,
            account.account.id,
            observation.observedAt,
          );
          const differenceAtomic = externalAtomic - ledgerAtomic;
          return [
            {
              id: observation.id,
              observedAt: observation.observedAt,
              balanceKind: detail.balanceKind,
              datePrecision: detail.datePrecision,
              sourceDateText: detail.sourceDateText,
              externalDisplay: amountDisplay(
                observation.mappedAmountAtomic,
                account.asset.scale,
                account.asset.code,
              ),
              ledgerDisplay: amountDisplay(
                ledgerAtomic.toString(),
                account.asset.scale,
                account.asset.code,
              ),
              differenceDisplay: amountDisplay(
                differenceAtomic.toString(),
                account.asset.scale,
                account.asset.code,
              ),
              differenceDirection:
                differenceAtomic > 0n
                  ? ("positive" as const)
                  : differenceAtomic < 0n
                    ? ("negative" as const)
                    : ("zero" as const),
              reconciled: Boolean(
                findSnapshotAtTime(
                  this.context.db,
                  account.account.id,
                  observation.observedAt,
                ),
              ),
            },
          ];
        });
        return {
          connectionId: profile.connectionId,
          name: connection.name,
          format: profile.format,
          targetAccountId: account.account.id,
          targetAccountName: account.account.name,
          assetCode: account.asset.code,
          statementAccountLast4: profile.statementAccountLast4,
          statementCurrencyCode: profile.statementCurrencyCode,
          recentBatches: listFileImportBatches(
            this.context.db,
            profile.connectionId,
            5,
          ),
          candidates,
          observations,
        };
      }),
    };
  }

  candidate(candidateId: string) {
    const candidate = findExternalCandidate(this.context.db, candidateId);
    assertService(
      candidate,
      "EXTERNAL_CANDIDATE_NOT_FOUND",
      "File-import candidate was not found.",
    );
    const connection = findExternalConnection(
      this.context.db,
      candidate.connectionId,
    );
    const profile = findFileImportProfile(
      this.context.db,
      candidate.connectionId,
    );
    const detail = findFileImportCandidateDetail(this.context.db, candidate.id);
    const legs = listExternalCandidateLegs(this.context.db, candidate.id);
    const leg = legs[0];
    assertService(
      connection?.provider === "file_import" &&
        profile &&
        detail &&
        legs.length === 1 &&
        leg?.amountAtomic !== null,
      "FILE_IMPORT_CANDIDATE_INTEGRITY_ERROR",
      "File-import candidate provenance is incomplete.",
    );
    const target = findAccountWithAsset(
      this.context.db,
      detail.targetAccountId,
    );
    assertService(
      target,
      "FILE_IMPORT_TARGET_ACCOUNT_INVALID",
      "File-import target account was not found.",
    );
    const primary = listExternalCandidateSourceLinks(
      this.context.db,
      candidate.id,
    ).find((link) => link.relation === "primary");
    const source = primary
      ? findExternalSourceObjectById(this.context.db, primary.sourceObjectId)
      : null;
    const sourceDetail = source
      ? findFileImportSourceDetail(this.context.db, source.id)
      : null;
    assertService(
      source && sourceDetail,
      "FILE_IMPORT_CANDIDATE_INTEGRITY_ERROR",
      "File-import source provenance is incomplete.",
    );
    const sourceBatch = listFileImportBatchesForSource(
      this.context.db,
      source.id,
    )[0]?.batch;
    const timezone = profileTimezone(profile.format, profile.parserConfigJson);
    const suggestions = listExactLedgerAccountEntriesInRange(this.context.db, {
      accountId: detail.targetAccountId,
      amountAtomic: leg.amountAtomic,
      ...matchingRange(candidate.occurredAt),
    })
      .filter((entry) => entry.bookId === connection.bookId)
      .map((entry) => ({
        ledgerEventId: entry.ledgerEventId,
        eventType: entry.eventType,
        occurredAt: entry.occurredAt,
        payee: entry.payee,
        note: entry.note,
        amountDisplay: amountDisplay(
          entry.amountAtomic,
          target.asset.scale,
          target.asset.code,
        ),
        ...scoreFileImportLedgerMatch({
          sourceLocalDate: detail.sourceDateText,
          sourcePayee: detail.normalizedPayee,
          sourceMemo: detail.memo,
          ledgerLocalDate: localDate(entry.occurredAt, timezone),
          ledgerPayee: entry.payee,
          ledgerNote: entry.note,
        }),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.ledgerEventId.localeCompare(right.ledgerEventId),
      )
      .slice(0, 5);
    const importLink = findExternalImportLink(this.context.db, candidate.id);
    const matchLink = findExternalCandidateMatchLink(
      this.context.db,
      candidate.id,
    );
    const linkedEvent = findLedgerEventById(
      this.context.db,
      importLink?.ledgerEventId ?? matchLink?.ledgerEventId ?? "",
    );
    return {
      id: candidate.id,
      status: candidate.status,
      title: candidate.title,
      occurredAt: candidate.occurredAt,
      sourceFingerprint: candidate.sourceFingerprint,
      direction: detail.direction,
      payee: detail.normalizedPayee,
      memo: detail.memo,
      sourceDateText: detail.sourceDateText,
      datePrecision: detail.datePrecision,
      amountText: leg.amountText,
      amountAtomic: leg.amountAtomic,
      amountDisplay: amountDisplay(
        leg.amountAtomic,
        target.asset.scale,
        target.asset.code,
      ),
      identityStrength: sourceDetail.identityStrength,
      sourceIdKind: sourceDetail.sourceIdKind,
      sourceExternalId: source.externalId,
      sourceFilename: sourceBatch?.originalFilename ?? null,
      sourceFormat: sourceBatch?.format ?? profile.format,
      targetAccount: {
        id: target.account.id,
        name: target.account.name,
        assetId: target.asset.id,
        assetCode: target.asset.code,
      },
      accounts: listAccountsForBook(this.context.db, connection.bookId)
        .filter((account) => !account.isArchived)
        .map((account) => {
          const withAsset = findAccountWithAsset(this.context.db, account.id)!;
          return {
            id: account.id,
            name: account.name,
            assetId: account.assetId,
            assetCode: withAsset.asset.code,
          };
        }),
      suggestions,
      importLink: importLink ?? null,
      matchLink: matchLink ?? null,
      linkedEvent: linkedEvent ?? null,
    };
  }
}
