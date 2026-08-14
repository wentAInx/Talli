export const MAX_FILE_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_IMPORT_ROWS = 100_000;
export const MAX_FILE_IMPORT_TEXT_CHARS = 10_000;
export const FILE_IMPORT_PARSER_VERSION = 1;

export type FileImportFormat = "csv" | "ofx" | "qfx" | "camt053";
export type FileImportIdentityStrength = "strong" | "weak";
export type FileImportDatePrecision = "timestamp" | "day";
export type FileImportDirection = "in" | "out";
export type FileImportSourceIdKind =
  | "fitid"
  | "acct_svcr_ref"
  | "tx_id"
  | "ntry_ref"
  | "csv_id"
  | "weak_signature";

export type CsvEncoding = "utf-8" | "windows-1252" | "gb18030";
export type CsvDelimiter = "," | ";" | "\t";
export type CsvDateFormat =
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "YYYYMMDD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD.MM.YYYY";

export type CsvAmountMode =
  | { kind: "signed"; amountColumn: string }
  | { kind: "debit_credit"; debitColumn: string; creditColumn: string };

export interface CsvImportConfig {
  hasHeader: boolean;
  encoding: CsvEncoding;
  delimiter: CsvDelimiter;
  dateColumn: string;
  dateFormat: CsvDateFormat;
  timeColumn: string | null;
  timeFormat: "HH:mm" | "HH:mm:ss" | null;
  amountMode: CsvAmountMode;
  decimalSeparator: "." | ",";
  thousandsSeparator: "," | "." | " " | null;
  invertSign: boolean;
  idColumn: string | null;
  payeeColumn: string | null;
  memoColumn: string | null;
  currencyColumn: string | null;
  timezone: string;
}

export interface StructuredImportConfig {
  timezoneForDateOnly: string;
}

export interface FileImportProfileDraft {
  bookId: string;
  targetAccountId: string;
  name: string;
  format: FileImportFormat;
  parserConfig: CsvImportConfig | StructuredImportConfig;
}

export interface ParsedStatementIdentity {
  accountFingerprint: string | null;
  accountLast4: string | null;
  currencyCode: string | null;
}

export interface ParsedFileTransaction {
  sourceExternalId: string;
  identityStrength: FileImportIdentityStrength;
  sourceIdKind: FileImportSourceIdKind;
  occurredAt: string;
  originalDateText: string;
  datePrecision: FileImportDatePrecision;
  rawSignedAmountText: string;
  signedAtomic: bigint;
  currencyCode: string | null;
  payee: string | null;
  memo: string | null;
  rawSelectedFields: Readonly<Record<string, string | null>>;
  rawRowSha256: string;
  unsupportedReason: string | null;
}

export interface ParsedStatementBalance {
  kind: "closing_ledger" | "closing_booked";
  asOf: string;
  originalDateText: string;
  datePrecision: FileImportDatePrecision;
  currencyCode: string;
  rawSignedAmountText: string;
  signedAtomic: bigint;
}

export interface ParsedFileBatch {
  format: FileImportFormat;
  fileSha256: string;
  sanitizedFilename: string;
  statementIdentity: ParsedStatementIdentity;
  statementFromDate: string | null;
  statementToDate: string | null;
  transactions: ParsedFileTransaction[];
  closingBalance: ParsedStatementBalance | null;
}

export interface ParsedFileResult {
  parsed: ParsedFileBatch;
  warnings: string[];
}

export interface LedgerMatchSuggestion {
  ledgerEventId: string;
  score: number;
  reasons: string[];
}

export interface FileImportPreview {
  fatalErrors: string[];
  warnings: string[];
  parsed: ParsedFileBatch | null;
  alreadyKnownSourceIds: string[];
  matchSuggestions: Readonly<Record<string, LedgerMatchSuggestion[]>>;
}

export interface FileImportCommitResult {
  batchId: string;
  sourceRows: number;
  candidatesCreated: number;
  duplicates: number;
  unsupported: number;
  balanceObservationId: string | null;
}

export interface MatchExistingInput {
  candidateId: string;
  ledgerEventId: string;
  confirmed: true;
}

export interface FileImportMatchScoreInput {
  sourceLocalDate: string;
  sourcePayee: string | null;
  sourceMemo: string | null;
  ledgerLocalDate: string;
  ledgerPayee: string | null;
  ledgerNote: string | null;
}

function calendarDayDistance(left: string, right: string): number {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(left) || !pattern.test(right)) {
    throw new Error("Match dates must use YYYY-MM-DD.");
  }
  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    throw new Error("Match dates must be real calendar dates.");
  }
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000));
}

export function scoreFileImportLedgerMatch(input: FileImportMatchScoreInput): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  const dayDistance = calendarDayDistance(
    input.sourceLocalDate,
    input.ledgerLocalDate,
  );
  if (dayDistance > 3) {
    return { score: 0, reasons: [] };
  }
  const dateScores = [5000, 4000, 3000, 2000] as const;
  score += dateScores[dayDistance]!;
  reasons.push(dayDistance === 0 ? "same date" : `date ±${dayDistance}`);

  const sourcePayee = normalizedFileImportMatchText(input.sourcePayee);
  const ledgerPayee = normalizedFileImportMatchText(input.ledgerPayee);
  if (sourcePayee && ledgerPayee) {
    if (sourcePayee === ledgerPayee) {
      score += 4000;
      reasons.push("payee exact");
    } else if (
      sourcePayee.includes(ledgerPayee) ||
      ledgerPayee.includes(sourcePayee)
    ) {
      score += 2500;
      reasons.push("payee contains");
    }
  }

  const sourceMemo = normalizedFileImportMatchText(input.sourceMemo);
  const ledgerNote = normalizedFileImportMatchText(input.ledgerNote);
  if (sourceMemo && ledgerNote && sourceMemo === ledgerNote) {
    score += 1000;
    reasons.push("memo exact");
  }
  return { score: Math.min(score, 10_000), reasons };
}

export function normalizeFileImportText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function normalizedFileImportMatchText(
  value: string | null,
): string | null {
  return normalizeFileImportText(value)?.toLocaleLowerCase("en-US") ?? null;
}

export function fileImportWeakSignature(input: {
  identityNamespace: string;
  localSourceDate: string;
  signedAmountAtomic: bigint;
  payee: string | null;
  memo: string | null;
}): string {
  return JSON.stringify([
    input.identityNamespace,
    input.localSourceDate,
    input.signedAmountAtomic.toString(),
    normalizedFileImportMatchText(input.payee),
    normalizedFileImportMatchText(input.memo),
  ]);
}

export function fileImportDirection(amount: bigint): FileImportDirection {
  if (amount === 0n) {
    throw new Error("File-import transaction amount must be non-zero.");
  }
  return amount < 0n ? "out" : "in";
}

export function allowedFileImportEventTypes(
  direction: FileImportDirection,
): readonly ("expense" | "income" | "transfer")[] {
  return direction === "out"
    ? (["expense", "transfer"] as const)
    : (["income", "transfer"] as const);
}
