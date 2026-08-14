import { parse } from "csv-parse/sync";

import {
  type CsvImportConfig,
  type ParsedFileResult,
  type ParsedFileTransaction,
} from "../../domain/file-import";
import {
  assertFileImportRowCount,
  boundedOpaqueText,
  boundedText,
  decodeStatement,
  exactLocalizedAmount,
  parseCsvSourceDate,
  sanitizeStatementFilename,
  sha256Hex,
  weakSourceExternalId,
} from "./common";
import { FileImportError, fileImportFailure } from "./errors";

type CsvRow = Record<string, string> | string[];
interface CsvRawRecord {
  record: CsvRow;
  raw: string;
}

export interface ParseCsvStatementInput {
  bytes: Uint8Array;
  filename: string;
  config: CsvImportConfig;
  targetScale: number;
  expectedCurrency: string;
  identityNamespace: string;
}

function validateCsvConfig(config: CsvImportConfig): void {
  if (
    config.decimalSeparator === config.thousandsSeparator ||
    (config.timeColumn === null) !== (config.timeFormat === null)
  ) {
    fileImportFailure("INVALID_CONFIG", "CSV parser configuration is invalid.");
  }
  const requiredColumns = [config.dateColumn];
  if (config.amountMode.kind === "signed") {
    requiredColumns.push(config.amountMode.amountColumn);
  } else {
    requiredColumns.push(
      config.amountMode.debitColumn,
      config.amountMode.creditColumn,
    );
  }
  if (requiredColumns.some((column) => column.trim().length === 0)) {
    fileImportFailure(
      "INVALID_CONFIG",
      "CSV date and amount columns are required.",
    );
  }
}

function rowValues(row: CsvRow): string[] {
  return Array.isArray(row) ? row : Object.values(row);
}

function rowColumn(row: CsvRow, column: string, rowIndex: number): string {
  if (Array.isArray(row)) {
    if (!/^\d+$/.test(column)) {
      fileImportFailure(
        "INVALID_CONFIG",
        "Headerless CSV columns must use zero-based numeric indexes.",
      );
    }
    const value = row[Number(column)];
    if (value === undefined) {
      fileImportFailure(
        "INVALID_CONFIG",
        `CSV column ${column} is missing at row ${rowIndex + 1}.`,
      );
    }
    return value;
  }
  if (!Object.hasOwn(row, column)) {
    fileImportFailure("INVALID_CONFIG", `CSV column ${column} is missing.`);
  }
  return row[column] ?? "";
}

function optionalRowColumn(
  row: CsvRow,
  column: string | null,
  rowIndex: number,
): string | null {
  if (column === null) return null;
  return rowColumn(row, column, rowIndex);
}

function parseCsvRows(text: string, config: CsvImportConfig): CsvRawRecord[] {
  try {
    const parseWithRaw = parse as unknown as (
      value: string,
      options: Record<string, unknown>,
    ) => CsvRawRecord[];
    return parseWithRaw(text, {
      bom: true,
      columns: config.hasHeader
        ? (headers: string[]) => {
            const normalized = headers.map((header) => header.trim());
            if (
              normalized.some((header) => header.length === 0) ||
              new Set(normalized).size !== normalized.length
            ) {
              fileImportFailure(
                "MALFORMED_FILE",
                "CSV header names must be non-empty and unique.",
              );
            }
            for (const header of normalized) {
              boundedText(header, "CSV header");
            }
            return normalized;
          }
        : false,
      delimiter: config.delimiter,
      max_record_size: 128_000,
      raw: true,
      relax_column_count: false,
      skip_empty_lines: true,
    });
  } catch (error) {
    if (error instanceof FileImportError) throw error;
    fileImportFailure("MALFORMED_FILE", "CSV statement is malformed.");
  }
}

function signedCsvAmount(
  row: CsvRow,
  rowIndex: number,
  input: ParseCsvStatementInput,
): { amountText: string; atomic: bigint } {
  const shared = {
    scale: input.targetScale,
    decimalSeparator: input.config.decimalSeparator,
    thousandsSeparator: input.config.thousandsSeparator,
  } as const;
  if (input.config.amountMode.kind === "signed") {
    return exactLocalizedAmount({
      ...shared,
      value: rowColumn(row, input.config.amountMode.amountColumn, rowIndex),
      invertSign: input.config.invertSign,
    });
  }

  const debit = rowColumn(
    row,
    input.config.amountMode.debitColumn,
    rowIndex,
  ).trim();
  const credit = rowColumn(
    row,
    input.config.amountMode.creditColumn,
    rowIndex,
  ).trim();
  if (debit.length > 0 === credit.length > 0) {
    fileImportFailure(
      "INVALID_AMOUNT",
      `CSV row ${rowIndex + 1} must contain exactly one debit or credit amount.`,
    );
  }
  const parsed = exactLocalizedAmount({
    ...shared,
    value: debit.length > 0 ? debit : credit,
  });
  if (parsed.atomic < 0n) {
    fileImportFailure(
      "INVALID_AMOUNT",
      "Debit and credit columns must contain unsigned amounts.",
    );
  }
  const direction = debit.length > 0 ? -1n : 1n;
  const inversion = input.config.invertSign ? -1n : 1n;
  const atomic = parsed.atomic * direction * inversion;
  const amountText = `${atomic < 0n ? "-" : ""}${parsed.amountText.replace(/^\+/, "")}`;
  return { amountText, atomic };
}

export function parseCsvStatement(
  input: ParseCsvStatementInput,
): ParsedFileResult {
  validateCsvConfig(input.config);
  const text = decodeStatement(input.bytes, input.config.encoding);
  const rows = parseCsvRows(text, input.config);
  assertFileImportRowCount(rows.length);
  if (rows.length === 0) {
    fileImportFailure(
      "MALFORMED_FILE",
      "CSV statement has no transaction rows.",
    );
  }

  const expectedCurrency = input.expectedCurrency.trim().toUpperCase();
  if (expectedCurrency.length === 0) {
    fileImportFailure(
      "INVALID_CONFIG",
      "Target account currency code is required.",
    );
  }
  const weakOrdinals = new Map<string, number>();
  const localDates: string[] = [];
  const transactions: ParsedFileTransaction[] = rows.map(
    ({ record, raw }, rowIndex) => {
      for (const value of rowValues(record)) {
        boundedText(value, `CSV row ${rowIndex + 1} field`);
      }
      const sourceDate = parseCsvSourceDate({
        dateText: rowColumn(record, input.config.dateColumn, rowIndex),
        dateFormat: input.config.dateFormat,
        timeText: optionalRowColumn(record, input.config.timeColumn, rowIndex),
        timeFormat: input.config.timeFormat,
        timezone: input.config.timezone,
      });
      localDates.push(sourceDate.localDate);
      const amount = signedCsvAmount(record, rowIndex, input);
      const payee = boundedText(
        optionalRowColumn(record, input.config.payeeColumn, rowIndex),
        `CSV row ${rowIndex + 1} payee`,
      );
      const memo = boundedText(
        optionalRowColumn(record, input.config.memoColumn, rowIndex),
        `CSV row ${rowIndex + 1} memo`,
      );
      const rawCurrency = boundedText(
        optionalRowColumn(record, input.config.currencyColumn, rowIndex),
        `CSV row ${rowIndex + 1} currency`,
      );
      const currency = rawCurrency?.toUpperCase() ?? expectedCurrency;
      if (input.config.currencyColumn !== null && rawCurrency === null) {
        fileImportFailure(
          "CURRENCY_MISMATCH",
          `CSV row ${rowIndex + 1} currency is required.`,
        );
      }
      if (currency !== expectedCurrency) {
        fileImportFailure(
          "CURRENCY_MISMATCH",
          `CSV row ${rowIndex + 1} currency does not match the target account.`,
        );
      }
      const rawId = boundedOpaqueText(
        optionalRowColumn(record, input.config.idColumn, rowIndex),
        `CSV row ${rowIndex + 1} source id`,
      );
      const sourceExternalId =
        rawId === null
          ? weakSourceExternalId({
              prefix: "csv",
              identityNamespace: input.identityNamespace,
              localSourceDate: sourceDate.localDate,
              signedAmountAtomic: amount.atomic,
              payee,
              memo,
              ordinals: weakOrdinals,
            })
          : `csv:id:${rawId}`;
      return {
        sourceExternalId,
        identityStrength: rawId === null ? "weak" : "strong",
        sourceIdKind: rawId === null ? "weak_signature" : "csv_id",
        occurredAt: sourceDate.occurredAt,
        originalDateText: sourceDate.originalDateText,
        datePrecision: sourceDate.precision,
        rawSignedAmountText: amount.amountText,
        signedAtomic: amount.atomic,
        currencyCode: currency,
        payee,
        memo,
        rawSelectedFields: {
          id: rawId,
          date: sourceDate.originalDateText,
          amount: amount.amountText,
          payee,
          memo,
          currency,
        },
        rawRowSha256: sha256Hex(raw),
        unsupportedReason: null,
      };
    },
  );

  const sortedDates = localDates.toSorted();
  return {
    parsed: {
      format: "csv",
      fileSha256: sha256Hex(input.bytes),
      sanitizedFilename: sanitizeStatementFilename(input.filename),
      statementIdentity: {
        accountFingerprint: null,
        accountLast4: null,
        currencyCode: expectedCurrency,
      },
      statementFromDate: sortedDates[0] ?? null,
      statementToDate: sortedDates.at(-1) ?? null,
      transactions,
      closingBalance: null,
    },
    warnings: [],
  };
}
