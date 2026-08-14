import { createHash } from "node:crypto";

import { atomicToDb } from "../db/atomic";
import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  findAccountWithAsset,
  findExternalAccountMapping,
  findExternalAssetMapping,
  findExternalCandidate,
  findExternalCandidateMatchLink,
  findExternalConnection,
  findExternalImportLink,
  findFileImportBatchByHash,
  findFileImportBalanceObservationDetailByBatch,
  findFileImportCandidateDetail,
  findFileImportProfile,
  findLedgerEventById,
  insertExternalBalanceObservation,
  insertExternalCandidate,
  insertExternalCandidateMatchLink,
  insertExternalConnection,
  insertExternalSourceObject,
  insertFileImportBalanceObservationDetail,
  insertFileImportBatch,
  insertFileImportBatchSource,
  insertFileImportCandidateDetail,
  insertFileImportProfile,
  insertFileImportSourceDetail,
  listExactLedgerAccountEntriesInRange,
  listExternalCandidateLegs,
  listFileImportBatches,
  listFileImportProfiles,
  listFileTransactionCandidates,
  listFileTransactionSources,
  replaceExternalCandidateDetails,
  updateExternalCandidate,
  updateExternalSourceObject,
  updateFileImportCandidateDetail,
  updateFileImportProfileIdentity,
  updateFileImportSourceDetail,
  upsertExternalAccountMapping,
  upsertExternalAssetMapping,
  findExactLedgerAccountEntry,
  deleteExternalCandidateMatchLink,
} from "../db/queries";
import {
  FILE_IMPORT_PARSER_VERSION,
  fileImportDirection,
  normalizeFileImportText,
  scoreFileImportLedgerMatch,
  type CsvImportConfig,
  type FileImportCommitResult,
  type FileImportFormat,
  type FileImportPreview,
  type FileImportProfileDraft,
  type MatchExistingInput,
  type ParsedFileBatch,
  type ParsedFileTransaction,
  type StructuredImportConfig,
} from "../domain/file-import";
import {
  canonicalExternalJson,
  type CanonicalJsonValue,
} from "../domain/external-sync";
import { assertIanaTimeZone, utcInstantToLocalDateTime } from "../domain/time";
import {
  FileImportError,
  parseFinancialFile,
  sniffFinancialFileFormat,
} from "../providers/file-import";
import { assertService } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

type ParserConfig = CsvImportConfig | StructuredImportConfig;

export interface CreateFileImportProfileInput extends FileImportProfileDraft {
  confirmed: true;
}

export interface FileImportFileInput {
  connectionId: string;
  bytes: Uint8Array;
  filename: string;
}

export interface CommitFileImportInput extends FileImportFileInput {
  confirmed: true;
  confirmedStatementIdentity?: true;
}

export interface UnlinkFileImportMatchInput {
  candidateId: string;
  confirmed: true;
}

interface ParsedProfileContext {
  connectionId: string;
  providerAssetKey: string;
  targetAccountId: string;
  bookId: string;
  assetId: string;
  assetCode: string;
  format: FileImportFormat;
  parserConfig: ParserConfig;
  timezone: string;
  storedFingerprint: string | null;
  storedCurrency: string | null;
  parsed: ParsedFileBatch;
  warnings: string[];
}

function providerAssetKey(connectionId: string): string {
  return `file:${connectionId}:target`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalParserConfig(parserConfig: ParserConfig): string {
  return canonicalExternalJson(parserConfig as unknown as CanonicalJsonValue);
}

function candidateSourceFingerprint(
  sourceExternalId: string,
  payloadHash: string,
): string {
  return sha256(`file_transaction:${sourceExternalId}:${payloadHash}`);
}

function profileTimezone(
  format: FileImportFormat,
  parserConfig: ParserConfig,
): string {
  const timezone =
    format === "csv"
      ? (parserConfig as CsvImportConfig).timezone
      : (parserConfig as StructuredImportConfig).timezoneForDateOnly;
  return assertIanaTimeZone(timezone);
}

function assertParserConfig(
  format: FileImportFormat,
  parserConfig: ParserConfig,
): void {
  assertService(
    parserConfig !== null && typeof parserConfig === "object",
    "FILE_IMPORT_PROFILE_CONFIG_INVALID",
    "A parser configuration is required.",
  );
  if (format === "csv") {
    assertService(
      "hasHeader" in parserConfig && "timezone" in parserConfig,
      "FILE_IMPORT_PROFILE_CONFIG_INVALID",
      "CSV profiles require an explicit CSV mapping.",
    );
  } else {
    assertService(
      "timezoneForDateOnly" in parserConfig && !("hasHeader" in parserConfig),
      "FILE_IMPORT_PROFILE_CONFIG_INVALID",
      "Structured profiles require a date-only timezone.",
    );
  }
  profileTimezone(format, parserConfig);
}

function parseStoredConfig(
  format: FileImportFormat,
  parserConfigJson: string,
): ParserConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(parserConfigJson);
  } catch {
    assertService(
      false,
      "FILE_IMPORT_PROFILE_INTEGRITY_ERROR",
      "Stored parser configuration is invalid.",
    );
  }
  assertParserConfig(format, parsed as ParserConfig);
  return parsed as ParserConfig;
}

function sourcePayload(
  format: FileImportFormat,
  transaction: ParsedFileTransaction,
): string {
  return canonicalExternalJson({
    format,
    sourceExternalId: transaction.sourceExternalId,
    originalDateText: transaction.originalDateText,
    datePrecision: transaction.datePrecision,
    signedAmountText: transaction.rawSignedAmountText,
    currencyCode: transaction.currencyCode,
    payee: transaction.payee,
    memo: transaction.memo,
    selectedFields: { ...transaction.rawSelectedFields },
    unsupportedReason: transaction.unsupportedReason,
  });
}

function localSourceDate(occurredAt: string, timezone: string): string {
  return utcInstantToLocalDateTime(occurredAt, timezone).slice(0, 10);
}

function matchingUtcRange(occurredAt: string): {
  startInclusive: string;
  endInclusive: string;
} {
  const instant = Date.parse(occurredAt);
  const padding = 4 * 86_400_000;
  return {
    startInclusive: new Date(instant - padding).toISOString(),
    endInclusive: new Date(instant + padding).toISOString(),
  };
}

function assertParsedIdentity(
  context: Pick<
    ParsedProfileContext,
    "format" | "storedFingerprint" | "storedCurrency" | "assetCode"
  >,
  parsed: ParsedFileBatch,
): void {
  const fingerprint = parsed.statementIdentity.accountFingerprint;
  if (context.format !== "csv") {
    assertService(
      fingerprint !== null,
      "FILE_IMPORT_ACCOUNT_IDENTITY_REQUIRED",
      "Structured statements require an account identity.",
    );
  }
  assertService(
    context.storedFingerprint === null ||
      context.storedFingerprint === fingerprint,
    "FILE_IMPORT_ACCOUNT_MISMATCH",
    "Statement account does not match this import profile.",
  );
  const currency = parsed.statementIdentity.currencyCode;
  assertService(
    currency === context.assetCode,
    "FILE_IMPORT_CURRENCY_MISMATCH",
    "Statement currency does not match the target account asset.",
  );
  assertService(
    context.storedCurrency === null || context.storedCurrency === currency,
    "FILE_IMPORT_CURRENCY_MISMATCH",
    "Statement currency changed after this profile was confirmed.",
  );
}

function assertProfileRelations(
  executor: DatabaseExecutor,
  connectionId: string,
) {
  const connection = findExternalConnection(executor, connectionId);
  const profile = findFileImportProfile(executor, connectionId);
  assertService(
    connection && profile,
    "FILE_IMPORT_PROFILE_NOT_FOUND",
    "File-import profile was not found.",
  );
  assertService(
    connection.provider === "file_import" &&
      connection.credentialRef === "local:file-import" &&
      connection.sourceKey === `file:${connection.id}`,
    "FILE_IMPORT_PROFILE_INTEGRITY_ERROR",
    "File-import connection metadata is inconsistent.",
  );
  const account = findAccountWithAsset(executor, profile.targetAccountId);
  assertService(
    account &&
      !account.account.isArchived &&
      !account.asset.isArchived &&
      account.account.bookId === connection.bookId,
    "FILE_IMPORT_TARGET_ACCOUNT_INVALID",
    "Target account must be active and in the profile book.",
  );
  const key = providerAssetKey(connectionId);
  const assetMapping = findExternalAssetMapping(executor, connectionId, key);
  const accountMapping = findExternalAccountMapping(
    executor,
    connectionId,
    key,
  );
  assertService(
    assetMapping?.mappingStatus === "mapped" &&
      assetMapping.talliAssetId === account.account.assetId &&
      accountMapping?.isEnabled === true &&
      accountMapping.talliAccountId === account.account.id,
    "FILE_IMPORT_PROFILE_MAPPING_CHANGED",
    "Explicit target account mapping is missing or changed.",
  );
  const parserConfig = parseStoredConfig(
    profile.format,
    profile.parserConfigJson,
  );
  return { connection, profile, account, key, parserConfig };
}

export class FileImportService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async createProfile(input: CreateFileImportProfileInput): Promise<string> {
    assertService(
      input.confirmed === true,
      "FILE_IMPORT_PROFILE_CONFIRMATION_REQUIRED",
      "Creating an import profile requires explicit confirmation.",
    );
    assertParserConfig(input.format, input.parserConfig);
    const name = normalizeFileImportText(input.name);
    assertService(
      name,
      "FILE_IMPORT_PROFILE_NAME_REQUIRED",
      "Import profile name is required.",
    );
    return this.context.db.transaction(
      (transaction) => {
        const account = findAccountWithAsset(
          transaction,
          input.targetAccountId,
        );
        assertService(
          account &&
            !account.account.isArchived &&
            !account.asset.isArchived &&
            account.account.bookId === input.bookId,
          "FILE_IMPORT_TARGET_ACCOUNT_INVALID",
          "Target account must be active and in the selected book.",
        );
        const connectionId = this.runtime.id();
        const now = runtimeNow(this.runtime);
        const key = providerAssetKey(connectionId);
        insertExternalConnection(transaction, {
          id: connectionId,
          bookId: input.bookId,
          provider: "file_import",
          sourceKey: `file:${connectionId}`,
          name,
          credentialRef: "local:file-import",
          isEnabled: true,
          createdAt: now,
          updatedAt: now,
        });
        insertFileImportProfile(transaction, {
          connectionId,
          targetAccountId: input.targetAccountId,
          format: input.format,
          parserConfigJson: canonicalParserConfig(input.parserConfig),
          statementAccountFingerprint: null,
          statementAccountLast4: null,
          statementCurrencyCode: null,
          createdAt: now,
          updatedAt: now,
        });
        upsertExternalAssetMapping(transaction, {
          connectionId,
          providerAssetKey: key,
          providerDisplayCode: account.asset.code,
          talliAssetId: account.asset.id,
          mappingStatus: "mapped",
          providerMetadataJson: canonicalExternalJson({
            source: "explicit_file_profile_target_account",
          }),
          createdAt: now,
          updatedAt: now,
        });
        upsertExternalAccountMapping(transaction, {
          connectionId,
          providerAssetKey: key,
          talliAccountId: account.account.id,
          isEnabled: true,
          createdAt: now,
          updatedAt: now,
        });
        return connectionId;
      },
      { behavior: "immediate" },
    );
  }

  profiles() {
    return listFileImportProfiles(this.context.db).map((profile) => ({
      ...profile,
      connection: findExternalConnection(
        this.context.db,
        profile.connectionId,
      )!,
      account: findAccountWithAsset(this.context.db, profile.targetAccountId)!,
      recentBatches: listFileImportBatches(
        this.context.db,
        profile.connectionId,
        5,
      ),
    }));
  }

  private parse(input: FileImportFileInput): ParsedProfileContext {
    const relations = assertProfileRelations(
      this.context.db,
      input.connectionId,
    );
    const sniffed = sniffFinancialFileFormat(input.bytes);
    const compatible =
      relations.profile.format === "csv"
        ? sniffed === "csv"
        : relations.profile.format === "camt053"
          ? sniffed === "camt053"
          : sniffed === "ofx";
    assertService(
      compatible,
      "FILE_IMPORT_FORMAT_MISMATCH",
      "Uploaded file content does not match the selected profile format.",
    );
    const result = parseFinancialFile({
      bytes: input.bytes,
      filename: input.filename,
      format: relations.profile.format,
      parserConfig: relations.parserConfig,
      targetScale: relations.account.asset.scale,
      expectedCurrency: relations.account.asset.code,
      identityNamespace: input.connectionId,
    });
    const context: ParsedProfileContext = {
      connectionId: input.connectionId,
      providerAssetKey: relations.key,
      targetAccountId: relations.account.account.id,
      bookId: relations.connection.bookId,
      assetId: relations.account.asset.id,
      assetCode: relations.account.asset.code,
      format: relations.profile.format,
      parserConfig: relations.parserConfig,
      timezone: profileTimezone(
        relations.profile.format,
        relations.parserConfig,
      ),
      storedFingerprint: relations.profile.statementAccountFingerprint,
      storedCurrency: relations.profile.statementCurrencyCode,
      parsed: result.parsed,
      warnings: result.warnings,
    };
    assertParsedIdentity(context, result.parsed);
    return context;
  }

  async preview(input: FileImportFileInput): Promise<FileImportPreview> {
    let parsedContext: ParsedProfileContext;
    try {
      parsedContext = this.parse(input);
    } catch (error) {
      if (error instanceof FileImportError) {
        return {
          fatalErrors: [`${error.code}: ${error.message}`],
          warnings: [],
          parsed: null,
          alreadyKnownSourceIds: [],
          matchSuggestions: {},
        };
      }
      throw error;
    }
    const existingSources = new Map(
      listFileTransactionSources(this.context.db, input.connectionId).map(
        (source) => [source.externalId, source],
      ),
    );
    const existingCandidates = new Map(
      listFileTransactionCandidates(this.context.db, input.connectionId).map(
        (candidate) => [candidate.stableKey, candidate],
      ),
    );
    const alreadyKnownSourceIds: string[] = [];
    const matchSuggestions: Record<
      string,
      FileImportPreview["matchSuggestions"][string]
    > = {};
    for (const row of parsedContext.parsed.transactions) {
      const existing = existingSources.get(row.sourceExternalId);
      if (existing) alreadyKnownSourceIds.push(row.sourceExternalId);
      const resolved = existingCandidates.get(`file:${row.sourceExternalId}`);
      if (
        row.unsupportedReason !== null ||
        resolved?.status === "imported" ||
        resolved?.status === "matched"
      ) {
        continue;
      }
      const range = matchingUtcRange(row.occurredAt);
      const sourceDate = localSourceDate(
        row.occurredAt,
        parsedContext.timezone,
      );
      const byEvent = new Map<
        string,
        (typeof matchSuggestions)[string][number]
      >();
      for (const ledger of listExactLedgerAccountEntriesInRange(
        this.context.db,
        {
          accountId: parsedContext.targetAccountId,
          amountAtomic: atomicToDb(row.signedAtomic),
          ...range,
        },
      )) {
        if (ledger.bookId !== parsedContext.bookId) continue;
        const scored = scoreFileImportLedgerMatch({
          sourceLocalDate: sourceDate,
          sourcePayee: row.payee,
          sourceMemo: row.memo,
          ledgerLocalDate: localSourceDate(
            ledger.occurredAt,
            parsedContext.timezone,
          ),
          ledgerPayee: ledger.payee,
          ledgerNote: ledger.note,
        });
        if (scored.score === 0) continue;
        const prior = byEvent.get(ledger.ledgerEventId);
        if (!prior || scored.score > prior.score) {
          byEvent.set(ledger.ledgerEventId, {
            ledgerEventId: ledger.ledgerEventId,
            ...scored,
          });
        }
      }
      const suggestions = [...byEvent.values()]
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.ledgerEventId.localeCompare(right.ledgerEventId),
        )
        .slice(0, 5);
      if (suggestions.length > 0) {
        matchSuggestions[row.sourceExternalId] = suggestions;
      }
    }
    return {
      fatalErrors: [],
      warnings: parsedContext.warnings,
      parsed: parsedContext.parsed,
      alreadyKnownSourceIds: [...new Set(alreadyKnownSourceIds)].sort(),
      matchSuggestions,
    };
  }

  async commit(input: CommitFileImportInput): Promise<FileImportCommitResult> {
    assertService(
      input.confirmed === true,
      "FILE_IMPORT_COMMIT_CONFIRMATION_REQUIRED",
      "Creating review candidates requires explicit confirmation.",
    );

    // Full hash/decode/parse/validation intentionally completes before the
    // database write transaction begins.
    const parsedContext = this.parse(input);
    if (
      parsedContext.format !== "csv" &&
      parsedContext.storedFingerprint === null
    ) {
      assertService(
        input.confirmedStatementIdentity === true,
        "FILE_IMPORT_STATEMENT_IDENTITY_CONFIRMATION_REQUIRED",
        "Confirm the masked statement account and currency before commit.",
      );
    }

    return this.context.db.transaction(
      (transaction) => {
        const relations = assertProfileRelations(
          transaction,
          parsedContext.connectionId,
        );
        assertService(
          relations.profile.targetAccountId === parsedContext.targetAccountId &&
            relations.profile.format === parsedContext.format &&
            relations.profile.parserConfigJson ===
              canonicalParserConfig(parsedContext.parserConfig),
          "FILE_IMPORT_PROFILE_CHANGED",
          "Import profile changed after parsing; preview the file again.",
        );
        assertParsedIdentity(
          {
            format: relations.profile.format,
            storedFingerprint: relations.profile.statementAccountFingerprint,
            storedCurrency: relations.profile.statementCurrencyCode,
            assetCode: relations.account.asset.code,
          },
          parsedContext.parsed,
        );
        const priorBatch = findFileImportBatchByHash(
          transaction,
          parsedContext.connectionId,
          parsedContext.parsed.fileSha256,
        );
        if (priorBatch) {
          const detail = findFileImportBalanceObservationDetailByBatch(
            transaction,
            priorBatch.id,
          );
          return {
            batchId: priorBatch.id,
            sourceRows: priorBatch.sourceRowCount,
            candidatesCreated: 0,
            duplicates: priorBatch.sourceRowCount,
            unsupported: priorBatch.unsupportedCount,
            balanceObservationId: detail?.observationId ?? null,
          };
        }

        const now = runtimeNow(this.runtime);
        const batchId = this.runtime.id();
        const sources = new Map(
          listFileTransactionSources(
            transaction,
            parsedContext.connectionId,
          ).map((source) => [source.externalId, source]),
        );
        const candidates = new Map(
          listFileTransactionCandidates(
            transaction,
            parsedContext.connectionId,
          ).map((candidate) => [candidate.stableKey, candidate]),
        );
        let candidatesCreated = 0;
        let duplicates = 0;
        let unsupported = 0;
        const projectedCandidateKeys = new Set(candidates.keys());
        const countedSourceIds = new Set<string>();
        const seenInBatch = new Set<string>();
        for (const row of parsedContext.parsed.transactions) {
          const payloadJson = sourcePayload(parsedContext.format, row);
          const payloadHash = sha256(payloadJson);
          const existingSource = sources.get(row.sourceExternalId);
          if (countedSourceIds.has(row.sourceExternalId)) {
            duplicates += 1;
          } else if (existingSource?.payloadHash === payloadHash) {
            duplicates += 1;
          }
          countedSourceIds.add(row.sourceExternalId);
          if (row.unsupportedReason !== null) unsupported += 1;
          const stableKey = `file:${row.sourceExternalId}`;
          if (!projectedCandidateKeys.has(stableKey)) {
            candidatesCreated += 1;
            projectedCandidateKeys.add(stableKey);
          }
        }
        insertFileImportBatch(transaction, {
          id: batchId,
          connectionId: parsedContext.connectionId,
          fileSha256: parsedContext.parsed.fileSha256,
          originalFilename: parsedContext.parsed.sanitizedFilename,
          format: parsedContext.format,
          parserVersion: FILE_IMPORT_PARSER_VERSION,
          ingestedAt: now,
          sourceRowCount: parsedContext.parsed.transactions.length,
          newCandidateCount: candidatesCreated,
          duplicateCount: duplicates,
          unsupportedCount: unsupported,
          statementFromDate: parsedContext.parsed.statementFromDate,
          statementToDate: parsedContext.parsed.statementToDate,
        });

        for (const [
          rowIndex,
          row,
        ] of parsedContext.parsed.transactions.entries()) {
          const payloadJson = sourcePayload(parsedContext.format, row);
          const payloadHash = sha256(payloadJson);
          const existingSource = sources.get(row.sourceExternalId);
          const sourceObjectId = existingSource?.id ?? this.runtime.id();
          if (existingSource) {
            updateExternalSourceObject(transaction, sourceObjectId, {
              occurredAt: row.occurredAt,
              payloadJson,
              payloadHash,
              lastSeenAt: now,
            });
            updateFileImportSourceDetail(transaction, sourceObjectId, {
              identityStrength: row.identityStrength,
              sourceIdKind: row.sourceIdKind,
              originalDateText: row.originalDateText,
              datePrecision: row.datePrecision,
              normalizedPayee: row.payee,
              memo: row.memo,
              statementCurrencyCode: row.currencyCode,
            });
          } else {
            insertExternalSourceObject(transaction, {
              id: sourceObjectId,
              connectionId: parsedContext.connectionId,
              objectType: "file_transaction",
              externalId: row.sourceExternalId,
              occurredAt: row.occurredAt,
              payloadJson,
              payloadHash,
              firstSeenAt: now,
              lastSeenAt: now,
            });
            insertFileImportSourceDetail(transaction, {
              sourceObjectId,
              identityStrength: row.identityStrength,
              sourceIdKind: row.sourceIdKind,
              originalDateText: row.originalDateText,
              datePrecision: row.datePrecision,
              normalizedPayee: row.payee,
              memo: row.memo,
              statementCurrencyCode: row.currencyCode,
            });
            sources.set(row.sourceExternalId, {
              id: sourceObjectId,
              connectionId: parsedContext.connectionId,
              objectType: "file_transaction",
              externalId: row.sourceExternalId,
              occurredAt: row.occurredAt,
              payloadJson,
              payloadHash,
              firstSeenAt: now,
              lastSeenAt: now,
            });
          }
          if (!seenInBatch.has(row.sourceExternalId)) {
            insertFileImportBatchSource(transaction, {
              batchId,
              sourceObjectId,
              rowIndex,
              rawRowSha256: row.rawRowSha256,
            });
            seenInBatch.add(row.sourceExternalId);
          }

          const stableKey = `file:${row.sourceExternalId}`;
          const existingCandidate = candidates.get(stableKey);
          const sourceFingerprint = candidateSourceFingerprint(
            row.sourceExternalId,
            payloadHash,
          );
          const changed =
            existingCandidate !== undefined &&
            existingCandidate.sourceFingerprint !== sourceFingerprint;
          const resolved =
            existingCandidate?.status === "imported" ||
            existingCandidate?.status === "matched" ||
            existingCandidate?.status === "source_changed";
          const status = resolved
            ? changed
              ? "source_changed"
              : existingCandidate.status
            : existingCandidate?.status === "ignored" && !changed
              ? "ignored"
              : row.unsupportedReason === null
                ? "pending"
                : "unsupported";
          const detail = {
            targetAccountId: parsedContext.targetAccountId,
            direction: fileImportDirection(row.signedAtomic),
            normalizedPayee: row.payee,
            memo: row.memo,
            sourceDateText: localSourceDate(
              row.occurredAt,
              parsedContext.timezone,
            ),
            datePrecision: row.datePrecision,
          } as const;
          const legs = [
            {
              id: existingCandidate
                ? (listExternalCandidateLegs(
                    transaction,
                    existingCandidate.id,
                  )[0]?.id ?? this.runtime.id())
                : this.runtime.id(),
              legIndex: 0,
              role:
                row.signedAtomic < 0n
                  ? ("external_out" as const)
                  : ("external_in" as const),
              providerAssetKey: parsedContext.providerAssetKey,
              talliAssetId: parsedContext.assetId,
              amountText: row.rawSignedAmountText,
              amountAtomic: atomicToDb(row.signedAtomic),
              precisionStatus: "exact" as const,
              note: row.unsupportedReason,
            },
          ];
          if (!existingCandidate) {
            const candidateId = this.runtime.id();
            insertExternalCandidate(transaction, {
              id: candidateId,
              connectionId: parsedContext.connectionId,
              stableKey,
              suggestedEventType: "unknown",
              status,
              occurredAt: row.occurredAt,
              title: row.payee ?? row.memo ?? "Statement transaction",
              normalizationVersion: FILE_IMPORT_PARSER_VERSION,
              sourceFingerprint,
              createdAt: now,
              updatedAt: now,
              lastSeenAt: now,
            });
            replaceExternalCandidateDetails(
              transaction,
              candidateId,
              [{ sourceObjectId, relation: "primary" }],
              legs,
            );
            insertFileImportCandidateDetail(transaction, {
              candidateId,
              ...detail,
            });
            candidates.set(stableKey, {
              id: candidateId,
              connectionId: parsedContext.connectionId,
              stableKey,
              suggestedEventType: "unknown",
              status,
              occurredAt: row.occurredAt,
              title: row.payee ?? row.memo ?? "Statement transaction",
              normalizationVersion: FILE_IMPORT_PARSER_VERSION,
              sourceFingerprint,
              createdAt: now,
              updatedAt: now,
              lastSeenAt: now,
            });
          } else {
            assertService(
              findFileImportCandidateDetail(transaction, existingCandidate.id),
              "FILE_IMPORT_CANDIDATE_INTEGRITY_ERROR",
              "File-import candidate details are missing.",
            );
            updateExternalCandidate(transaction, existingCandidate.id, {
              suggestedEventType: "unknown",
              status,
              occurredAt: row.occurredAt,
              title: row.payee ?? row.memo ?? "Statement transaction",
              normalizationVersion: FILE_IMPORT_PARSER_VERSION,
              sourceFingerprint,
              updatedAt: now,
              lastSeenAt: now,
            });
            replaceExternalCandidateDetails(
              transaction,
              existingCandidate.id,
              [{ sourceObjectId, relation: "primary" }],
              legs,
            );
            updateFileImportCandidateDetail(
              transaction,
              existingCandidate.id,
              detail,
            );
          }
        }

        let balanceObservationId: string | null = null;
        const balance = parsedContext.parsed.closingBalance;
        if (balance) {
          balanceObservationId = this.runtime.id();
          const payloadJson = canonicalExternalJson({
            kind: balance.kind,
            asOf: balance.asOf,
            originalDateText: balance.originalDateText,
            datePrecision: balance.datePrecision,
            currencyCode: balance.currencyCode,
            signedAmountText: balance.rawSignedAmountText,
          });
          insertExternalBalanceObservation(transaction, {
            id: balanceObservationId,
            connectionId: parsedContext.connectionId,
            providerAssetKey: parsedContext.providerAssetKey,
            talliAssetId: parsedContext.assetId,
            providerAmountText: balance.rawSignedAmountText,
            mappedAmountAtomic: atomicToDb(balance.signedAtomic),
            precisionStatus: "exact",
            observedAt: balance.asOf,
            payloadHash: sha256(payloadJson),
            createdAt: now,
          });
          insertFileImportBalanceObservationDetail(transaction, {
            observationId: balanceObservationId,
            batchId,
            balanceKind: balance.kind,
            sourceDateText: balance.originalDateText,
            datePrecision: balance.datePrecision,
            statementCurrencyCode: balance.currencyCode,
          });
        }

        if (
          relations.profile.statementAccountFingerprint === null ||
          relations.profile.statementCurrencyCode === null
        ) {
          updateFileImportProfileIdentity(
            transaction,
            parsedContext.connectionId,
            {
              statementAccountFingerprint:
                parsedContext.parsed.statementIdentity.accountFingerprint,
              statementAccountLast4:
                parsedContext.parsed.statementIdentity.accountLast4,
              statementCurrencyCode:
                parsedContext.parsed.statementIdentity.currencyCode,
              updatedAt: now,
            },
          );
        }
        return {
          batchId,
          sourceRows: parsedContext.parsed.transactions.length,
          candidatesCreated,
          duplicates,
          unsupported,
          balanceObservationId,
        };
      },
      { behavior: "immediate" },
    );
  }

  async matchExisting(input: MatchExistingInput): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        assertService(
          input.confirmed === true,
          "FILE_IMPORT_MATCH_CONFIRMATION_REQUIRED",
          "Matching an existing event requires explicit confirmation.",
        );
        const candidate = findExternalCandidate(transaction, input.candidateId);
        assertService(
          candidate,
          "EXTERNAL_CANDIDATE_NOT_FOUND",
          "File-import candidate was not found.",
        );
        const connection = findExternalConnection(
          transaction,
          candidate.connectionId,
        );
        const detail = findFileImportCandidateDetail(transaction, candidate.id);
        const leg = listExternalCandidateLegs(transaction, candidate.id)[0];
        assertService(
          connection?.provider === "file_import" &&
            detail &&
            leg &&
            (leg.role === "external_in" || leg.role === "external_out") &&
            leg.amountAtomic !== null,
          "FILE_IMPORT_CANDIDATE_INTEGRITY_ERROR",
          "Candidate is not a valid file-import transaction.",
        );
        assertService(
          candidate.status === "pending" ||
            candidate.status === "needs_mapping",
          "FILE_IMPORT_CANDIDATE_NOT_MATCHABLE",
          "Candidate is not available for matching.",
        );
        assertService(
          !findExternalImportLink(transaction, candidate.id) &&
            !findExternalCandidateMatchLink(transaction, candidate.id),
          "FILE_IMPORT_CANDIDATE_ALREADY_RESOLVED",
          "Candidate already has import or match provenance.",
        );
        const ledgerEvent = findLedgerEventById(
          transaction,
          input.ledgerEventId,
        );
        const exactEntry = findExactLedgerAccountEntry(transaction, {
          ledgerEventId: input.ledgerEventId,
          accountId: detail.targetAccountId,
          amountAtomic: leg.amountAtomic,
        });
        assertService(
          ledgerEvent &&
            ledgerEvent.bookId === connection.bookId &&
            exactEntry?.bookId === connection.bookId,
          "FILE_IMPORT_MATCH_LEDGER_MISMATCH",
          "Selected event must contain the exact signed target-account entry in the same book.",
        );
        const matchedAt = runtimeNow(this.runtime);
        const matchFingerprint = sha256(
          canonicalExternalJson({
            candidateId: candidate.id,
            ledgerEventId: ledgerEvent.id,
            sourceFingerprint: candidate.sourceFingerprint,
            matchedAt,
          }),
        );
        insertExternalCandidateMatchLink(transaction, {
          candidateId: candidate.id,
          ledgerEventId: ledgerEvent.id,
          matchedAt,
          matchFingerprint,
        });
        updateExternalCandidate(transaction, candidate.id, {
          status: "matched",
          updatedAt: matchedAt,
          lastSeenAt: matchedAt,
        });
      },
      { behavior: "immediate" },
    );
  }

  async unlinkMatch(input: UnlinkFileImportMatchInput): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        assertService(
          input.confirmed === true,
          "FILE_IMPORT_UNLINK_CONFIRMATION_REQUIRED",
          "Unlinking a match requires explicit confirmation.",
        );
        const candidate = findExternalCandidate(transaction, input.candidateId);
        const link = findExternalCandidateMatchLink(
          transaction,
          input.candidateId,
        );
        assertService(
          candidate &&
            (candidate.status === "matched" ||
              candidate.status === "source_changed") &&
            link,
          "FILE_IMPORT_MATCH_NOT_FOUND",
          "Matched provenance was not found.",
        );
        deleteExternalCandidateMatchLink(transaction, input.candidateId);
        const now = runtimeNow(this.runtime);
        updateExternalCandidate(transaction, input.candidateId, {
          status: "pending",
          updatedAt: now,
          lastSeenAt: now,
        });
      },
      { behavior: "immediate" },
    );
  }
}
