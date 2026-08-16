// HISTORICAL DESIGN CONTRACT ONLY. NOT CURRENT SOURCE OR API.
// Current source and migrations take precedence.

export type FileImportFormat = "csv" | "ofx" | "qfx" | "camt053";
export type FileImportIdentityStrength = "strong" | "weak";
export type FileImportDatePrecision = "timestamp" | "day";
export type FileImportDirection = "in" | "out";

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
  sourceIdKind:
    | "fitid"
    | "acct_svcr_ref"
    | "tx_id"
    | "ntry_ref"
    | "csv_id"
    | "weak_signature";
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
