import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_FILE_IMPORT_BYTES,
  type CsvImportConfig,
  type StructuredImportConfig,
} from "../../../domain/file-import";
import {
  assertFileImportRowCount,
  parseCamt053Statement,
  parseCsvStatement,
  parseOfxStatement,
  sanitizeStatementFilename,
  sniffFinancialFileFormat,
} from "../../../providers/file-import";
import { FileImportError } from "../../../providers/file-import/errors";

const FIXTURES = join(process.cwd(), "docs/v5-financial-file-import/fixtures");

const CSV_CONFIG: CsvImportConfig = {
  hasHeader: true,
  encoding: "utf-8",
  delimiter: ",",
  dateColumn: "Date",
  dateFormat: "YYYY-MM-DD",
  timeColumn: null,
  timeFormat: null,
  amountMode: { kind: "signed", amountColumn: "Amount" },
  decimalSeparator: ".",
  thousandsSeparator: null,
  invertSign: false,
  idColumn: "ID",
  payeeColumn: "Payee",
  memoColumn: "Memo",
  currencyColumn: "Currency",
  timezone: "Asia/Shanghai",
};

const STRUCTURED_CONFIG: StructuredImportConfig = {
  timezoneForDateOnly: "America/New_York",
};

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function fixture(name: string): Uint8Array {
  return readFileSync(join(FIXTURES, name));
}

function jsonWithAtomicText(value: unknown): string {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
}

describe("financial file parser framework", () => {
  it("sniffs content and sanitizes hostile filenames without using them as paths", () => {
    expect(sniffFinancialFileFormat(fixture("sample_bank.csv"))).toBe("csv");
    expect(sniffFinancialFileFormat(fixture("sample_bank_ofx1.ofx"))).toBe(
      "ofx",
    );
    expect(sniffFinancialFileFormat(fixture("sample_camt053.xml"))).toBe(
      "camt053",
    );
    expect(sanitizeStatementFilename("../../bank\u0000.csv")).toBe("bank.csv");
  });

  it("enforces file and row bounds before persistence", () => {
    expect(() =>
      sniffFinancialFileFormat(new Uint8Array(MAX_FILE_IMPORT_BYTES + 1)),
    ).toThrowError(FileImportError);
    expect(() => assertFileImportRowCount(100_001)).toThrowError(
      FileImportError,
    );
  });
});

describe("CSV statement parser", () => {
  it("keeps exact amounts and distinct weak occurrence ordinals", () => {
    const result = parseCsvStatement({
      bytes: fixture("sample_bank.csv"),
      filename: "sample_bank.csv",
      config: CSV_CONFIG,
      targetScale: 2,
      expectedCurrency: "CNY",
      identityNamespace: "profile-cny",
    }).parsed;

    expect(result.transactions).toHaveLength(4);
    expect(result.transactions.map((row) => row.signedAtomic)).toEqual([
      -3500n,
      2_000_000n,
      -12_050n,
      -12_050n,
    ]);
    expect(
      result.transactions.slice(0, 2).map((row) => row.sourceIdKind),
    ).toEqual(["csv_id", "csv_id"]);
    expect(result.transactions[2]!.sourceExternalId).not.toBe(
      result.transactions[3]!.sourceExternalId,
    );
    expect(result.transactions[2]!.sourceExternalId).toMatch(/:1$/);
    expect(result.transactions[3]!.sourceExternalId).toMatch(/:2$/);
    expect(result.transactions[0]!.occurredAt).toBe("2026-08-10T04:00:00.000Z");
    expect(result.transactions[0]!.datePrecision).toBe("day");
  });

  it("normalizes weak amount identity to exact atomic units", () => {
    const parse = (amount: string) =>
      parseCsvStatement({
        bytes: bytes(
          `Date,Amount,Payee,Memo,Currency\n2026-08-10,${amount},Cafe,Same,CNY\n`,
        ),
        filename: "weak.csv",
        config: { ...CSV_CONFIG, idColumn: null },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "same-profile",
      }).parsed.transactions[0]!.sourceExternalId;
    expect(parse("-1.0")).toBe(parse("-1.00"));
  });

  it("preserves opaque strong IDs instead of collapsing issuer identities", () => {
    const result = parseCsvStatement({
      bytes: bytes(
        [
          "Date,Amount,ID,Currency",
          '2026-08-10,-1.00,"id  1",CNY',
          '2026-08-11,-2.00,"id 1",CNY',
          "2026-08-12,-3.00,Ａ,CNY",
          "2026-08-13,-4.00,A,CNY",
        ].join("\n"),
      ),
      filename: "opaque-ids.csv",
      config: {
        ...CSV_CONFIG,
        payeeColumn: null,
        memoColumn: null,
      },
      targetScale: 2,
      expectedCurrency: "CNY",
      identityNamespace: "opaque-ids",
    }).parsed;
    expect(result.transactions.map((row) => row.sourceExternalId)).toEqual([
      "csv:id:id  1",
      "csv:id:id 1",
      "csv:id:Ａ",
      "csv:id:A",
    ]);
  });

  it("supports explicit localized debit and credit columns without rounding", () => {
    const text = [
      "Date;Debit;Credit;Currency",
      "14.08.2026;1.234,50;;EUR",
      "15.08.2026;;2.000,00;EUR",
    ].join("\n");
    const result = parseCsvStatement({
      bytes: bytes(text),
      filename: "localized.csv",
      config: {
        ...CSV_CONFIG,
        delimiter: ";",
        dateFormat: "DD.MM.YYYY",
        amountMode: {
          kind: "debit_credit",
          debitColumn: "Debit",
          creditColumn: "Credit",
        },
        decimalSeparator: ",",
        thousandsSeparator: ".",
        idColumn: null,
        payeeColumn: null,
        memoColumn: null,
      },
      targetScale: 2,
      expectedCurrency: "EUR",
      identityNamespace: "profile-eur",
    }).parsed;
    expect(result.transactions.map((row) => row.signedAtomic)).toEqual([
      -123_450n,
      200_000n,
    ]);
  });

  it("supports UTF-8 BOM, tab delimiter, every strict date format, and optional time", () => {
    const examples: Array<[CsvImportConfig["dateFormat"], string]> = [
      ["YYYY-MM-DD", "2026-08-14"],
      ["YYYY/MM/DD", "2026/08/14"],
      ["YYYYMMDD", "20260814"],
      ["DD/MM/YYYY", "14/08/2026"],
      ["MM/DD/YYYY", "08/14/2026"],
      ["DD.MM.YYYY", "14.08.2026"],
    ];
    for (const [dateFormat, sourceDate] of examples) {
      const result = parseCsvStatement({
        bytes: bytes(
          `\uFEFFDate\tTime\tAmount\tCurrency\n${sourceDate}\t09:30\t-1.25\tCNY\n`,
        ),
        filename: "strict-dates.tsv",
        config: {
          ...CSV_CONFIG,
          delimiter: "\t",
          dateFormat,
          timeColumn: "Time",
          timeFormat: "HH:mm",
          idColumn: null,
          payeeColumn: null,
          memoColumn: null,
        },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: `date-${dateFormat}`,
      }).parsed.transactions[0]!;
      expect(result.datePrecision).toBe("timestamp");
      expect(result.occurredAt).toBe("2026-08-14T01:30:00.000Z");
      expect(result.signedAtomic).toBe(-125n);
    }
  });

  it("strictly decodes Windows-1252 and GB18030", () => {
    const windows = Buffer.concat([
      Buffer.from("Date,Amount,Payee,Currency\n2026-08-14,-1.00,Caf", "ascii"),
      Buffer.from([0xe9]),
      Buffer.from(",EUR\n", "ascii"),
    ]);
    const gb18030 = Buffer.concat([
      Buffer.from("Date,Amount,Payee,Currency\n2026-08-14,-1.00,", "ascii"),
      Buffer.from([0xbf, 0xa7, 0xb7, 0xc8]),
      Buffer.from(",CNY\n", "ascii"),
    ]);
    const config = {
      ...CSV_CONFIG,
      idColumn: null,
      memoColumn: null,
    };
    expect(
      parseCsvStatement({
        bytes: windows,
        filename: "windows.csv",
        config: { ...config, encoding: "windows-1252" },
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "windows",
      }).parsed.transactions[0]!.payee,
    ).toBe("Café");
    expect(
      parseCsvStatement({
        bytes: gb18030,
        filename: "gb.csv",
        config: { ...config, encoding: "gb18030" },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "gb",
      }).parsed.transactions[0]!.payee,
    ).toBe("咖啡");
  });

  it("fails the whole preview on ambiguous amounts, excess precision, or currency mismatch", () => {
    const debitCredit = bytes(
      "Date,Debit,Credit,Currency\n2026-08-14,1.00,2.00,CNY\n",
    );
    expect(() =>
      parseCsvStatement({
        bytes: debitCredit,
        filename: "bad.csv",
        config: {
          ...CSV_CONFIG,
          amountMode: {
            kind: "debit_credit",
            debitColumn: "Debit",
            creditColumn: "Credit",
          },
          idColumn: null,
          payeeColumn: null,
          memoColumn: null,
        },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "bad",
      }),
    ).toThrowError(/exactly one debit or credit/);
    expect(() =>
      parseCsvStatement({
        bytes: bytes("Date,Amount,Currency\n2026-08-14,-1.001,CNY\n"),
        filename: "precision.csv",
        config: {
          ...CSV_CONFIG,
          idColumn: null,
          payeeColumn: null,
          memoColumn: null,
        },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "precision",
      }),
    ).toThrowError(/precision/);
    expect(() =>
      parseCsvStatement({
        bytes: bytes("Date,Amount,Currency\n2026-08-14,-1.00,USD\n"),
        filename: "currency.csv",
        config: {
          ...CSV_CONFIG,
          idColumn: null,
          payeeColumn: null,
          memoColumn: null,
        },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "currency",
      }),
    ).toThrowError(/currency/);
  });

  it("rejects malformed column counts and fields over 10k characters", () => {
    const config = {
      ...CSV_CONFIG,
      idColumn: null,
      memoColumn: null,
    };
    expect(() =>
      parseCsvStatement({
        bytes: bytes(
          "Date,Amount,Payee,Currency\n2026-08-14,-1.00,Cafe,CNY,extra\n",
        ),
        filename: "malformed.csv",
        config,
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "malformed",
      }),
    ).toThrowError(/malformed/);
    expect(() =>
      parseCsvStatement({
        bytes: bytes(
          `Date,Amount,Payee,Currency\n2026-08-14,-1.00,${"x".repeat(10_001)},CNY\n`,
        ),
        filename: "too-long.csv",
        config,
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "too-long",
      }),
    ).toThrowError(/10000 character limit/);
    expect(() =>
      parseCsvStatement({
        bytes: bytes(
          `Date,Amount,Payee,Currency\n2026-08-14,-1.00,${"ﷺ".repeat(10_000)},CNY\n`,
        ),
        filename: "normalization-expansion.csv",
        config,
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "normalization-expansion",
      }),
    ).toThrowError(/after normalization/);
    expect(() =>
      parseCsvStatement({
        bytes: bytes("Date,Amount,Currency\n2026-08-14,-1.00,CNY\n"),
        filename: "prototype-column.csv",
        config: {
          ...config,
          dateColumn: "toString",
          payeeColumn: null,
        },
        targetScale: 2,
        expectedCurrency: "CNY",
        identityNamespace: "prototype-column",
      }),
    ).toThrowError(/column toString is missing/);
  });
});

describe("OFX and QFX statement parser", () => {
  it("parses OFX 1 SGML and OFX 2 XML with strong FITID identity", () => {
    const ofx1 = parseOfxStatement({
      bytes: fixture("sample_bank_ofx1.ofx"),
      filename: "bank.ofx",
      format: "ofx",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "USD",
      identityNamespace: "ofx-usd",
    }).parsed;
    const ofx2 = parseOfxStatement({
      bytes: fixture("sample_bank_ofx2.xml"),
      filename: "bank.qfx",
      format: "qfx",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "USD",
      identityNamespace: "ofx-usd",
    }).parsed;

    expect(ofx1.transactions.map((row) => row.sourceExternalId)).toEqual([
      "ofx:fitid:OFX-1001",
      "ofx:fitid:OFX-1002",
    ]);
    expect(ofx1.transactions.map((row) => row.signedAtomic)).toEqual([
      -3500n,
      150_025n,
    ]);
    expect(ofx1.statementIdentity.accountLast4).toBe("6789");
    expect(ofx1.statementIdentity.accountFingerprint).toBe(
      ofx2.statementIdentity.accountFingerprint,
    );
    expect(ofx1.closingBalance?.signedAtomic).toBe(146_525n);
    expect(ofx2.closingBalance?.signedAtomic).toBe(142_525n);
    expect(jsonWithAtomicText(ofx1)).not.toContain("123456789");
  });

  it("supports the credit-card subset and treats qfx as the OFX parser", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
      <CURDEF>USD</CURDEF><CCACCTFROM><ACCTID>999900001234</ACCTID></CCACCTFROM>
      <BANKTRANLIST><STMTTRN><DTPOSTED>20260814</DTPOSTED><TRNAMT>-9.99</TRNAMT><FITID>CC-1</FITID></STMTTRN></BANKTRANLIST>
      </CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const result = parseOfxStatement({
      bytes: bytes(xml),
      filename: "card.qfx",
      format: "qfx",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "USD",
      identityNamespace: "card",
    }).parsed;
    expect(result.format).toBe("qfx");
    expect(result.statementIdentity.accountLast4).toBe("1234");
    expect(result.transactions[0]!.signedAtomic).toBe(-999n);
  });

  it("rejects DTD/ENTITY, unsupported message sets, and CURDEF mismatch", () => {
    const dtd = bytes(
      `<?xml version="1.0"?><!DOCTYPE OFX [<!ENTITY x "boom">]><OFX/>`,
    );
    expect(() =>
      parseOfxStatement({
        bytes: dtd,
        filename: "evil.ofx",
        format: "ofx",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "USD",
        identityNamespace: "evil",
      }),
    ).toThrowError(/DTD or ENTITY/);
    expect(() =>
      parseOfxStatement({
        bytes: bytes("<OFX><INVSTMTMSGSRSV1></INVSTMTMSGSRSV1></OFX>"),
        filename: "investment.ofx",
        format: "ofx",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "USD",
        identityNamespace: "investment",
      }),
    ).toThrowError(/unsupported/);
    expect(() =>
      parseOfxStatement({
        bytes: fixture("sample_bank_ofx2.xml"),
        filename: "wrong.ofx",
        format: "ofx",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "wrong",
      }),
    ).toThrowError(/CURDEF/);
    const malformed = new TextDecoder()
      .decode(fixture("sample_bank_ofx2.xml"))
      .replace("</STMTTRN>", "</Bogus>");
    expect(() =>
      parseOfxStatement({
        bytes: bytes(malformed),
        filename: "malformed.ofx",
        format: "ofx",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "USD",
        identityNamespace: "malformed-ofx",
      }),
    ).toThrowError(/malformed/);
  });
});

describe("camt.053 statement parser", () => {
  it("parses exact signs, safe references, masked identity, and CLBD", () => {
    const result = parseCamt053Statement({
      bytes: fixture("sample_camt053.xml"),
      filename: "camt053.xml",
      config: { timezoneForDateOnly: "Europe/Berlin" },
      targetScale: 2,
      expectedCurrency: "EUR",
      identityNamespace: "camt-eur",
    }).parsed;

    expect(result.transactions.map((row) => row.signedAtomic)).toEqual([
      -4250n,
      120_000n,
    ]);
    expect(result.transactions.map((row) => row.sourceExternalId)).toEqual([
      "camt:acct-svcr-ref:ASR-3001",
      "camt:acct-svcr-ref:ASR-3002",
    ]);
    expect(result.statementIdentity.accountLast4).toBe("3000");
    expect(result.closingBalance?.signedAtomic).toBe(515_750n);
    expect(jsonWithAtomicText(result)).not.toContain("DE89370400440532013000");
  });

  it("accepts the frozen namespace range and rejects future namespaces", () => {
    const original = new TextDecoder().decode(fixture("sample_camt053.xml"));
    for (const version of ["02", "08", "13", "14"]) {
      const result = parseCamt053Statement({
        bytes: bytes(original.replace('.14"', `.${version}\"`)),
        filename: `camt-${version}.xml`,
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: `camt-${version}`,
      });
      expect(result.parsed.transactions).toHaveLength(2);
    }
    const namespace = "urn:iso:std:iso:20022:tech:xsd:camt.053.001.14";
    const mixedPrefix = original
      .replace(
        `<Document xmlns="${namespace}">`,
        `<c:Document xmlns:c="${namespace}" xmlns="${namespace}">`,
      )
      .replace("</Document>", "</c:Document>");
    expect(
      parseCamt053Statement({
        bytes: bytes(mixedPrefix),
        filename: "mixed-prefix.xml",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "mixed-prefix",
      }).parsed.transactions,
    ).toHaveLength(2);
    expect(() =>
      parseCamt053Statement({
        bytes: bytes(original.replace('.14"', '.15"')),
        filename: "future.xml",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "future",
      }),
    ).toThrowError(/01 through camt\.053\.001\.14/);
  });

  it("marks unsafe aggregate entries unsupported and never heuristic-splits them", () => {
    const original = new TextDecoder().decode(fixture("sample_camt053.xml"));
    const secondDetails = "<TxDtls><Refs><TxId>TX-EXTRA</TxId></Refs></TxDtls>";
    const aggregate = original.replace(
      "</TxDtls></NtryDtls>",
      `</TxDtls>${secondDetails}</NtryDtls>`,
    );
    const result = parseCamt053Statement({
      bytes: bytes(aggregate),
      filename: "aggregate.xml",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "EUR",
      identityNamespace: "aggregate",
    }).parsed;
    expect(result.transactions[0]!.unsupportedReason).toMatch(/safely split/);
    expect(result.transactions).toHaveLength(2);

    const siblingAggregate = original.replace(
      "</NtryDtls>",
      `</NtryDtls><NtryDtls>${secondDetails}</NtryDtls>`,
    );
    const siblingResult = parseCamt053Statement({
      bytes: bytes(siblingAggregate),
      filename: "sibling-aggregate.xml",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "EUR",
      identityNamespace: "sibling-aggregate",
    }).parsed;
    expect(siblingResult.transactions[0]!.unsupportedReason).toMatch(
      /safely split/,
    );
  });

  it("uses timestamp precision and falls back to weak identity for NOTPROVIDED refs", () => {
    const original = new TextDecoder().decode(fixture("sample_camt053.xml"));
    const changed = original
      .replace(
        "<BookgDt><Dt>2026-08-10</Dt></BookgDt>",
        "<BookgDt><DtTm>2026-08-10T09:15:00+02:00</DtTm></BookgDt>",
      )
      .replace("NTRY-3001", "NOTPROVIDED")
      .replace("ASR-3001", "NOTPROVIDED")
      .replace("TX-3001", "NOTPROVIDED");
    const first = parseCamt053Statement({
      bytes: bytes(changed),
      filename: "weak-timestamp.xml",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "EUR",
      identityNamespace: "weak-timestamp",
    }).parsed.transactions[0]!;
    expect(first.datePrecision).toBe("timestamp");
    expect(first.occurredAt).toBe("2026-08-10T07:15:00.000Z");
    expect(first.identityStrength).toBe("weak");
    expect(first.sourceIdKind).toBe("weak_signature");
  });

  it("rejects DTD/ENTITY and mixed currency before persistence", () => {
    const original = new TextDecoder().decode(fixture("sample_camt053.xml"));
    expect(() =>
      parseCamt053Statement({
        bytes: bytes(`<!ENTITY x "boom">${original}`),
        filename: "evil.xml",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "evil",
      }),
    ).toThrowError(/DTD or ENTITY/);
    expect(() =>
      parseCamt053Statement({
        bytes: bytes(original.replace('Ccy="EUR">42.50', 'Ccy="USD">42.50')),
        filename: "mixed.xml",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "mixed",
      }),
    ).toThrowError(/currency/);
  });

  it("rejects malformed XML, namespace confusion, and impossible offset dates", () => {
    const original = new TextDecoder().decode(fixture("sample_camt053.xml"));
    const cases = [
      original.replace("</Ntry>", "</Bogus>"),
      original.replace(
        'xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.14"',
        'xmlns:x="urn:iso:std:iso:20022:tech:xsd:camt.053.001.14" xmlns="urn:evil"',
      ),
      original.replace(
        '<Amt Ccy="EUR">42.50</Amt>',
        '<e:Amt xmlns:e="urn:evil" Ccy="EUR">42.50</e:Amt>',
      ),
      original.replace(
        "<BookgDt><Dt>2026-08-10</Dt></BookgDt>",
        "<BookgDt><DtTm>2026-02-31T10:00:00Z</DtTm></BookgDt>",
      ),
      original.replace(
        '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.14">',
        '<!-- decoy <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.14"> --><Document xmlns="urn:evil">',
      ),
      original.replace("ASR-3001", "&#x110000;"),
      original.replace("ASR-3001", "&#0;"),
    ];
    for (const [index, hostile] of cases.entries()) {
      expect(() =>
        parseCamt053Statement({
          bytes: bytes(hostile),
          filename: `hostile-${index}.xml`,
          config: STRUCTURED_CONFIG,
          targetScale: 2,
          expectedCurrency: "EUR",
          identityNamespace: `hostile-${index}`,
        }),
      ).toThrowError(FileImportError);
    }
  });

  it("decodes standard XML entities while keeping strong references opaque", () => {
    const original = new TextDecoder().decode(fixture("sample_camt053.xml"));
    const parse = (encodedReference: string) =>
      parseCamt053Statement({
        bytes: bytes(
          original
            .replace("ASR-3001", encodedReference)
            .replace("Coffee Shop", "A &amp; B"),
        ),
        filename: "entities.xml",
        config: STRUCTURED_CONFIG,
        targetScale: 2,
        expectedCurrency: "EUR",
        identityNamespace: "entities",
      }).parsed.transactions[0]!;
    const named = parse("R&amp;1");
    const numeric = parse("R&#38;1");
    expect(named.sourceExternalId).toBe("camt:acct-svcr-ref:R&1");
    expect(numeric.sourceExternalId).toBe(named.sourceExternalId);
    expect(named.payee).toBe("A & B");

    const cdata = parseCamt053Statement({
      bytes: bytes(
        original.replace("Breakfast", "<![CDATA[Breakfast <e:Foo>]]>"),
      ),
      filename: "cdata.xml",
      config: STRUCTURED_CONFIG,
      targetScale: 2,
      expectedCurrency: "EUR",
      identityNamespace: "cdata",
    }).parsed.transactions[0]!;
    expect(cdata.memo).toBe("Breakfast <e:Foo>");
  });
});
