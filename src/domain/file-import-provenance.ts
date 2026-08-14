import { createHash } from "node:crypto";

import { z } from "zod";

import { DomainValidationError, assertDomain } from "./errors";
import { validatedExternalDecimalText } from "./external-sync";
import {
  MAX_FILE_IMPORT_TEXT_CHARS,
  type FileImportFormat,
} from "./file-import";
import { parseDecimalToAtomic } from "./money";
import { utcInstantToLocalDateTime } from "./time";

const fileExternalIdentity = z
  .string()
  .min(1)
  .max(MAX_FILE_IMPORT_TEXT_CHARS + 64);
const nullableText = z.string().nullable();
const externalDecimalText = z.string().refine((value) => {
  try {
    validatedExternalDecimalText(value);
    return true;
  } catch {
    return false;
  }
}, "External amount must be plain decimal text.");

const fileSourcePayloadBase = {
  sourceExternalId: fileExternalIdentity,
  originalDateText: z.string(),
  datePrecision: z.enum(["timestamp", "day"]),
  signedAmountText: externalDecimalText,
  currencyCode: nullableText,
  payee: nullableText,
  memo: nullableText,
  unsupportedReason: nullableText,
} as const;

const fileSourcePayloadSchema = z.union([
  z
    .object({
      ...fileSourcePayloadBase,
      format: z.literal("csv"),
      selectedFields: z
        .object({
          id: nullableText,
          date: z.string(),
          amount: externalDecimalText,
          payee: nullableText,
          memo: nullableText,
          currency: z.string(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...fileSourcePayloadBase,
      format: z.enum(["ofx", "qfx"]),
      selectedFields: z
        .object({
          fitid: nullableText,
          transactionType: nullableText,
          date: z.string(),
          amount: externalDecimalText,
          payee: nullableText,
          memo: nullableText,
          checkNumber: nullableText,
          referenceNumber: nullableText,
          sic: nullableText,
          currency: z.string(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...fileSourcePayloadBase,
      format: z.literal("camt053"),
      selectedFields: z
        .object({
          accountServicerReference: nullableText,
          entryReference: nullableText,
          transactionId: nullableText,
          endToEndId: nullableText,
          date: z.string(),
          valueDate: nullableText,
          amount: externalDecimalText,
          currency: z.string(),
          payee: nullableText,
          memo: nullableText,
          bankTransactionCode: nullableText,
          status: nullableText,
        })
        .strict(),
    })
    .strict(),
]);

export type FileImportSourcePayload = z.infer<typeof fileSourcePayloadSchema>;

export interface FileImportCandidateProvenanceInput {
  connection: {
    id: string;
    bookId: string;
    provider: string;
  } | null;
  profile: {
    connectionId: string;
    targetAccountId: string;
    format: string;
    parserConfigJson: string;
  } | null;
  targetAccount: {
    id: string;
    bookId: string;
    assetId: string;
  } | null;
  targetAsset: {
    id: string;
    code: string;
    scale: number;
  } | null;
  candidate: {
    id: string;
    connectionId: string;
    stableKey: string;
    suggestedEventType: string;
    occurredAt: string;
    sourceFingerprint: string;
  } | null;
  candidateDetail: {
    candidateId: string;
    targetAccountId: string;
    direction: string;
    normalizedPayee: string | null;
    memo: string | null;
    sourceDateText: string;
    datePrecision: string;
  } | null;
  sourceLinks: readonly {
    candidateId: string;
    sourceObjectId: string;
    relation: string;
  }[];
  sources: readonly {
    id: string;
    connectionId: string;
    objectType: string;
    externalId: string;
    occurredAt: string;
    payloadJson: string;
    payloadHash: string;
  }[];
  sourceDetails: readonly {
    sourceObjectId: string;
    originalDateText: string;
    datePrecision: string;
    normalizedPayee: string | null;
    memo: string | null;
    statementCurrencyCode: string | null;
  }[];
  legs: readonly {
    id: string;
    candidateId: string;
    legIndex: number;
    role: string;
    providerAssetKey: string;
    talliAssetId: string | null;
    amountText: string;
    amountAtomic: string | null;
    precisionStatus: string;
    note: string | null;
  }[];
}

export interface ValidatedFileImportCandidateProvenance {
  connection: NonNullable<FileImportCandidateProvenanceInput["connection"]>;
  profile: NonNullable<FileImportCandidateProvenanceInput["profile"]>;
  targetAccount: NonNullable<
    FileImportCandidateProvenanceInput["targetAccount"]
  >;
  targetAsset: NonNullable<FileImportCandidateProvenanceInput["targetAsset"]>;
  candidate: NonNullable<FileImportCandidateProvenanceInput["candidate"]>;
  candidateDetail: NonNullable<
    FileImportCandidateProvenanceInput["candidateDetail"]
  >;
  source: FileImportCandidateProvenanceInput["sources"][number];
  sourceDetail: FileImportCandidateProvenanceInput["sourceDetails"][number];
  leg: FileImportCandidateProvenanceInput["legs"][number] & {
    role: "external_in" | "external_out";
    talliAssetId: string;
    amountAtomic: string;
    precisionStatus: "exact";
  };
  payload: FileImportSourcePayload;
  signedAtomic: bigint;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function integrity(condition: unknown, message: string): asserts condition {
  assertDomain(condition, "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR", message);
}

export function fileImportCandidateSourceFingerprint(
  sourceExternalId: string,
  payloadHash: string,
): string {
  return sha256(`file_transaction:${sourceExternalId}:${payloadHash}`);
}

export function parseFileImportSourcePayloadJson(
  payloadJson: string,
): FileImportSourcePayload {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson);
  } catch {
    throw new DomainValidationError(
      "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR",
      "File-import source payload is not valid JSON.",
    );
  }
  const parsed = fileSourcePayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainValidationError(
      "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR",
      "File-import source payload is not a strict selected-field record.",
    );
  }
  return parsed.data;
}

function profileTimezone(
  format: FileImportFormat,
  parserConfigJson: string,
): string {
  let config: unknown;
  try {
    config = JSON.parse(parserConfigJson);
  } catch {
    throw new DomainValidationError(
      "FILE_IMPORT_PROVENANCE_INTEGRITY_ERROR",
      "File-import profile configuration is not valid JSON.",
    );
  }
  integrity(
    config !== null && typeof config === "object" && !Array.isArray(config),
    "File-import profile configuration is invalid.",
  );
  const record = config as Record<string, unknown>;
  const timezone =
    format === "csv" ? record.timezone : record.timezoneForDateOnly;
  integrity(
    typeof timezone === "string" && timezone.length > 0,
    "File-import profile timezone is missing.",
  );
  return timezone;
}

export function assertFileImportCandidateProvenance(
  input: FileImportCandidateProvenanceInput,
): ValidatedFileImportCandidateProvenance {
  const {
    connection,
    profile,
    targetAccount,
    targetAsset,
    candidate,
    candidateDetail,
  } = input;
  integrity(
    connection?.provider === "file_import" &&
      profile?.connectionId === connection.id &&
      candidate?.connectionId === connection.id,
    "File-import connection, profile, and candidate are not bound.",
  );
  integrity(
    targetAccount !== null &&
      targetAsset !== null &&
      profile.targetAccountId === targetAccount.id &&
      targetAccount.bookId === connection.bookId &&
      targetAccount.assetId === targetAsset.id,
    "File-import target account and asset are not bound to the profile.",
  );
  integrity(
    candidateDetail?.candidateId === candidate.id &&
      candidateDetail.targetAccountId === targetAccount.id,
    "File-import candidate details are missing or target another account.",
  );

  const primaryLinks = input.sourceLinks.filter(
    (link) => link.relation === "primary",
  );
  integrity(
    input.sourceLinks.length === 1 &&
      primaryLinks.length === 1 &&
      primaryLinks[0]?.candidateId === candidate.id,
    "File-import candidate must have exactly one primary source.",
  );
  const source = input.sources.find(
    (row) => row.id === primaryLinks[0]!.sourceObjectId,
  );
  integrity(
    input.sources.length === 1 &&
      source?.objectType === "file_transaction" &&
      source.connectionId === candidate.connectionId,
    "File-import primary source is missing or belongs to another connection.",
  );
  const sourceDetail = input.sourceDetails.find(
    (row) => row.sourceObjectId === source.id,
  );
  integrity(
    input.sourceDetails.length === 1 && sourceDetail !== undefined,
    "File-import primary source details are missing.",
  );

  const payloadHash = sha256(source.payloadJson);
  integrity(
    payloadHash === source.payloadHash,
    "File-import primary source payload hash does not match.",
  );
  const payload = parseFileImportSourcePayloadJson(source.payloadJson);
  integrity(
    payload.format === profile.format &&
      payload.sourceExternalId === source.externalId &&
      candidate.stableKey === `file:${source.externalId}` &&
      candidate.suggestedEventType === "unknown" &&
      candidate.sourceFingerprint ===
        fileImportCandidateSourceFingerprint(source.externalId, payloadHash),
    "File-import source identity or candidate fingerprint does not match.",
  );
  integrity(
    candidate.occurredAt === source.occurredAt,
    "File-import candidate occurrence time differs from its primary source.",
  );

  const sourceAtomic = parseDecimalToAtomic(
    payload.signedAmountText,
    targetAsset.scale,
  );
  const selectedAtomic = parseDecimalToAtomic(
    payload.selectedFields.amount,
    targetAsset.scale,
  );
  integrity(
    sourceAtomic !== 0n && sourceAtomic === selectedAtomic,
    "File-import selected amount differs from its signed source amount.",
  );
  integrity(
    payload.selectedFields.date === payload.originalDateText &&
      payload.selectedFields.payee === payload.payee &&
      payload.selectedFields.memo === payload.memo &&
      payload.selectedFields.currency === payload.currencyCode &&
      payload.currencyCode === targetAsset.code,
    "File-import selected date, payee, memo, or currency is inconsistent.",
  );
  integrity(
    sourceDetail.originalDateText === payload.originalDateText &&
      sourceDetail.datePrecision === payload.datePrecision &&
      sourceDetail.normalizedPayee === payload.payee &&
      sourceDetail.memo === payload.memo &&
      sourceDetail.statementCurrencyCode === payload.currencyCode,
    "File-import source details differ from the strict source payload.",
  );
  integrity(
    candidateDetail.normalizedPayee === sourceDetail.normalizedPayee &&
      candidateDetail.memo === sourceDetail.memo &&
      candidateDetail.datePrecision === sourceDetail.datePrecision,
    "File-import candidate details differ from the primary source details.",
  );
  const timezone = profileTimezone(
    profile.format as FileImportFormat,
    profile.parserConfigJson,
  );
  integrity(
    candidateDetail.sourceDateText ===
      utcInstantToLocalDateTime(source.occurredAt, timezone).slice(0, 10),
    "File-import candidate source date differs from its primary source.",
  );

  const leg = input.legs[0];
  integrity(
    input.legs.length === 1 &&
      leg?.candidateId === candidate.id &&
      leg.legIndex === 0 &&
      leg.providerAssetKey === `file:${connection.id}:target` &&
      leg.talliAssetId === targetAsset.id &&
      leg.precisionStatus === "exact" &&
      leg.amountAtomic !== null &&
      /^-?\d+$/.test(leg.amountAtomic),
    "File-import candidate must have exactly one exact statement leg.",
  );
  const legTextAtomic = parseDecimalToAtomic(leg.amountText, targetAsset.scale);
  integrity(
    legTextAtomic === sourceAtomic && BigInt(leg.amountAtomic) === sourceAtomic,
    "File-import candidate leg amount differs from its primary source amount.",
  );
  const direction = sourceAtomic < 0n ? "out" : "in";
  const role = sourceAtomic < 0n ? "external_out" : "external_in";
  integrity(
    candidateDetail.direction === direction &&
      leg.role === role &&
      leg.note === payload.unsupportedReason,
    "File-import direction, leg role, sign, or unsupported reason conflicts.",
  );

  return {
    connection,
    profile,
    targetAccount,
    targetAsset,
    candidate,
    candidateDetail,
    source,
    sourceDetail,
    leg: leg as ValidatedFileImportCandidateProvenance["leg"],
    payload,
    signedAtomic: sourceAtomic,
  };
}

export function assertSameBatchFileSourceIds(
  rows: readonly {
    sourceExternalId: string;
    canonicalPayload: string;
  }[],
): void {
  const payloadBySourceId = new Map<string, string>();
  for (const row of rows) {
    const prior = payloadBySourceId.get(row.sourceExternalId);
    if (prior !== undefined && prior !== row.canonicalPayload) {
      throw new DomainValidationError(
        "FILE_IMPORT_SOURCE_ID_CONFLICT",
        `Source ID ${row.sourceExternalId} has contradictory financial payloads in one file.`,
      );
    }
    payloadBySourceId.set(row.sourceExternalId, row.canonicalPayload);
  }
}
