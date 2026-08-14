import {
  type ParsedFileResult,
  type ParsedFileTransaction,
  type ParsedStatementBalance,
  type StructuredImportConfig,
} from "../../domain/file-import";
import { localDateTimeToUtc } from "../../domain/time";
import {
  arrayValue,
  assertFileImportRowCount,
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
import { fileImportFailure } from "./errors";

export interface ParseCamt053StatementInput {
  bytes: Uint8Array;
  filename: string;
  config: StructuredImportConfig;
  targetScale: number;
  expectedCurrency: string;
  identityNamespace: string;
}

const CAMT_NAMESPACE_PATTERN =
  /^urn:iso:std:iso:20022:tech:xsd:camt\.053\.001\.(0[1-9]|1[0-4])$/;

function camtNamespace(text: string): string {
  const namespaced = parseBoundedXml(text);
  const rootNames = Object.keys(namespaced).filter(
    (name) => !name.startsWith("@") && !name.startsWith("#"),
  );
  if (rootNames.length !== 1) {
    fileImportFailure("MALFORMED_FILE", "camt.053 root is invalid.");
  }
  const rootName = rootNames[0]!;
  const rootParts = rootName.split(":");
  if (rootParts.length > 2 || rootParts.at(-1) !== "Document") {
    fileImportFailure("UNSUPPORTED_FORMAT", "camt.053 Document is required.");
  }
  const rootPrefix = rootParts.length === 2 ? rootParts[0]! : "";
  const rootValue = objectValue(namespaced[rootName], "camt.053 Document");

  function scopedBindings(
    parent: ReadonlyMap<string, string>,
    value: unknown,
  ): Map<string, string> {
    const bindings = new Map(parent);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return bindings;
    }
    for (const [name, binding] of Object.entries(value)) {
      if (name === "@xmlns" && typeof binding === "string") {
        bindings.set("", binding);
      } else if (name.startsWith("@xmlns:") && typeof binding === "string") {
        bindings.set(name.slice("@xmlns:".length), binding);
      }
    }
    return bindings;
  }

  const rootBindings = scopedBindings(new Map(), rootValue);
  const namespace = rootBindings.get(rootPrefix);
  if (namespace === undefined) {
    fileImportFailure("UNSUPPORTED_FORMAT", "camt.053 namespace is required.");
  }
  if (!CAMT_NAMESPACE_PATTERN.test(namespace)) {
    fileImportFailure(
      "UNSUPPORTED_FORMAT",
      "Only camt.053.001.01 through camt.053.001.14 are supported.",
    );
  }

  function validateElement(
    qualifiedName: string,
    value: unknown,
    parentBindings: ReadonlyMap<string, string>,
  ): void {
    const instances = Array.isArray(value) ? value : [value];
    for (const instance of instances) {
      const bindings = scopedBindings(parentBindings, instance);
      const parts = qualifiedName.split(":");
      if (
        parts.length > 2 ||
        bindings.get(parts.length === 2 ? parts[0]! : "") !== namespace
      ) {
        fileImportFailure(
          "UNSUPPORTED_FORMAT",
          "Every camt.053 element must resolve to the Document namespace.",
        );
      }
      if (
        !instance ||
        typeof instance !== "object" ||
        Array.isArray(instance)
      ) {
        continue;
      }
      for (const [childName, childValue] of Object.entries(instance)) {
        if (childName.startsWith("@") || childName.startsWith("#")) continue;
        validateElement(childName, childValue, bindings);
      }
    }
  }

  validateElement(rootName, rootValue, new Map());
  return namespace;
}

function nestedObject(
  parent: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  let current = parent;
  for (const key of keys) {
    current = objectValue(current[key], field);
  }
  return current;
}

function optionalNestedString(
  parent: Record<string, unknown>,
  keys: readonly string[],
  field: string,
  options: { opaque?: boolean } = {},
): string | null {
  let current: unknown = parent;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return stringValue(current, field, options);
}

function assertRealCamtDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fileImportFailure("INVALID_DATE", `${field} date is invalid.`);
  }
  const validator = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(validator.getTime()) ||
    validator.toISOString().slice(0, 10) !== value
  ) {
    fileImportFailure("INVALID_DATE", `${field} date is not a real date.`);
  }
}

function normalizeLocalTimestamp(value: string): string {
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(
      value,
    );
  if (!match) {
    fileImportFailure("INVALID_DATE", "camt.053 timestamp is invalid.");
  }
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${(match[5] ?? "").padEnd(3, "0") || "000"}`;
}

function camtSourceDate(
  value: unknown,
  timezone: string,
  field: string,
): ParsedSourceDate {
  const dateChoice = objectValue(value, field);
  const dateTime = stringValue(dateChoice.DtTm, `${field} DtTm`);
  const date = stringValue(dateChoice.Dt, `${field} Dt`);
  if ((dateTime === null) === (date === null)) {
    fileImportFailure(
      "INVALID_DATE",
      `${field} must contain exactly one Dt or DtTm.`,
    );
  }
  if (date !== null) {
    assertRealCamtDate(date, field);
    return {
      occurredAt: localDateTimeToUtc(`${date}T12:00:00.000`, timezone),
      originalDateText: date,
      localDate: date,
      precision: "day",
    };
  }

  const source = dateTime!;
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(source);
  let occurredAt: string;
  if (hasOffset) {
    const match =
      /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.exec(
        source,
      );
    if (!match) {
      fileImportFailure("INVALID_DATE", `${field} timestamp is invalid.`);
    }
    assertRealCamtDate(match[1]!, field);
    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) {
      fileImportFailure("INVALID_DATE", `${field} timestamp is invalid.`);
    }
    occurredAt = parsed.toISOString();
  } else {
    occurredAt = localDateTimeToUtc(normalizeLocalTimestamp(source), timezone);
  }
  const localDate = source.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    fileImportFailure("INVALID_DATE", `${field} timestamp is invalid.`);
  }
  return {
    occurredAt,
    originalDateText: source,
    localDate,
    precision: "timestamp",
  };
}

function xmlAmount(
  value: unknown,
  field: string,
): {
  amount: string;
  currency: string;
} {
  const object = objectValue(value, field);
  return {
    amount: stringValue(object["#text"], `${field} amount`, {
      required: true,
    })!,
    currency: stringValue(object["@Ccy"], `${field} currency`, {
      required: true,
    })!.toUpperCase(),
  };
}

function signedCamtAmount(input: {
  value: unknown;
  creditDebit: unknown;
  field: string;
  scale: number;
  expectedCurrency: string;
  allowZero?: boolean;
}): { amountText: string; atomic: bigint; currency: string } {
  const amount = xmlAmount(input.value, input.field);
  if (amount.currency !== input.expectedCurrency) {
    fileImportFailure(
      "CURRENCY_MISMATCH",
      `${input.field} currency does not match the target account.`,
    );
  }
  const parsed = exactPlainAmount(amount.amount, input.scale, {
    allowZero: input.allowZero,
  });
  if (parsed.atomic < 0n) {
    fileImportFailure(
      "INVALID_AMOUNT",
      `${input.field} must use CdtDbtInd instead of a signed Amt.`,
    );
  }
  const direction = stringValue(input.creditDebit, `${input.field} CdtDbtInd`, {
    required: true,
  });
  if (direction !== "CRDT" && direction !== "DBIT") {
    fileImportFailure(
      "MALFORMED_FILE",
      `${input.field} CdtDbtInd must be CRDT or DBIT.`,
    );
  }
  const atomic = direction === "DBIT" ? -parsed.atomic : parsed.atomic;
  return {
    amountText: `${atomic < 0n ? "-" : ""}${parsed.amountText}`,
    atomic,
    currency: amount.currency,
  };
}

function safeReference(value: unknown, field: string): string | null {
  const reference =
    typeof value === "string"
      ? boundedOpaqueText(value, field)
      : stringValue(value, field, { opaque: true });
  return reference !== null && reference.toUpperCase() !== "NOTPROVIDED"
    ? reference
    : null;
}

function relatedPartyName(
  details: Record<string, unknown>,
  direction: "CRDT" | "DBIT",
): string | null {
  const related = details.RltdPties;
  if (!related || typeof related !== "object" || Array.isArray(related)) {
    return null;
  }
  const role = direction === "DBIT" ? "Cdtr" : "Dbtr";
  const value = related as Record<string, unknown>;
  return (
    optionalNestedString(value, [role, "Pty", "Nm"], "camt.053 party") ??
    optionalNestedString(value, [role, "Nm"], "camt.053 party")
  );
}

function remittanceMemo(details: Record<string, unknown>): string | null {
  const remittance = details.RmtInf;
  if (
    !remittance ||
    typeof remittance !== "object" ||
    Array.isArray(remittance)
  ) {
    return null;
  }
  const values = arrayValue((remittance as Record<string, unknown>).Ustrd).map(
    (value, index) =>
      stringValue(value, `camt.053 remittance ${index + 1}`, {
        required: true,
      }),
  );
  return boundedText(values.join(" | "), "camt.053 remittance");
}

function entryIdentity(input: {
  entry: Record<string, unknown>;
  details: Record<string, unknown>[];
  weak: () => string;
}): {
  sourceExternalId: string;
  sourceIdKind: "acct_svcr_ref" | "tx_id" | "ntry_ref" | "weak_signature";
  identityStrength: "strong" | "weak";
} {
  const accountServicer = safeReference(
    input.entry.AcctSvcrRef,
    "camt.053 AcctSvcrRef",
  );
  if (accountServicer !== null) {
    return {
      sourceExternalId: `camt:acct-svcr-ref:${accountServicer}`,
      sourceIdKind: "acct_svcr_ref",
      identityStrength: "strong",
    };
  }
  if (input.details.length === 1) {
    const transactionId = safeReference(
      optionalNestedString(
        input.details[0]!,
        ["Refs", "TxId"],
        "camt.053 TxId",
        { opaque: true },
      ),
      "camt.053 TxId",
    );
    if (transactionId !== null) {
      return {
        sourceExternalId: `camt:tx-id:${transactionId}`,
        sourceIdKind: "tx_id",
        identityStrength: "strong",
      };
    }
  }
  const entryReference = safeReference(input.entry.NtryRef, "camt.053 NtryRef");
  if (entryReference !== null) {
    return {
      sourceExternalId: `camt:ntry-ref:${entryReference}`,
      sourceIdKind: "ntry_ref",
      identityStrength: "strong",
    };
  }
  return {
    sourceExternalId: input.weak(),
    sourceIdKind: "weak_signature",
    identityStrength: "weak",
  };
}

function closingBookedBalance(input: {
  balances: unknown[];
  config: StructuredImportConfig;
  targetScale: number;
  expectedCurrency: string;
  warnings: string[];
}): ParsedStatementBalance | null {
  const closing = input.balances
    .map((value) => objectValue(value, "camt.053 balance"))
    .filter(
      (value) =>
        optionalNestedString(
          value,
          ["Tp", "CdOrPrtry", "Cd"],
          "camt.053 balance code",
        ) === "CLBD",
    );
  if (closing.length === 0) return null;
  if (closing.length > 1) {
    input.warnings.push(
      "Multiple CLBD balances were present; no closing balance observation was created.",
    );
    return null;
  }
  const value = closing[0]!;
  const amount = signedCamtAmount({
    value: value.Amt,
    creditDebit: value.CdtDbtInd,
    field: "camt.053 CLBD",
    scale: input.targetScale,
    expectedCurrency: input.expectedCurrency,
    allowZero: true,
  });
  const date = camtSourceDate(
    value.Dt,
    input.config.timezoneForDateOnly,
    "camt.053 CLBD date",
  );
  return {
    kind: "closing_booked",
    asOf: date.occurredAt,
    originalDateText: date.originalDateText,
    datePrecision: date.precision,
    currencyCode: amount.currency,
    rawSignedAmountText: amount.amountText,
    signedAtomic: amount.atomic,
  };
}

export function parseCamt053Statement(
  input: ParseCamt053StatementInput,
): ParsedFileResult {
  const text = decodeStatement(input.bytes, "utf-8");
  camtNamespace(text);
  const parsed = parseBoundedXml(text, {
    removeNamespacePrefix: true,
    arrayTags: new Set(["Stmt", "Ntry", "TxDtls", "Bal", "Ustrd"]),
  });
  const document = objectValue(parsed.Document, "camt.053 Document");
  const message = objectValue(document.BkToCstmrStmt, "camt.053 BkToCstmrStmt");
  const statements = arrayValue(message.Stmt);
  if (statements.length !== 1) {
    fileImportFailure(
      "MALFORMED_FILE",
      "camt.053 import requires exactly one statement account.",
    );
  }
  const statement = objectValue(statements[0], "camt.053 Stmt");
  const account = nestedObject(statement, ["Acct"], "camt.053 account");
  const accountId = nestedObject(account, ["Id"], "camt.053 account id");
  const rawAccount =
    stringValue(accountId.IBAN, "camt.053 IBAN") ??
    optionalNestedString(
      accountId,
      ["Othr", "Id"],
      "camt.053 other account id",
    );
  if (rawAccount === null) {
    fileImportFailure("MALFORMED_FILE", "camt.053 account id is required.");
  }
  const normalizedAccount = rawAccount.replace(/\s+/g, "").toUpperCase();
  const expectedCurrency = input.expectedCurrency.trim().toUpperCase();
  const accountCurrency = stringValue(
    account.Ccy,
    "camt.053 account currency",
    {
      required: true,
    },
  )!.toUpperCase();
  if (accountCurrency !== expectedCurrency) {
    fileImportFailure(
      "CURRENCY_MISMATCH",
      "camt.053 account currency does not match the target account.",
    );
  }

  const entries = arrayValue(statement.Ntry);
  assertFileImportRowCount(entries.length);
  if (entries.length === 0) {
    fileImportFailure("MALFORMED_FILE", "camt.053 statement has no entries.");
  }
  const weakOrdinals = new Map<string, number>();
  const localDates: string[] = [];
  const transactions: ParsedFileTransaction[] = entries.map(
    (rawEntry, rowIndex) => {
      const entry = objectValue(rawEntry, `camt.053 entry ${rowIndex + 1}`);
      const direction = stringValue(entry.CdtDbtInd, "camt.053 CdtDbtInd", {
        required: true,
      });
      if (direction !== "CRDT" && direction !== "DBIT") {
        fileImportFailure(
          "MALFORMED_FILE",
          "camt.053 CdtDbtInd must be CRDT or DBIT.",
        );
      }
      const amount = signedCamtAmount({
        value: entry.Amt,
        creditDebit: direction,
        field: `camt.053 entry ${rowIndex + 1}`,
        scale: input.targetScale,
        expectedCurrency,
      });
      const sourceDate = camtSourceDate(
        entry.BookgDt,
        input.config.timezoneForDateOnly,
        "camt.053 booking date",
      );
      localDates.push(sourceDate.localDate);
      const entryDetails = arrayValue(entry.NtryDtls).flatMap(
        (value, detailsIndex) => {
          const details = objectValue(
            value,
            `camt.053 NtryDtls ${detailsIndex + 1}`,
          );
          return arrayValue(details.TxDtls).map((transaction) =>
            objectValue(transaction, "camt.053 TxDtls"),
          );
        },
      );
      assertFileImportRowCount(entryDetails.length);
      const singleDetails = entryDetails.length === 1 ? entryDetails[0]! : null;
      const payee =
        singleDetails === null
          ? null
          : relatedPartyName(singleDetails, direction);
      const memo =
        singleDetails === null ? null : remittanceMemo(singleDetails);
      const identity = entryIdentity({
        entry,
        details: entryDetails,
        weak: () =>
          weakSourceExternalId({
            prefix: "camt",
            identityNamespace: input.identityNamespace,
            localSourceDate: sourceDate.localDate,
            signedAmountAtomic: amount.atomic,
            payee,
            memo,
            ordinals: weakOrdinals,
          }),
      });
      const status =
        optionalNestedString(entry, ["Sts", "Cd"], "camt.053 status") ??
        stringValue(entry.Sts, "camt.053 status");
      const unsupportedReason =
        entryDetails.length > 1
          ? "Multiple TxDtls cannot be safely split into exact transactions."
          : status !== null && status !== "BOOK"
            ? `Entry status ${status} is not booked.`
            : null;
      const bankTransactionCode =
        entry.BkTxCd === undefined
          ? null
          : boundedText(JSON.stringify(entry.BkTxCd), "camt.053 bank code");
      const valueDate =
        entry.ValDt === undefined
          ? null
          : stringValue(
              objectValue(entry.ValDt, "camt.053 value date").Dt ??
                objectValue(entry.ValDt, "camt.053 value date").DtTm,
              "camt.053 value date",
            );
      const rawSelectedFields = {
        accountServicerReference: safeReference(
          entry.AcctSvcrRef,
          "camt.053 AcctSvcrRef",
        ),
        entryReference: safeReference(entry.NtryRef, "camt.053 NtryRef"),
        transactionId:
          singleDetails === null
            ? null
            : optionalNestedString(
                singleDetails,
                ["Refs", "TxId"],
                "camt.053 TxId",
                { opaque: true },
              ),
        endToEndId:
          singleDetails === null
            ? null
            : optionalNestedString(
                singleDetails,
                ["Refs", "EndToEndId"],
                "camt.053 EndToEndId",
                { opaque: true },
              ),
        date: sourceDate.originalDateText,
        valueDate,
        amount: amount.amountText,
        currency: amount.currency,
        payee,
        memo,
        bankTransactionCode,
        status,
      };
      return {
        sourceExternalId: identity.sourceExternalId,
        identityStrength: identity.identityStrength,
        sourceIdKind: identity.sourceIdKind,
        occurredAt: sourceDate.occurredAt,
        originalDateText: sourceDate.originalDateText,
        datePrecision: sourceDate.precision,
        rawSignedAmountText: amount.amountText,
        signedAtomic: amount.atomic,
        currencyCode: amount.currency,
        payee,
        memo,
        rawSelectedFields,
        rawRowSha256: sha256Hex(JSON.stringify(rawSelectedFields)),
        unsupportedReason,
      };
    },
  );

  const warnings: string[] = [];
  const period =
    statement.FrToDt &&
    typeof statement.FrToDt === "object" &&
    !Array.isArray(statement.FrToDt)
      ? (statement.FrToDt as Record<string, unknown>)
      : null;
  const sortedDates = localDates.toSorted();
  return {
    parsed: {
      format: "camt053",
      fileSha256: sha256Hex(input.bytes),
      sanitizedFilename: sanitizeStatementFilename(input.filename),
      statementIdentity: {
        accountFingerprint: sha256Hex(`camt053|${normalizedAccount}`),
        accountLast4: normalizedAccount.slice(-4),
        currencyCode: accountCurrency,
      },
      statementFromDate:
        (period
          ? stringValue(period.FrDtTm ?? period.FrDt, "camt.053 period start")
          : null) ??
        sortedDates[0] ??
        null,
      statementToDate:
        (period
          ? stringValue(period.ToDtTm ?? period.ToDt, "camt.053 period end")
          : null) ??
        sortedDates.at(-1) ??
        null,
      transactions,
      closingBalance: closingBookedBalance({
        balances: arrayValue(statement.Bal),
        config: input.config,
        targetScale: input.targetScale,
        expectedCurrency,
        warnings,
      }),
    },
    warnings,
  };
}

export { CAMT_NAMESPACE_PATTERN };
