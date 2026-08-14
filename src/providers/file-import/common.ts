import { createHash } from "node:crypto";

import { XMLParser, XMLValidator } from "fast-xml-parser";

import {
  MAX_FILE_IMPORT_BYTES,
  MAX_FILE_IMPORT_ROWS,
  MAX_FILE_IMPORT_TEXT_CHARS,
  fileImportWeakSignature,
  normalizeFileImportText,
  type CsvDateFormat,
  type FileImportDatePrecision,
} from "../../domain/file-import";
import { parseDecimalToAtomic } from "../../domain/money";
import { localDateTimeToUtc } from "../../domain/time";
import { FileImportError, fileImportFailure } from "./errors";

const XML_FORBIDDEN_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
const XML_XINCLUDE = /<\s*(?:[A-Za-z_][\w.-]*:)?include\b/i;
const XML_NAMED_ENTITY_REFERENCE = /&([A-Za-z_][\w.:-]*);/g;
const XML_NUMERIC_ENTITY_REFERENCE = /&#(?:x([0-9A-Fa-f]+)|([0-9]+));/g;
const XML_STANDARD_ENTITIES = new Set(["amp", "apos", "gt", "lt", "quot"]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export interface ParsedSourceDate {
  occurredAt: string;
  originalDateText: string;
  localDate: string;
  precision: FileImportDatePrecision;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertFileImportSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_FILE_IMPORT_BYTES) {
    fileImportFailure(
      "FILE_TOO_LARGE",
      `Statement file exceeds the ${MAX_FILE_IMPORT_BYTES} byte limit.`,
    );
  }
}

export function assertFileImportRowCount(count: number): void {
  if (count > MAX_FILE_IMPORT_ROWS) {
    fileImportFailure(
      "TOO_MANY_ROWS",
      `Statement contains more than ${MAX_FILE_IMPORT_ROWS} transaction rows.`,
    );
  }
}

export function boundedText(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (value.length > MAX_FILE_IMPORT_TEXT_CHARS) {
    fileImportFailure(
      "TEXT_FIELD_TOO_LONG",
      `${field} exceeds the ${MAX_FILE_IMPORT_TEXT_CHARS} character limit.`,
    );
  }
  const normalized = normalizeFileImportText(value);
  if (normalized !== null && normalized.length > MAX_FILE_IMPORT_TEXT_CHARS) {
    fileImportFailure(
      "TEXT_FIELD_TOO_LONG",
      `${field} exceeds the ${MAX_FILE_IMPORT_TEXT_CHARS} character limit after normalization.`,
    );
  }
  return normalized;
}

export function boundedOpaqueText(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (value.length > MAX_FILE_IMPORT_TEXT_CHARS) {
    fileImportFailure(
      "TEXT_FIELD_TOO_LONG",
      `${field} exceeds the ${MAX_FILE_IMPORT_TEXT_CHARS} character limit.`,
    );
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeStatementFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).at(-1) ?? "";
  const sanitized = basename.replace(CONTROL_CHARACTERS, "").trim();
  const clipped = [...sanitized].slice(0, 255).join("");
  return clipped.length > 0 ? clipped : "statement";
}

export function decodeStatement(
  bytes: Uint8Array,
  encoding: "utf-8" | "windows-1252" | "gb18030",
): string {
  assertFileImportSize(bytes);
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    fileImportFailure(
      "DECODE_FAILED",
      `Statement could not be decoded as ${encoding}.`,
    );
  }
}

export function assertSafeXmlText(text: string): void {
  if (XML_FORBIDDEN_DECLARATION.test(text)) {
    fileImportFailure(
      "XML_DTD_FORBIDDEN",
      "XML statements containing DTD or ENTITY declarations are rejected.",
    );
  }
  if (XML_XINCLUDE.test(text)) {
    fileImportFailure(
      "XML_XINCLUDE_FORBIDDEN",
      "XML statements containing XInclude are rejected.",
    );
  }
  if (
    [...text.matchAll(XML_NAMED_ENTITY_REFERENCE)].some(
      (match) => !XML_STANDARD_ENTITIES.has(match[1]!),
    )
  ) {
    fileImportFailure(
      "XML_ENTITY_FORBIDDEN",
      "XML statements may use only standard XML entity references.",
    );
  }
  const numericReferences = [...text.matchAll(XML_NUMERIC_ENTITY_REFERENCE)];
  const withoutValidNumericReferences = text.replace(
    XML_NUMERIC_ENTITY_REFERENCE,
    "",
  );
  const xmlCodePointIsValid = (codePoint: bigint): boolean =>
    codePoint === 0x9n ||
    codePoint === 0xan ||
    codePoint === 0xdn ||
    (codePoint >= 0x20n && codePoint <= 0xd7ffn) ||
    (codePoint >= 0xe000n && codePoint <= 0xfffdn) ||
    (codePoint >= 0x10000n && codePoint <= 0x10ffffn);
  if (
    withoutValidNumericReferences.includes("&#") ||
    numericReferences.some((match) => {
      if (
        (match[1] !== undefined && match[1].length > 6) ||
        (match[2] !== undefined && match[2].length > 7)
      ) {
        return true;
      }
      const codePoint = match[1] ? BigInt(`0x${match[1]}`) : BigInt(match[2]!);
      return !xmlCodePointIsValid(codePoint);
    })
  ) {
    fileImportFailure(
      "XML_ENTITY_FORBIDDEN",
      "XML numeric character references must be valid XML 1.0 code points.",
    );
  }
}

export function parseBoundedXml(
  text: string,
  options: { removeNamespacePrefix?: boolean; arrayTags?: Set<string> } = {},
): Record<string, unknown> {
  assertSafeXmlText(text);
  try {
    if (
      XMLValidator.validate(text, { allowBooleanAttributes: false }) !== true
    ) {
      fileImportFailure("MALFORMED_FILE", "XML statement is malformed.");
    }
    const parser = new XMLParser({
      allowBooleanAttributes: false,
      attributeNamePrefix: "@",
      ignoreAttributes: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      htmlEntities: true,
      maxNestedTags: 128,
      parseAttributeValue: false,
      parseTagValue: false,
      processEntities: true,
      removeNSPrefix: options.removeNamespacePrefix ?? false,
      trimValues: true,
      isArray: (tagName) => options.arrayTags?.has(tagName) ?? false,
    });
    const parsed: unknown = parser.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fileImportFailure("MALFORMED_FILE", "XML statement root is invalid.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof FileImportError) throw error;
    fileImportFailure("MALFORMED_FILE", "XML statement is malformed.");
  }
}

function realCalendarDate(year: string, month: string, day: string): string {
  const canonical = `${year}-${month}-${day}`;
  const parsed = new Date(`${canonical}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== canonical
  ) {
    fileImportFailure("INVALID_DATE", "Statement date is not a real date.");
  }
  return canonical;
}

export function parseCsvSourceDate(input: {
  dateText: string;
  dateFormat: CsvDateFormat;
  timeText: string | null;
  timeFormat: "HH:mm" | "HH:mm:ss" | null;
  timezone: string;
}): ParsedSourceDate {
  const rawDate = input.dateText.trim();
  let match: RegExpExecArray | null = null;
  let year = "";
  let month = "";
  let day = "";
  switch (input.dateFormat) {
    case "YYYY-MM-DD":
      match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
      [year, month, day] = match?.slice(1) ?? [];
      break;
    case "YYYY/MM/DD":
      match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(rawDate);
      [year, month, day] = match?.slice(1) ?? [];
      break;
    case "YYYYMMDD":
      match = /^(\d{4})(\d{2})(\d{2})$/.exec(rawDate);
      [year, month, day] = match?.slice(1) ?? [];
      break;
    case "DD/MM/YYYY":
      match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
      [day, month, year] = match?.slice(1) ?? [];
      break;
    case "MM/DD/YYYY":
      match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
      [month, day, year] = match?.slice(1) ?? [];
      break;
    case "DD.MM.YYYY":
      match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(rawDate);
      [day, month, year] = match?.slice(1) ?? [];
      break;
  }
  if (!match) {
    fileImportFailure(
      "INVALID_DATE",
      `Statement date does not match ${input.dateFormat}.`,
    );
  }
  const localDate = realCalendarDate(year, month, day);
  const rawTime = input.timeText?.trim() ?? "";
  if (input.timeFormat === null) {
    if (rawTime.length > 0) {
      fileImportFailure(
        "INVALID_CONFIG",
        "A time value was supplied without a configured time format.",
      );
    }
    return {
      occurredAt: localDateTimeToUtc(
        `${localDate}T12:00:00.000`,
        input.timezone,
      ),
      originalDateText: rawDate,
      localDate,
      precision: "day",
    };
  }
  const timePattern =
    input.timeFormat === "HH:mm"
      ? /^([01]\d|2[0-3]):([0-5]\d)$/
      : /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
  if (!timePattern.test(rawTime)) {
    fileImportFailure(
      "INVALID_DATE",
      `Statement time does not match ${input.timeFormat}.`,
    );
  }
  const withSeconds = input.timeFormat === "HH:mm" ? `${rawTime}:00` : rawTime;
  return {
    occurredAt: localDateTimeToUtc(
      `${localDate}T${withSeconds}.000`,
      input.timezone,
    ),
    originalDateText: `${rawDate} ${rawTime}`,
    localDate,
    precision: "timestamp",
  };
}

function validateGroupedWhole(
  whole: string,
  thousandsSeparator: string | null,
): string {
  if (thousandsSeparator === null) {
    if (!/^\d+$/.test(whole)) {
      fileImportFailure("INVALID_AMOUNT", "Statement amount is invalid.");
    }
    return whole;
  }
  if (!whole.includes(thousandsSeparator)) {
    if (!/^\d+$/.test(whole)) {
      fileImportFailure("INVALID_AMOUNT", "Statement amount is invalid.");
    }
    return whole;
  }
  const groups = whole.split(thousandsSeparator);
  if (
    groups.length < 2 ||
    !/^\d{1,3}$/.test(groups[0] ?? "") ||
    groups.slice(1).some((group) => !/^\d{3}$/.test(group))
  ) {
    fileImportFailure(
      "INVALID_AMOUNT",
      "Statement amount thousands grouping is invalid.",
    );
  }
  return groups.join("");
}

export function normalizeLocalizedAmount(input: {
  value: string;
  decimalSeparator: "." | ",";
  thousandsSeparator: "," | "." | " " | null;
}): string {
  const text = input.value.trim();
  if (text.length === 0) {
    fileImportFailure("INVALID_AMOUNT", "Statement amount is required.");
  }
  if (input.thousandsSeparator === input.decimalSeparator) {
    fileImportFailure(
      "INVALID_CONFIG",
      "Decimal and thousands separators must differ.",
    );
  }
  const signMatch = /^([+-]?)(.*)$/.exec(text);
  const sign = signMatch?.[1] ?? "";
  const unsigned = signMatch?.[2] ?? "";
  const decimalParts = unsigned.split(input.decimalSeparator);
  if (decimalParts.length > 2) {
    fileImportFailure("INVALID_AMOUNT", "Statement amount is invalid.");
  }
  const whole = validateGroupedWhole(
    decimalParts[0] ?? "",
    input.thousandsSeparator,
  );
  const fraction = decimalParts[1];
  if (fraction !== undefined && !/^\d+$/.test(fraction)) {
    fileImportFailure("INVALID_AMOUNT", "Statement amount is invalid.");
  }
  return `${sign}${whole}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function exactLocalizedAmount(input: {
  value: string;
  scale: number;
  decimalSeparator: "." | ",";
  thousandsSeparator: "," | "." | " " | null;
  invertSign?: boolean;
}): { amountText: string; atomic: bigint } {
  const normalized = normalizeLocalizedAmount(input);
  let atomic: bigint;
  try {
    atomic = parseDecimalToAtomic(normalized, input.scale);
  } catch {
    fileImportFailure(
      "INVALID_AMOUNT",
      "Statement amount is invalid or exceeds the target asset precision.",
    );
  }
  if (input.invertSign) atomic = -atomic;
  if (atomic === 0n) {
    fileImportFailure(
      "INVALID_AMOUNT",
      "Statement transaction amount must be non-zero.",
    );
  }
  const amountText = input.invertSign
    ? normalized.startsWith("-")
      ? normalized.slice(1)
      : `-${normalized.replace(/^\+/, "")}`
    : normalized.replace(/^\+/, "");
  return { amountText, atomic };
}

export function exactPlainAmount(
  value: string,
  scale: number,
  options: { allowZero?: boolean } = {},
): { amountText: string; atomic: bigint } {
  const amountText = value.trim().replace(/^\+/, "");
  let atomic: bigint;
  try {
    atomic = parseDecimalToAtomic(amountText, scale);
  } catch {
    fileImportFailure(
      "INVALID_AMOUNT",
      "Statement amount is invalid or exceeds the target asset precision.",
    );
  }
  if (!options.allowZero && atomic === 0n) {
    fileImportFailure(
      "INVALID_AMOUNT",
      "Statement transaction amount must be non-zero.",
    );
  }
  return { amountText, atomic };
}

export function weakSourceExternalId(input: {
  prefix: "csv" | "ofx" | "camt";
  identityNamespace: string;
  localSourceDate: string;
  signedAmountAtomic: bigint;
  payee: string | null;
  memo: string | null;
  ordinals: Map<string, number>;
}): string {
  const signature = fileImportWeakSignature(input);
  const hash = sha256Hex(signature);
  const ordinal = (input.ordinals.get(hash) ?? 0) + 1;
  input.ordinals.set(hash, ordinal);
  return `${input.prefix}:weak:${hash}:${ordinal}`;
}

export function objectValue(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fileImportFailure("MALFORMED_FILE", `${field} is malformed.`);
  }
  return value as Record<string, unknown>;
}

export function arrayValue(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function stringValue(
  value: unknown,
  field: string,
  options: { required?: boolean; opaque?: boolean } = {},
): string | null {
  if (value === undefined || value === null || value === "") {
    if (options.required) {
      fileImportFailure("MALFORMED_FILE", `${field} is required.`);
    }
    return null;
  }
  if (typeof value !== "string") {
    fileImportFailure("MALFORMED_FILE", `${field} is malformed.`);
  }
  const bounded = options.opaque
    ? boundedOpaqueText(value, field)
    : boundedText(value, field);
  if (options.required && bounded === null) {
    fileImportFailure("MALFORMED_FILE", `${field} is required.`);
  }
  return bounded;
}
