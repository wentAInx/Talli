import {
  type CsvImportConfig,
  type FileImportFormat,
  type ParsedFileResult,
  type StructuredImportConfig,
} from "../../domain/file-import";
import { parseCamt053Statement } from "./camt053";
import { assertFileImportSize } from "./common";
import { parseCsvStatement } from "./csv";
import { fileImportFailure } from "./errors";
import { parseOfxStatement } from "./ofx";

export interface ParseFinancialFileInput {
  bytes: Uint8Array;
  filename: string;
  format: FileImportFormat;
  parserConfig: CsvImportConfig | StructuredImportConfig;
  targetScale: number;
  expectedCurrency: string;
  identityNamespace: string;
}

function isCsvConfig(
  value: CsvImportConfig | StructuredImportConfig,
): value is CsvImportConfig {
  return "hasHeader" in value;
}

function isStructuredConfig(
  value: CsvImportConfig | StructuredImportConfig,
): value is StructuredImportConfig {
  return "timezoneForDateOnly" in value;
}

export function sniffFinancialFileFormat(
  bytes: Uint8Array,
): "csv" | "ofx" | "camt053" {
  assertFileImportSize(bytes);
  const prefix = new TextDecoder("windows-1252").decode(bytes.slice(0, 8192));
  if (/^\s*OFXHEADER:/i.test(prefix) || /<\s*OFX\b/i.test(prefix)) {
    return "ofx";
  }
  if (/urn:iso:std:iso:20022:tech:xsd:camt\.053\.001\.\d{2}/i.test(prefix)) {
    return "camt053";
  }
  return "csv";
}

export function parseFinancialFile(
  input: ParseFinancialFileInput,
): ParsedFileResult {
  if (input.format === "csv") {
    if (!isCsvConfig(input.parserConfig)) {
      fileImportFailure(
        "INVALID_CONFIG",
        "CSV import requires a CSV parser configuration.",
      );
    }
    return parseCsvStatement({
      ...input,
      config: input.parserConfig,
    });
  }
  if (!isStructuredConfig(input.parserConfig)) {
    fileImportFailure(
      "INVALID_CONFIG",
      "Structured import requires a timezone configuration.",
    );
  }
  if (input.format === "ofx" || input.format === "qfx") {
    return parseOfxStatement({
      ...input,
      format: input.format,
      config: input.parserConfig,
    });
  }
  return parseCamt053Statement({
    ...input,
    config: input.parserConfig,
  });
}

export * from "./camt053";
export * from "./common";
export * from "./csv";
export * from "./errors";
export * from "./ofx";
