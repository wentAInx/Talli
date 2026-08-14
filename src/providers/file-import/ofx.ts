import {
  type FileImportFormat,
  type ParsedFileResult,
  type ParsedFileTransaction,
  type ParsedStatementBalance,
  type StructuredImportConfig,
} from "../../domain/file-import";
import { localDateTimeToUtc } from "../../domain/time";
import {
  arrayValue,
  assertFileImportRowCount,
  assertFileImportSize,
  assertSafeXmlText,
  boundedOpaqueText,
  boundedText,
  decodeStatement,
  exactPlainAmount,
  objectValue,
  parseBoundedXml,
  sanitizeStatementFilename,
  sha256Hex,
  stringValue,
  weakSourceExternalId,
  type ParsedSourceDate,
} from "./common";
import { FileImportError, fileImportFailure } from "./errors";

interface OfxTransactionShape {
  fields: Record<string, string | null>;
  rawHashSource: string;
}

interface OfxStatementShape {
  currency: string;
  bankId: string | null;
  accountId: string;
  accountType: string | null;
  creditCard: boolean;
  fromDate: string | null;
  toDate: string | null;
  transactions: OfxTransactionShape[];
  ledgerBalance: { amount: string; asOf: string } | null;
}

export interface ParseOfxStatementInput {
  bytes: Uint8Array;
  filename: string;
  format: Extract<FileImportFormat, "ofx" | "qfx">;
  config: StructuredImportConfig;
  targetScale: number;
  expectedCurrency: string;
  identityNamespace: string;
}

const OFX_UNSUPPORTED_MESSAGE_SET =
  /<(?:INVSTMTMSGSRSV1|LOANMSGSRSV1|BILLPAYMSGSRSV1|WIREXFERMSGSRSV1|TAX1099MSGSRSV1)\b/i;
const OFX_CONTAINERS = new Set([
  "OFX",
  "BANKMSGSRSV1",
  "CREDITCARDMSGSRSV1",
  "STMTTRNRS",
  "CCSTMTTRNRS",
  "STATUS",
  "STMTRS",
  "CCSTMTRS",
  "BANKACCTFROM",
  "CCACCTFROM",
  "BANKTRANLIST",
  "STMTTRN",
  "LEDGERBAL",
]);

function statementDecoder(bytes: Uint8Array): string {
  assertFileImportSize(bytes);
  const prefix = new TextDecoder("windows-1252").decode(bytes.slice(0, 4096));
  const xmlEncoding =
    /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(prefix)?.[1]?.toLowerCase() ??
    null;
  if (
    xmlEncoding !== null &&
    xmlEncoding !== "utf-8" &&
    xmlEncoding !== "utf8"
  ) {
    fileImportFailure(
      "DECODE_FAILED",
      `OFX XML encoding ${xmlEncoding} is not supported.`,
    );
  }
  if (xmlEncoding !== null || /^\s*<\?xml/i.test(prefix)) {
    return decodeStatement(bytes, "utf-8");
  }
  const charset = /^CHARSET:\s*([^\r\n]+)/im.exec(prefix)?.[1]?.trim();
  const encoding = /^ENCODING:\s*([^\r\n]+)/im.exec(prefix)?.[1]?.trim();
  if (
    charset === "1252" ||
    encoding?.toUpperCase() === "USASCII" ||
    encoding?.toUpperCase() === "ASCII"
  ) {
    return decodeStatement(bytes, "windows-1252");
  }
  return decodeStatement(bytes, "utf-8");
}

function assertBoundedSgml(text: string): void {
  assertSafeXmlText(text);
  if (OFX_UNSUPPORTED_MESSAGE_SET.test(text)) {
    fileImportFailure(
      "UNSUPPORTED_FORMAT",
      "OFX investment, loan, bill-pay, wire, and tax message sets are unsupported.",
    );
  }
  const stack: string[] = [];
  const tagPattern = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9_.:-]*)(?:\s[^>]*)?>/g;
  let match: RegExpExecArray | null;
  let tags = 0;
  while ((match = tagPattern.exec(text)) !== null) {
    tags += 1;
    if (tags > 2_100_000) {
      fileImportFailure("MALFORMED_FILE", "OFX statement has too many tags.");
    }
    const closing = match[1] === "/";
    const tag = match[2]!.toUpperCase();
    if (!OFX_CONTAINERS.has(tag)) continue;
    if (closing) {
      if (stack.at(-1) !== tag) {
        fileImportFailure(
          "MALFORMED_FILE",
          "OFX SGML container nesting is malformed.",
        );
      }
      stack.pop();
    } else {
      stack.push(tag);
      if (stack.length > 128) {
        fileImportFailure(
          "MALFORMED_FILE",
          "OFX SGML nesting exceeds the supported limit.",
        );
      }
    }
  }
  if (stack.length > 0 || !/<OFX>/i.test(text)) {
    fileImportFailure("MALFORMED_FILE", "OFX SGML statement is malformed.");
  }
}

function sgmlValue(
  block: string,
  tag: string,
  options: { opaque?: boolean } = {},
): string | null {
  const match = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i").exec(block);
  return options.opaque
    ? boundedOpaqueText(match?.[1] ?? null, `OFX ${tag}`)
    : boundedText(match?.[1] ?? null, `OFX ${tag}`);
}

function sgmlBlock(text: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "i").exec(text);
  return match?.[0] ?? null;
}

function parseSgmlTransactions(statement: string): OfxTransactionShape[] {
  const list = sgmlBlock(statement, "BANKTRANLIST");
  if (list === null) {
    fileImportFailure("MALFORMED_FILE", "OFX BANKTRANLIST is required.");
  }
  const starts = [...list.matchAll(/<STMTTRN>/gi)].map((match) => match.index);
  return starts.map((start, index) => {
    const next = starts[index + 1] ?? list.search(/<\/BANKTRANLIST>/i);
    const end = next > start ? next : list.length;
    const block = list.slice(start, end).replace(/<\/STMTTRN>[\s\S]*$/i, "");
    const fields = Object.fromEntries(
      [
        "TRNTYPE",
        "DTPOSTED",
        "DTUSER",
        "TRNAMT",
        "FITID",
        "NAME",
        "MEMO",
        "CHECKNUM",
        "REFNUM",
        "SIC",
      ].map((tag) => [tag, sgmlValue(block, tag, { opaque: tag === "FITID" })]),
    );
    return { fields, rawHashSource: block };
  });
}

function parseSgmlStatement(text: string): OfxStatementShape {
  assertBoundedSgml(text);
  const bankStatement = sgmlBlock(text, "STMTRS");
  const creditStatement = sgmlBlock(text, "CCSTMTRS");
  if ((bankStatement === null) === (creditStatement === null)) {
    fileImportFailure(
      "MALFORMED_FILE",
      "OFX must contain exactly one banking or credit-card statement.",
    );
  }
  const statement = bankStatement ?? creditStatement!;
  const creditCard = creditStatement !== null;
  const accountBlock = sgmlBlock(
    statement,
    creditCard ? "CCACCTFROM" : "BANKACCTFROM",
  );
  if (accountBlock === null) {
    fileImportFailure("MALFORMED_FILE", "OFX statement account is required.");
  }
  const accountId = sgmlValue(accountBlock, "ACCTID");
  const currency = sgmlValue(statement, "CURDEF");
  if (accountId === null || currency === null) {
    fileImportFailure(
      "MALFORMED_FILE",
      "OFX account id and CURDEF are required.",
    );
  }
  const list = sgmlBlock(statement, "BANKTRANLIST");
  const balanceBlock = sgmlBlock(statement, "LEDGERBAL");
  const balanceAmount = balanceBlock ? sgmlValue(balanceBlock, "BALAMT") : null;
  const balanceDate = balanceBlock ? sgmlValue(balanceBlock, "DTASOF") : null;
  if ((balanceAmount === null) !== (balanceDate === null)) {
    fileImportFailure("MALFORMED_FILE", "OFX LEDGERBAL is incomplete.");
  }
  return {
    currency,
    bankId: creditCard ? null : sgmlValue(accountBlock, "BANKID"),
    accountId,
    accountType: creditCard ? null : sgmlValue(accountBlock, "ACCTTYPE"),
    creditCard,
    fromDate: list ? sgmlValue(list, "DTSTART") : null,
    toDate: list ? sgmlValue(list, "DTEND") : null,
    transactions: parseSgmlTransactions(statement),
    ledgerBalance:
      balanceAmount !== null && balanceDate !== null
        ? { amount: balanceAmount, asOf: balanceDate }
        : null,
  };
}

function childObject(
  parent: Record<string, unknown>,
  key: string,
  field: string,
): Record<string, unknown> {
  return objectValue(parent[key], field);
}

function xmlFields(
  value: Record<string, unknown>,
): Record<string, string | null> {
  return Object.fromEntries(
    [
      "TRNTYPE",
      "DTPOSTED",
      "DTUSER",
      "TRNAMT",
      "FITID",
      "NAME",
      "MEMO",
      "CHECKNUM",
      "REFNUM",
      "SIC",
    ].map((tag) => [
      tag,
      stringValue(value[tag], `OFX ${tag}`, { opaque: tag === "FITID" }),
    ]),
  );
}

function parseXmlStatement(text: string): OfxStatementShape {
  if (OFX_UNSUPPORTED_MESSAGE_SET.test(text)) {
    fileImportFailure(
      "UNSUPPORTED_FORMAT",
      "OFX investment, loan, bill-pay, wire, and tax message sets are unsupported.",
    );
  }
  const parsed = parseBoundedXml(text, { arrayTags: new Set(["STMTTRN"]) });
  const ofx = childObject(parsed, "OFX", "OFX root");
  const banking = ofx.BANKMSGSRSV1;
  const credit = ofx.CREDITCARDMSGSRSV1;
  if ((banking === undefined) === (credit === undefined)) {
    fileImportFailure(
      "MALFORMED_FILE",
      "OFX must contain exactly one banking or credit-card statement.",
    );
  }
  const creditCard = credit !== undefined;
  const message = objectValue(
    creditCard ? credit : banking,
    "OFX statement message set",
  );
  const response = childObject(
    message,
    creditCard ? "CCSTMTTRNRS" : "STMTTRNRS",
    "OFX statement response",
  );
  const statement = childObject(
    response,
    creditCard ? "CCSTMTRS" : "STMTRS",
    "OFX statement",
  );
  const account = childObject(
    statement,
    creditCard ? "CCACCTFROM" : "BANKACCTFROM",
    "OFX statement account",
  );
  const accountId = stringValue(account.ACCTID, "OFX ACCTID", {
    required: true,
  })!;
  const currency = stringValue(statement.CURDEF, "OFX CURDEF", {
    required: true,
  })!;
  const transactionList = childObject(
    statement,
    "BANKTRANLIST",
    "OFX BANKTRANLIST",
  );
  const transactions = arrayValue(transactionList.STMTTRN).map((row) => {
    const value = objectValue(row, "OFX STMTTRN");
    const fields = xmlFields(value);
    return { fields, rawHashSource: JSON.stringify(fields) };
  });
  const rawBalance = statement.LEDGERBAL;
  let ledgerBalance: OfxStatementShape["ledgerBalance"] = null;
  if (rawBalance !== undefined) {
    const balance = objectValue(rawBalance, "OFX LEDGERBAL");
    ledgerBalance = {
      amount: stringValue(balance.BALAMT, "OFX BALAMT", { required: true })!,
      asOf: stringValue(balance.DTASOF, "OFX DTASOF", { required: true })!,
    };
  }
  return {
    currency,
    bankId: creditCard ? null : stringValue(account.BANKID, "OFX BANKID"),
    accountId,
    accountType: creditCard
      ? null
      : stringValue(account.ACCTTYPE, "OFX ACCTTYPE"),
    creditCard,
    fromDate: stringValue(transactionList.DTSTART, "OFX DTSTART"),
    toDate: stringValue(transactionList.DTEND, "OFX DTEND"),
    transactions,
    ledgerBalance,
  };
}

export function parseOfxSourceDate(
  value: string,
  timezone: string,
): ParsedSourceDate {
  const text = value.trim();
  const match =
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?)?(?:\[([+-]?\d{1,2}(?:\.\d+)?)(?::[^\]]*)?\])?$/.exec(
      text,
    );
  if (!match) {
    fileImportFailure("INVALID_DATE", "OFX date is invalid.");
  }
  const [, year, month, day, hour, minute, second, fraction, offsetText] =
    match;
  const localDate = `${year}-${month}-${day}`;
  const validator = new Date(`${localDate}T00:00:00.000Z`);
  if (
    Number.isNaN(validator.getTime()) ||
    validator.toISOString().slice(0, 10) !== localDate
  ) {
    fileImportFailure("INVALID_DATE", "OFX date is not a real date.");
  }
  if (hour === undefined) {
    if (offsetText !== undefined) {
      fileImportFailure("INVALID_DATE", "OFX date-only value has an offset.");
    }
    return {
      occurredAt: localDateTimeToUtc(`${localDate}T12:00:00.000`, timezone),
      originalDateText: text,
      localDate,
      precision: "day",
    };
  }
  const millisecond = (fraction ?? "").padEnd(3, "0") || "000";
  const localTimestamp = `${localDate}T${hour}:${minute}:${second}.${millisecond}`;
  const localValidator = new Date(`${localTimestamp}Z`);
  if (
    Number.isNaN(localValidator.getTime()) ||
    localValidator.toISOString().replace(/Z$/, "") !== localTimestamp
  ) {
    fileImportFailure("INVALID_DATE", "OFX timestamp is not valid.");
  }
  let occurredAt: string;
  if (offsetText === undefined) {
    occurredAt = localDateTimeToUtc(localTimestamp, timezone);
  } else {
    const offsetHours = Number(offsetText);
    if (!Number.isFinite(offsetHours) || Math.abs(offsetHours) > 24) {
      fileImportFailure("INVALID_DATE", "OFX timezone offset is invalid.");
    }
    occurredAt = new Date(
      localValidator.getTime() - offsetHours * 60 * 60 * 1000,
    ).toISOString();
  }
  return {
    occurredAt,
    originalDateText: text,
    localDate,
    precision: "timestamp",
  };
}

function accountIdentity(statement: OfxStatementShape): {
  fingerprint: string;
  last4: string;
} {
  const normalizedAccount = statement.accountId
    .replace(/\s+/g, "")
    .toUpperCase();
  if (normalizedAccount.length === 0) {
    fileImportFailure("MALFORMED_FILE", "OFX account id is invalid.");
  }
  const identity = statement.creditCard
    ? `credit|${normalizedAccount}`
    : `bank|${statement.bankId?.replace(/\s+/g, "").toUpperCase() ?? ""}|${normalizedAccount}|${statement.accountType?.toUpperCase() ?? ""}`;
  return {
    fingerprint: sha256Hex(identity),
    last4: normalizedAccount.slice(-4),
  };
}

function closingBalance(
  statement: OfxStatementShape,
  input: ParseOfxStatementInput,
): ParsedStatementBalance | null {
  if (statement.ledgerBalance === null) return null;
  const date = parseOfxSourceDate(
    statement.ledgerBalance.asOf,
    input.config.timezoneForDateOnly,
  );
  const amount = exactPlainAmount(
    statement.ledgerBalance.amount,
    input.targetScale,
    { allowZero: true },
  );
  return {
    kind: "closing_ledger",
    asOf: date.occurredAt,
    originalDateText: date.originalDateText,
    datePrecision: date.precision,
    currencyCode: statement.currency.trim().toUpperCase(),
    rawSignedAmountText: amount.amountText,
    signedAtomic: amount.atomic,
  };
}

export function parseOfxStatement(
  input: ParseOfxStatementInput,
): ParsedFileResult {
  const text = statementDecoder(input.bytes);
  const headerVersion = /^VERSION:\s*(\d+)/im.exec(text)?.[1] ?? null;
  const declaredXml =
    /^\s*<\?xml/i.test(text) || headerVersion?.startsWith("2");
  let statement: OfxStatementShape;
  try {
    statement = declaredXml
      ? parseXmlStatement(text)
      : parseSgmlStatement(text);
  } catch (error) {
    if (error instanceof FileImportError) throw error;
    fileImportFailure("MALFORMED_FILE", "OFX statement is malformed.");
  }
  assertFileImportRowCount(statement.transactions.length);
  if (statement.transactions.length === 0) {
    fileImportFailure("MALFORMED_FILE", "OFX statement has no transactions.");
  }
  const expectedCurrency = input.expectedCurrency.trim().toUpperCase();
  const currency = statement.currency.trim().toUpperCase();
  if (currency !== expectedCurrency) {
    fileImportFailure(
      "CURRENCY_MISMATCH",
      "OFX CURDEF does not match the target account currency.",
    );
  }
  const identity = accountIdentity(statement);
  const weakOrdinals = new Map<string, number>();
  const localDates: string[] = [];
  const transactions: ParsedFileTransaction[] = statement.transactions.map(
    ({ fields, rawHashSource }, rowIndex) => {
      const dateText = fields.DTPOSTED;
      const amountText = fields.TRNAMT;
      if (dateText === null || amountText === null) {
        fileImportFailure(
          "MALFORMED_FILE",
          `OFX transaction ${rowIndex + 1} requires DTPOSTED and TRNAMT.`,
        );
      }
      const sourceDate = parseOfxSourceDate(
        dateText,
        input.config.timezoneForDateOnly,
      );
      localDates.push(sourceDate.localDate);
      const amount = exactPlainAmount(amountText, input.targetScale);
      const payee = fields.NAME ?? null;
      const memo = fields.MEMO ?? null;
      const fitid = boundedOpaqueText(fields.FITID, "OFX FITID");
      const sourceExternalId =
        fitid === null
          ? weakSourceExternalId({
              prefix: "ofx",
              identityNamespace: input.identityNamespace,
              localSourceDate: sourceDate.localDate,
              signedAmountAtomic: amount.atomic,
              payee,
              memo,
              ordinals: weakOrdinals,
            })
          : `ofx:fitid:${fitid}`;
      return {
        sourceExternalId,
        identityStrength: fitid === null ? "weak" : "strong",
        sourceIdKind: fitid === null ? "weak_signature" : "fitid",
        occurredAt: sourceDate.occurredAt,
        originalDateText: sourceDate.originalDateText,
        datePrecision: sourceDate.precision,
        rawSignedAmountText: amount.amountText,
        signedAtomic: amount.atomic,
        currencyCode: currency,
        payee,
        memo,
        rawSelectedFields: {
          fitid,
          transactionType: fields.TRNTYPE ?? null,
          date: sourceDate.originalDateText,
          amount: amount.amountText,
          payee,
          memo,
          checkNumber: fields.CHECKNUM ?? null,
          referenceNumber: fields.REFNUM ?? null,
          sic: fields.SIC ?? null,
          currency,
        },
        rawRowSha256: sha256Hex(rawHashSource),
        unsupportedReason: null,
      };
    },
  );
  const sortedDates = localDates.toSorted();
  return {
    parsed: {
      format: input.format,
      fileSha256: sha256Hex(input.bytes),
      sanitizedFilename: sanitizeStatementFilename(input.filename),
      statementIdentity: {
        accountFingerprint: identity.fingerprint,
        accountLast4: identity.last4,
        currencyCode: currency,
      },
      statementFromDate:
        statement.fromDate === null
          ? (sortedDates[0] ?? null)
          : parseOfxSourceDate(
              statement.fromDate,
              input.config.timezoneForDateOnly,
            ).originalDateText,
      statementToDate:
        statement.toDate === null
          ? (sortedDates.at(-1) ?? null)
          : parseOfxSourceDate(
              statement.toDate,
              input.config.timezoneForDateOnly,
            ).originalDateText,
      transactions,
      closingBalance: closingBalance(statement, input),
    },
    warnings: [],
  };
}
