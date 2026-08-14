import { createHash } from "node:crypto";

import { z } from "zod";

import {
  buildExchangeEntries,
  buildExpenseEntries,
  buildIncomeEntries,
  buildTransferEntries,
} from "./ledger";
import { normalizePositiveDecimalText } from "./price-decimal";
import {
  canonicalExternalJson,
  canonicalExternalDecimalText,
  externalDecimalToAtomic,
  validatedExternalDecimalText,
} from "./external-sync";
import {
  EVM_ALCHEMY_CREDENTIAL_REF,
  assertEvmChainNetwork,
  evmGasStableKey,
  evmMovementStableKey,
  evmNativeAssetKey,
  evmRawAtomicToDecimalText,
  evmWalletSourceKey,
  normalizeEvmAddress,
  normalizeEvmTxHash,
  parseEvmAssetKey,
} from "./evm";
import { assertIanaTimeZone, canonicalUtcInstantValue } from "./time";
import type { LedgerEntryDraft } from "./types";
import { MAX_FILE_IMPORT_TEXT_CHARS } from "./file-import";
import {
  assertFileImportCandidateProvenance,
  parseFileImportSourcePayloadJson,
} from "./file-import-provenance";
import {
  automationOperatorIsCompatible,
  possibleRuleDirections,
  type AutomationRule,
} from "./automation";
import {
  isGeneratedOccurrence,
  parsePositiveAtomicText,
  validateRecurringItem,
  type RecurringItem,
} from "./recurring";

export const BACKUP_FORMAT = "multi-asset-ledger-backup";
export const BACKUP_LEGACY_SCHEMA_VERSION = 1;
export const BACKUP_V2_SCHEMA_VERSION = 2;
export const BACKUP_V3_SCHEMA_VERSION = 3;
export const BACKUP_V4_SCHEMA_VERSION = 4;
export const BACKUP_V5_SCHEMA_VERSION = 5;
export const BACKUP_V6_SCHEMA_VERSION = 6;
export const BACKUP_SCHEMA_VERSION = 7;

export class BackupValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BackupValidationError";
  }
}

const id = z.string().trim().min(1).max(255);
const fileExternalIdentity = z
  .string()
  .min(1)
  .max(MAX_FILE_IMPORT_TEXT_CHARS + 64);
const nullableText = z.string().nullable();
const canonicalInstant = z.string().refine((value) => {
  try {
    canonicalUtcInstantValue(value);
    return true;
  } catch {
    return false;
  }
}, "Timestamp must use canonical UTC ISO format.");
const atomicText = z
  .string()
  .regex(/^-?\d+$/, "Atomic amount must be signed integer text.");
const jsonText = z.string().refine((value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}, "Setting valueJson must contain valid JSON.");
const optionalJsonText = z
  .string()
  .nullable()
  .refine((value) => {
    if (value === null) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }, "Provider metadata must contain valid JSON.");
const externalDecimalText = z.string().refine((value) => {
  try {
    validatedExternalDecimalText(value);
    return true;
  } catch {
    return false;
  }
}, "External amount must be plain decimal text.");
const sha256Text = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Fingerprint must be lowercase SHA-256 hex text.");

const bookSchema = z
  .object({
    id,
    name: z.string(),
    isDefault: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const assetSchema = z
  .object({
    id,
    code: z.string().trim().min(1).max(30),
    name: z.string(),
    symbol: nullableText,
    assetType: z.enum(["fiat", "crypto", "custom"]),
    scale: z.number().int().min(0).max(30),
    isArchived: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const accountSchema = z
  .object({
    id,
    bookId: id,
    assetId: id,
    name: z.string(),
    accountType: z.enum([
      "cash",
      "bank",
      "ewallet",
      "exchange",
      "crypto_wallet",
      "credit",
      "loan",
      "other",
    ]),
    institutionName: nullableText,
    note: nullableText,
    isArchived: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const categorySchema = z
  .object({
    id,
    bookId: id,
    parentId: id.nullable(),
    name: z.string(),
    categoryType: z.enum(["expense", "income", "both"]),
    isArchived: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const tagSchema = z
  .object({
    id,
    bookId: id,
    name: z.string(),
    isArchived: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const ledgerEventSchema = z
  .object({
    id,
    bookId: id,
    eventType: z.enum(["expense", "income", "transfer", "exchange"]),
    occurredAt: canonicalInstant,
    categoryId: id.nullable(),
    payee: nullableText,
    note: nullableText,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const ledgerEntrySchema = z
  .object({
    id,
    eventId: id,
    accountId: id,
    entryRole: z.enum(["main", "source", "destination", "fee"]),
    amountAtomic: atomicText,
    createdAt: canonicalInstant,
  })
  .strict();

const eventTagSchema = z.object({ eventId: id, tagId: id }).strict();

const snapshotSchema = z
  .object({
    id,
    accountId: id,
    asOf: canonicalInstant,
    balanceAtomic: atomicText,
    note: nullableText,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const settingSchema = z
  .object({ key: id, valueJson: jsonText, updatedAt: canonicalInstant })
  .strict();

const bookValuationSettingSchema = z
  .object({
    bookId: id,
    homeAssetId: id,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const priceProviderMappingSchema = z
  .object({
    assetId: id,
    provider: z.enum(["coingecko", "ecb"]),
    providerAssetKey: z.string().trim().min(1).max(128),
    isEnabled: z.boolean(),
    priority: z.number().int(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const positiveDecimalText = z.string().transform((value, context) => {
  try {
    return normalizePositiveDecimalText(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Rate must be positive plain decimal text.",
    });
    return z.NEVER;
  }
});

const manualPriceQuoteSchema = z
  .object({
    id,
    baseAssetId: id,
    quoteAssetId: id,
    rateText: positiveDecimalText,
    observedAt: canonicalInstant,
    note: nullableText,
    isActive: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const v3ExternalConnectionSchema = z
  .object({
    id,
    bookId: id,
    provider: z.literal("kraken"),
    name: z.string(),
    credentialRef: z
      .string()
      .refine(
        (value): boolean => value === "env:kraken.primary",
        "Only the opaque Kraken environment credential reference is allowed.",
      ),
    isEnabled: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const externalConnectionSchema = z.discriminatedUnion("provider", [
  z
    .object({
      id,
      bookId: id,
      provider: z.literal("kraken"),
      sourceKey: z
        .string()
        .refine((value): boolean => value === "kraken:primary"),
      name: z.string(),
      credentialRef: z
        .string()
        .refine((value): boolean => value === "env:kraken.primary"),
      isEnabled: z.boolean(),
      createdAt: canonicalInstant,
      updatedAt: canonicalInstant,
    })
    .strict(),
  z
    .object({
      id,
      bookId: id,
      provider: z.literal("evm_wallet"),
      sourceKey: id,
      name: z.string(),
      credentialRef: z
        .string()
        .refine((value): boolean => value === EVM_ALCHEMY_CREDENTIAL_REF),
      isEnabled: z.boolean(),
      createdAt: canonicalInstant,
      updatedAt: canonicalInstant,
    })
    .strict(),
]);

const v6ExternalConnectionSchema = z.discriminatedUnion("provider", [
  ...externalConnectionSchema.options,
  z
    .object({
      id,
      bookId: id,
      provider: z.literal("file_import"),
      sourceKey: id,
      name: z.string(),
      credentialRef: z.literal("local:file-import"),
      isEnabled: z.boolean(),
      createdAt: canonicalInstant,
      updatedAt: canonicalInstant,
    })
    .strict(),
]);

const externalAssetMappingSchema = z
  .object({
    connectionId: id,
    providerAssetKey: id,
    providerDisplayCode: nullableText,
    talliAssetId: id.nullable(),
    mappingStatus: z.enum(["mapped", "unmapped", "ignored"]),
    providerMetadataJson: optionalJsonText,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const externalAccountMappingSchema = z
  .object({
    connectionId: id,
    providerAssetKey: id,
    talliAccountId: id,
    isEnabled: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const externalBalanceObservationSchema = z
  .object({
    id,
    connectionId: id,
    providerAssetKey: id,
    talliAssetId: id.nullable(),
    providerAmountText: externalDecimalText,
    mappedAmountAtomic: atomicText.nullable(),
    precisionStatus: z.enum(["exact", "excess_precision", "unmapped"]),
    observedAt: canonicalInstant,
    payloadHash: sha256Text,
    createdAt: canonicalInstant,
  })
  .strict();

const v3ExternalSourceObjectSchema = z
  .object({
    id,
    connectionId: id,
    objectType: z.enum(["kraken_ledger", "kraken_trade"]),
    externalId: id,
    occurredAt: canonicalInstant,
    payloadJson: jsonText,
    payloadHash: sha256Text,
    firstSeenAt: canonicalInstant,
    lastSeenAt: canonicalInstant,
  })
  .strict();

const externalSourceObjectSchema = v3ExternalSourceObjectSchema.extend({
  objectType: z.enum([
    "kraken_ledger",
    "kraken_trade",
    "evm_transaction",
    "evm_transfer",
  ]),
});

const v6ExternalSourceObjectSchema = z.union([
  externalSourceObjectSchema,
  v3ExternalSourceObjectSchema.extend({
    objectType: z.literal("file_transaction"),
    externalId: fileExternalIdentity,
  }),
]);

const v4EvmWalletConnectionSchema = z
  .object({
    connectionId: id,
    chainId: z
      .number()
      .int()
      .refine((value): boolean => value === 1),
    networkId: z.string().refine((value): boolean => value === "eth-mainnet"),
    addressLower: z.string(),
    addressDisplay: z.string(),
    dataProvider: z.string().refine((value): boolean => value === "alchemy"),
    historyStartAt: canonicalInstant,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const v4EvmBalanceObservationDetailSchema = z
  .object({
    observationId: id,
    chainId: z
      .number()
      .int()
      .refine((value): boolean => value === 1),
    assetKind: z.enum(["native", "erc20"]),
    contractAddressLower: z.string().nullable(),
    rawAmountAtomicText: z.string().regex(/^\d+$/),
    tokenDecimals: z.number().int().min(0).max(255).nullable(),
    syncHeadBlockText: z.string().regex(/^\d+$/).nullable(),
  })
  .strict();

const v4EvmCandidateDetailSchema = z
  .object({
    candidateId: id,
    chainId: z
      .number()
      .int()
      .refine((value): boolean => value === 1),
    txHash: z.string(),
    candidateKind: z.enum(["movement", "gas"]),
    classification: z.enum([
      "simple_in",
      "simple_out",
      "simple_exchange",
      "gas_only",
      "complex",
      "unsupported",
    ]),
    txStatus: z.enum(["success", "failed", "unknown"]),
    blockNumberText: z.string().regex(/^\d+$/).nullable(),
    blockTimestamp: canonicalInstant.nullable(),
    fromAddressLower: z.string(),
    toAddressLower: z.string().nullable(),
    gasFeeAtomicText: z.string().regex(/^\d+$/).nullable(),
    gasFeeStatus: z.enum(["exact", "not_applicable", "unresolved"]),
  })
  .strict();

const evmChainIdSchema = z.union([
  z.literal(1),
  z.literal(8453),
  z.literal(42161),
]);

const evmWalletConnectionSchema = z
  .object({
    connectionId: id,
    chainId: evmChainIdSchema,
    networkId: z.enum(["eth-mainnet", "base-mainnet", "arb-mainnet"]),
    addressLower: z.string(),
    addressDisplay: z.string(),
    dataProvider: z.literal("alchemy"),
    historyStartAt: canonicalInstant,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict()
  .superRefine((value, context) => {
    try {
      assertEvmChainNetwork(value.chainId, value.networkId);
    } catch {
      context.addIssue({
        code: "custom",
        message: "EVM chain and network identity are inconsistent.",
      });
    }
  });

const evmBalanceObservationDetailSchema = z
  .object({
    observationId: id,
    chainId: evmChainIdSchema,
    assetKind: z.enum(["native", "erc20"]),
    contractAddressLower: z.string().nullable(),
    rawAmountAtomicText: z.string().regex(/^\d+$/),
    tokenDecimals: z.number().int().min(0).max(255).nullable(),
    syncHeadBlockText: z.string().regex(/^\d+$/).nullable(),
  })
  .strict();

const evmCandidateDetailSchema = z
  .object({
    candidateId: id,
    chainId: evmChainIdSchema,
    txHash: z.string(),
    candidateKind: z.enum(["movement", "gas"]),
    classification: z.enum([
      "simple_in",
      "simple_out",
      "simple_exchange",
      "gas_only",
      "complex",
      "unsupported",
    ]),
    txStatus: z.enum(["success", "failed", "unknown"]),
    blockNumberText: z.string().regex(/^\d+$/).nullable(),
    blockTimestamp: canonicalInstant.nullable(),
    fromAddressLower: z.string(),
    toAddressLower: z.string().nullable(),
    gasFeeAtomicText: z.string().regex(/^\d+$/).nullable(),
    gasFeeStatus: z.enum(["exact", "not_applicable", "unresolved"]),
    nativeTraceStatus: z.enum([
      "not_required",
      "exact",
      "trace_unavailable",
      "trace_invalid",
    ]),
  })
  .strict();

const evmL2GasFeeDetailSchema = z
  .object({
    candidateId: id,
    chainId: z.union([z.literal(8453), z.literal(42161)]),
    feeModel: z.enum(["base_op_stack", "arbitrum_nitro"]),
    executionFeeAtomicText: z.string().regex(/^\d+$/).nullable(),
    parentDataFeeAtomicText: z.string().regex(/^\d+$/).nullable(),
    operatorFeeAtomicText: z.string().regex(/^\d+$/).nullable(),
    totalFeeAtomicText: z.string().regex(/^\d+$/).nullable(),
    feeStatus: z.enum(["exact", "unresolved"]),
    evidenceJson: jsonText,
  })
  .strict();

const externalTransactionCandidateSchema = z
  .object({
    id,
    connectionId: id,
    stableKey: id,
    suggestedEventType: z.enum([
      "exchange",
      "transfer",
      "income",
      "expense",
      "unknown",
    ]),
    status: z.enum([
      "pending",
      "needs_mapping",
      "ignored",
      "imported",
      "unsupported",
      "source_changed",
    ]),
    occurredAt: canonicalInstant,
    title: z.string(),
    normalizationVersion: z.number().int().positive(),
    sourceFingerprint: sha256Text,
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
    lastSeenAt: canonicalInstant,
  })
  .strict();

const v6ExternalTransactionCandidateSchema =
  externalTransactionCandidateSchema.extend({
    stableKey: fileExternalIdentity,
    status: z.enum([
      "pending",
      "needs_mapping",
      "ignored",
      "imported",
      "matched",
      "unsupported",
      "source_changed",
    ]),
  });

const externalCandidateSourceObjectSchema = z
  .object({
    candidateId: id,
    sourceObjectId: id,
    relation: z.enum(["primary", "cross_check"]),
  })
  .strict();

const externalTransactionLegSchema = z
  .object({
    id,
    candidateId: id,
    legIndex: z.number().int().nonnegative(),
    role: z.enum([
      "source",
      "destination",
      "fee",
      "external_in",
      "external_out",
      "unknown",
    ]),
    providerAssetKey: id,
    talliAssetId: id.nullable(),
    amountText: externalDecimalText,
    amountAtomic: atomicText.nullable(),
    precisionStatus: z.enum(["exact", "excess_precision", "unmapped"]),
    note: nullableText,
  })
  .strict();

const externalImportLinkSchema = z
  .object({
    candidateId: id,
    ledgerEventId: id,
    importedAt: canonicalInstant,
    importFingerprint: sha256Text,
  })
  .strict();

const fileImportFormatSchema = z.enum(["csv", "ofx", "qfx", "camt053"]);

const csvAmountModeSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("signed"), amountColumn: z.string().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("debit_credit"),
      debitColumn: z.string().min(1),
      creditColumn: z.string().min(1),
    })
    .strict(),
]);

const csvImportConfigSchema = z
  .object({
    hasHeader: z.boolean(),
    encoding: z.enum(["utf-8", "windows-1252", "gb18030"]),
    delimiter: z.enum([",", ";", "\t"]),
    dateColumn: z.string().min(1),
    dateFormat: z.enum([
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "YYYYMMDD",
      "DD/MM/YYYY",
      "MM/DD/YYYY",
      "DD.MM.YYYY",
    ]),
    timeColumn: z.string().min(1).nullable(),
    timeFormat: z.enum(["HH:mm", "HH:mm:ss"]).nullable(),
    amountMode: csvAmountModeSchema,
    decimalSeparator: z.enum([".", ","]),
    thousandsSeparator: z.enum([",", ".", " "]).nullable(),
    invertSign: z.boolean(),
    idColumn: z.string().min(1).nullable(),
    payeeColumn: z.string().min(1).nullable(),
    memoColumn: z.string().min(1).nullable(),
    currencyColumn: z.string().min(1).nullable(),
    timezone: z.string(),
  })
  .strict();

const structuredImportConfigSchema = z
  .object({ timezoneForDateOnly: z.string() })
  .strict();

const fileImportProfileSchema = z
  .object({
    connectionId: id,
    targetAccountId: id,
    format: fileImportFormatSchema,
    parserConfigJson: jsonText,
    statementAccountFingerprint: sha256Text.nullable(),
    statementAccountLast4: z.string().min(1).max(4).nullable(),
    statementCurrencyCode: z.string().trim().min(1).max(30).nullable(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const fileImportBatchSchema = z
  .object({
    id,
    connectionId: id,
    fileSha256: sha256Text,
    originalFilename: z.string().min(1).max(255),
    format: fileImportFormatSchema,
    parserVersion: z.number().int().positive(),
    ingestedAt: canonicalInstant,
    sourceRowCount: z.number().int().nonnegative(),
    newCandidateCount: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative(),
    unsupportedCount: z.number().int().nonnegative(),
    statementFromDate: nullableText,
    statementToDate: nullableText,
  })
  .strict();

const fileImportSourceDetailSchema = z
  .object({
    sourceObjectId: id,
    identityStrength: z.enum(["strong", "weak"]),
    sourceIdKind: z.enum([
      "fitid",
      "acct_svcr_ref",
      "tx_id",
      "ntry_ref",
      "csv_id",
      "weak_signature",
    ]),
    originalDateText: z.string(),
    datePrecision: z.enum(["timestamp", "day"]),
    normalizedPayee: nullableText,
    memo: nullableText,
    statementCurrencyCode: nullableText,
  })
  .strict();

const fileImportBatchSourceObjectSchema = z
  .object({
    batchId: id,
    sourceObjectId: id,
    rowIndex: z.number().int().nonnegative(),
    rawRowSha256: sha256Text,
  })
  .strict();

const fileImportCandidateDetailSchema = z
  .object({
    candidateId: id,
    targetAccountId: id,
    direction: z.enum(["in", "out"]),
    normalizedPayee: nullableText,
    memo: nullableText,
    sourceDateText: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    datePrecision: z.enum(["timestamp", "day"]),
  })
  .strict();

const externalCandidateMatchLinkSchema = z
  .object({
    candidateId: id,
    ledgerEventId: id,
    matchedAt: canonicalInstant,
    matchFingerprint: sha256Text,
  })
  .strict();

const fileImportBalanceObservationDetailSchema = z
  .object({
    observationId: id,
    batchId: id,
    balanceKind: z.enum(["closing_ledger", "closing_booked"]),
    sourceDateText: z.string(),
    datePrecision: z.enum(["timestamp", "day"]),
    statementCurrencyCode: z.string().trim().min(1).max(30),
  })
  .strict();

const automationRuleSchema = z
  .object({
    id,
    bookId: id,
    name: z.string().trim().min(1).max(120),
    targetScope: z.literal("file_import_candidate"),
    stage: z.enum(["pre", "default", "post"]),
    matchMode: z.enum(["all", "any"]),
    isEnabled: z.boolean(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const automationRuleConditionSchema = z
  .object({
    id,
    ruleId: id,
    position: z.number().int().nonnegative(),
    field: z.enum([
      "source_payee",
      "projected_payee",
      "memo",
      "file_profile",
      "target_account",
      "source_format",
      "direction",
      "amount_abs",
      "identity_strength",
    ]),
    operator: z.enum([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
      "is_empty",
      "is_not_empty",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
    ]),
    valueJson: jsonText,
    isNegated: z.boolean(),
  })
  .strict();

const automationRuleActionSchema = z
  .object({
    id,
    ruleId: id,
    position: z.number().int().nonnegative(),
    actionType: z.enum([
      "set_payee",
      "set_category",
      "add_tag",
      "set_note",
      "append_note",
      "suggest_event_type",
    ]),
    valueJson: jsonText,
  })
  .strict();

const positiveAtomicText = z
  .string()
  .refine(
    (value) => /^[0-9]+$/.test(value) && BigInt(value) > 0n,
    "Recurring atomic amount must be positive unsigned integer text.",
  );
const dateOnlyText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const recurringItemSchema = z
  .object({
    id,
    bookId: id,
    accountId: id,
    assetId: id,
    name: z.string().trim().min(1).max(120),
    eventType: z.enum(["expense", "income"]),
    payeeText: z.string().max(200).nullable(),
    payeeMatchMode: z.enum(["any", "exact", "contains"]),
    categoryId: id.nullable(),
    note: z.string().max(2000).nullable(),
    amountMode: z.enum(["exact", "approx", "range"]),
    amountAtomicText: positiveAtomicText.nullable(),
    toleranceBps: z.number().int().min(0).max(10_000).nullable(),
    minAmountAtomicText: positiveAtomicText.nullable(),
    maxAmountAtomicText: positiveAtomicText.nullable(),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    intervalCount: z.number().int().min(1).max(10_000),
    anchorDate: dateOnlyText,
    monthlyDayMode: z.enum(["fixed", "last"]).nullable(),
    dateWindowBeforeDays: z.number().int().min(0).max(31),
    dateWindowAfterDays: z.number().int().min(0).max(31),
    startsOn: dateOnlyText.nullable(),
    endsOn: dateOnlyText.nullable(),
    isActive: z.boolean(),
    createdAt: canonicalInstant,
    updatedAt: canonicalInstant,
  })
  .strict();

const recurringItemTagSchema = z
  .object({ recurringItemId: id, tagId: id })
  .strict();

const recurringOccurrenceLinkSchema = z
  .object({
    recurringItemId: id,
    occurrenceDate: dateOnlyText,
    ledgerEventId: id,
    linkedAt: canonicalInstant,
  })
  .strict();

const recurringOccurrenceSkipSchema = z
  .object({
    recurringItemId: id,
    occurrenceDate: dateOnlyText,
    skippedAt: canonicalInstant,
    note: z.string().max(2000).nullable(),
  })
  .strict();

const v1DataSchema = z
  .object({
    books: z.array(bookSchema),
    assets: z.array(assetSchema),
    accounts: z.array(accountSchema),
    categories: z.array(categorySchema),
    tags: z.array(tagSchema),
    ledgerEvents: z.array(ledgerEventSchema),
    ledgerEntries: z.array(ledgerEntrySchema),
    eventTags: z.array(eventTagSchema),
    balanceSnapshots: z.array(snapshotSchema),
    settings: z.array(settingSchema),
  })
  .strict();

const v2DataSchema = v1DataSchema
  .extend({
    bookValuationSettings: z.array(bookValuationSettingSchema),
    priceProviderMappings: z.array(priceProviderMappingSchema),
    manualPriceQuotes: z.array(manualPriceQuoteSchema),
  })
  .strict();

const v3DataSchema = v2DataSchema
  .extend({
    externalConnections: z.array(v3ExternalConnectionSchema),
    externalAssetMappings: z.array(externalAssetMappingSchema),
    externalAccountMappings: z.array(externalAccountMappingSchema),
    externalBalanceObservations: z.array(externalBalanceObservationSchema),
    externalSourceObjects: z.array(v3ExternalSourceObjectSchema),
    externalTransactionCandidates: z.array(externalTransactionCandidateSchema),
    externalCandidateSourceObjects: z.array(
      externalCandidateSourceObjectSchema,
    ),
    externalTransactionLegs: z.array(externalTransactionLegSchema),
    externalImportLinks: z.array(externalImportLinkSchema),
  })
  .strict();

const v4DataSchema = v3DataSchema
  .extend({
    externalConnections: z.array(externalConnectionSchema),
    externalSourceObjects: z.array(externalSourceObjectSchema),
    evmWalletConnections: z.array(v4EvmWalletConnectionSchema),
    evmBalanceObservationDetails: z.array(v4EvmBalanceObservationDetailSchema),
    evmCandidateDetails: z.array(v4EvmCandidateDetailSchema),
  })
  .strict();

const v5DataSchema = v4DataSchema
  .extend({
    evmWalletConnections: z.array(evmWalletConnectionSchema),
    evmBalanceObservationDetails: z.array(evmBalanceObservationDetailSchema),
    evmCandidateDetails: z.array(evmCandidateDetailSchema),
    evmL2GasFeeDetails: z.array(evmL2GasFeeDetailSchema),
  })
  .strict();

const v6DataSchema = v5DataSchema
  .extend({
    externalConnections: z.array(v6ExternalConnectionSchema),
    externalSourceObjects: z.array(v6ExternalSourceObjectSchema),
    externalTransactionCandidates: z.array(
      v6ExternalTransactionCandidateSchema,
    ),
    fileImportProfiles: z.array(fileImportProfileSchema),
    fileImportBatches: z.array(fileImportBatchSchema),
    fileImportSourceDetails: z.array(fileImportSourceDetailSchema),
    fileImportBatchSourceObjects: z.array(fileImportBatchSourceObjectSchema),
    fileImportCandidateDetails: z.array(fileImportCandidateDetailSchema),
    externalCandidateMatchLinks: z.array(externalCandidateMatchLinkSchema),
    fileImportBalanceObservationDetails: z.array(
      fileImportBalanceObservationDetailSchema,
    ),
  })
  .strict();

const v7DataSchema = v6DataSchema
  .extend({
    automationRules: z.array(automationRuleSchema),
    automationRuleConditions: z.array(automationRuleConditionSchema),
    automationRuleActions: z.array(automationRuleActionSchema),
    recurringItems: z.array(recurringItemSchema),
    recurringItemTags: z.array(recurringItemTagSchema),
    recurringOccurrenceLinks: z.array(recurringOccurrenceLinkSchema),
    recurringOccurrenceSkips: z.array(recurringOccurrenceSkipSchema),
  })
  .strict();

const legacyBackupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_LEGACY_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v1DataSchema,
  })
  .strict();

const v2BackupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_V2_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v2DataSchema,
  })
  .strict();

const v3BackupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_V3_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v3DataSchema,
  })
  .strict();

const v4BackupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_V4_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v4DataSchema,
  })
  .strict();

const v5BackupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_V5_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v5DataSchema,
  })
  .strict();

const v6BackupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_V6_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v6DataSchema,
  })
  .strict();

export const backupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v7DataSchema,
  })
  .strict();

export type BackupPayload = z.infer<typeof backupPayloadSchema>;
export type BackupData = BackupPayload["data"];
type LegacyBackupPayload = z.infer<typeof legacyBackupPayloadSchema>;
type V2BackupPayload = z.infer<typeof v2BackupPayloadSchema>;
type V3BackupPayload = z.infer<typeof v3BackupPayloadSchema>;
type V4BackupPayload = z.infer<typeof v4BackupPayloadSchema>;
type V5BackupPayload = z.infer<typeof v5BackupPayloadSchema>;
type V6BackupPayload = z.infer<typeof v6BackupPayloadSchema>;

function fail(code: string, message: string): never {
  throw new BackupValidationError(code, message);
}

function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const candidate = key(value);
    if (seen.has(candidate)) {
      fail(
        "BACKUP_DUPLICATE_KEY",
        `Backup contains duplicate ${label}: ${candidate}.`,
      );
    }
    seen.add(candidate);
  }
}

function sameEntries(
  actual: readonly BackupData["ledgerEntries"][number][],
  expected: readonly LedgerEntryDraft[],
): boolean {
  const key = (entry: {
    accountId: string;
    entryRole?: string;
    role?: string;
    amountAtomic: string | bigint;
  }) =>
    `${entry.entryRole ?? entry.role}\u0000${entry.accountId}\u0000${entry.amountAtomic}`;
  return (
    actual.length === expected.length &&
    actual.map(key).sort().join("\n") === expected.map(key).sort().join("\n")
  );
}

function validateEventEntries(data: BackupData): void {
  const accounts = new Map(
    data.accounts.map((account) => [account.id, account]),
  );
  const grouped = new Map<string, BackupData["ledgerEntries"]>();
  for (const entry of data.ledgerEntries) {
    const entries = grouped.get(entry.eventId) ?? [];
    entries.push(entry);
    grouped.set(entry.eventId, entries);
  }

  for (const event of data.ledgerEvents) {
    const entries = grouped.get(event.id) ?? [];
    const byRole = (role: BackupData["ledgerEntries"][number]["entryRole"]) =>
      entries.filter((entry) => entry.entryRole === role);
    try {
      let expected: LedgerEntryDraft[];
      if (event.eventType === "expense" || event.eventType === "income") {
        const main = byRole("main");
        if (main.length !== 1 || entries.length !== 1) {
          fail(
            "BACKUP_EVENT_INVARIANT",
            `${event.eventType} event ${event.id} must contain one main entry.`,
          );
        }
        const account = accounts.get(main[0].accountId)!;
        const amount = BigInt(main[0].amountAtomic);
        expected =
          event.eventType === "expense"
            ? buildExpenseEntries({
                account: { id: account.id, assetId: account.assetId },
                amountAtomic: -amount,
              })
            : buildIncomeEntries({
                account: { id: account.id, assetId: account.assetId },
                amountAtomic: amount,
              });
      } else {
        const source = byRole("source");
        const destination = byRole("destination");
        const fees = byRole("fee");
        if (
          source.length !== 1 ||
          destination.length !== 1 ||
          fees.length > 1 ||
          entries.length !== 2 + fees.length
        ) {
          fail(
            "BACKUP_EVENT_INVARIANT",
            `${event.eventType} event ${event.id} has invalid role cardinality.`,
          );
        }
        const sourceAccount = accounts.get(source[0].accountId)!;
        const destinationAccount = accounts.get(destination[0].accountId)!;
        const fee = fees[0];
        const feeAccount = fee ? accounts.get(fee.accountId)! : null;
        const feeDraft =
          fee && feeAccount
            ? {
                account: { id: feeAccount.id, assetId: feeAccount.assetId },
                amountAtomic: -BigInt(fee.amountAtomic),
              }
            : undefined;
        expected =
          event.eventType === "transfer"
            ? buildTransferEntries({
                sourceAccount: {
                  id: sourceAccount.id,
                  assetId: sourceAccount.assetId,
                },
                destinationAccount: {
                  id: destinationAccount.id,
                  assetId: destinationAccount.assetId,
                },
                amountAtomic: BigInt(destination[0].amountAtomic),
                fee: feeDraft,
              })
            : buildExchangeEntries({
                sourceAccount: {
                  id: sourceAccount.id,
                  assetId: sourceAccount.assetId,
                },
                sourceAmountAtomic: -BigInt(source[0].amountAtomic),
                destinationAccount: {
                  id: destinationAccount.id,
                  assetId: destinationAccount.assetId,
                },
                destinationAmountAtomic: BigInt(destination[0].amountAtomic),
                fee: feeDraft,
              });
      }
      if (!sameEntries(entries, expected)) {
        fail(
          "BACKUP_EVENT_INVARIANT",
          `Event ${event.id} entries do not match its ledger invariants.`,
        );
      }
    } catch (error) {
      if (error instanceof BackupValidationError) {
        throw error;
      }
      fail(
        "BACKUP_EVENT_INVARIANT",
        `Event ${event.id} entries do not match its ledger invariants.`,
      );
    }
  }
}

function validateExternalAmount(input: {
  amountText: string;
  amountAtomic: string | null;
  precisionStatus: "exact" | "excess_precision" | "unmapped";
  talliAssetId: string | null;
  assets: ReadonlyMap<string, BackupData["assets"][number]>;
  label: string;
}): void {
  const asset = input.talliAssetId
    ? input.assets.get(input.talliAssetId)
    : undefined;
  if (input.talliAssetId && !asset) {
    fail(
      "BACKUP_EXTERNAL_RELATION",
      `${input.label} references a missing Talli asset.`,
    );
  }
  const conversion = externalDecimalToAtomic(
    input.amountText,
    asset?.scale ?? null,
  );
  if (
    conversion.precisionStatus !== input.precisionStatus ||
    (conversion.amountAtomic === null
      ? input.amountAtomic !== null
      : input.amountAtomic === null ||
        conversion.amountAtomic !== BigInt(input.amountAtomic))
  ) {
    fail(
      "BACKUP_EXTERNAL_AMOUNT_INVALID",
      `${input.label} has inconsistent decimal, atomic, asset, or precision data.`,
    );
  }
}

function validateExternalRelations(data: BackupData): void {
  uniqueBy(data.externalConnections, (row) => row.id, "external connection id");
  uniqueBy(
    data.externalConnections,
    (row) => `${row.bookId}\u0000${row.provider}\u0000${row.sourceKey}`,
    "external connection identity",
  );
  uniqueBy(
    data.evmWalletConnections,
    (row) => row.connectionId,
    "EVM wallet connection id",
  );
  uniqueBy(
    data.evmWalletConnections,
    (row) => `${row.chainId}\u0000${row.addressLower}`,
    "EVM wallet chain and address",
  );
  uniqueBy(
    data.evmBalanceObservationDetails,
    (row) => row.observationId,
    "EVM balance observation detail",
  );
  uniqueBy(
    data.evmCandidateDetails,
    (row) => row.candidateId,
    "EVM candidate detail",
  );
  uniqueBy(
    data.evmCandidateDetails,
    (row) => `${row.chainId}\u0000${row.txHash}\u0000${row.candidateKind}`,
    "EVM transaction candidate identity",
  );
  uniqueBy(
    data.evmL2GasFeeDetails,
    (row) => row.candidateId,
    "EVM L2 gas fee detail",
  );
  uniqueBy(
    data.externalAssetMappings,
    (row) => `${row.connectionId}\u0000${row.providerAssetKey}`,
    "external asset mapping",
  );
  uniqueBy(
    data.externalAccountMappings,
    (row) => `${row.connectionId}\u0000${row.providerAssetKey}`,
    "external account mapping",
  );
  uniqueBy(
    data.externalBalanceObservations,
    (row) => row.id,
    "external balance observation id",
  );
  uniqueBy(data.externalSourceObjects, (row) => row.id, "external source id");
  uniqueBy(
    data.externalSourceObjects,
    (row) =>
      `${row.connectionId}\u0000${row.objectType}\u0000${row.externalId}`,
    "external source identity",
  );
  uniqueBy(
    data.externalTransactionCandidates,
    (row) => row.id,
    "external candidate id",
  );
  uniqueBy(
    data.externalTransactionCandidates,
    (row) => `${row.connectionId}\u0000${row.stableKey}`,
    "external candidate stable key",
  );
  uniqueBy(
    data.externalCandidateSourceObjects,
    (row) => `${row.candidateId}\u0000${row.sourceObjectId}`,
    "candidate source link",
  );
  uniqueBy(data.externalTransactionLegs, (row) => row.id, "candidate leg id");
  uniqueBy(
    data.externalTransactionLegs,
    (row) => `${row.candidateId}\u0000${row.legIndex}`,
    "candidate leg index",
  );
  uniqueBy(
    data.externalImportLinks,
    (row) => row.candidateId,
    "candidate import link",
  );
  uniqueBy(
    data.externalImportLinks,
    (row) => row.ledgerEventId,
    "imported ledger event",
  );
  uniqueBy(
    data.fileImportProfiles,
    (row) => row.connectionId,
    "file-import profile",
  );
  uniqueBy(data.fileImportBatches, (row) => row.id, "file-import batch id");
  uniqueBy(
    data.fileImportBatches,
    (row) => `${row.connectionId}\u0000${row.fileSha256}`,
    "file-import file identity",
  );
  uniqueBy(
    data.fileImportSourceDetails,
    (row) => row.sourceObjectId,
    "file-import source detail",
  );
  uniqueBy(
    data.fileImportBatchSourceObjects,
    (row) => `${row.batchId}\u0000${row.sourceObjectId}`,
    "file-import batch source",
  );
  uniqueBy(
    data.fileImportBatchSourceObjects,
    (row) => `${row.batchId}\u0000${row.rowIndex}`,
    "file-import batch row",
  );
  uniqueBy(
    data.fileImportCandidateDetails,
    (row) => row.candidateId,
    "file-import candidate detail",
  );
  uniqueBy(
    data.externalCandidateMatchLinks,
    (row) => row.candidateId,
    "candidate match link",
  );
  uniqueBy(
    data.fileImportBalanceObservationDetails,
    (row) => row.observationId,
    "file-import balance observation detail",
  );
  uniqueBy(
    data.fileImportBalanceObservationDetails,
    (row) => row.batchId,
    "file-import batch balance",
  );

  const books = new Map(data.books.map((row) => [row.id, row]));
  const assets = new Map(data.assets.map((row) => [row.id, row]));
  const accounts = new Map(data.accounts.map((row) => [row.id, row]));
  const events = new Map(data.ledgerEvents.map((row) => [row.id, row]));
  const connections = new Map(
    data.externalConnections.map((row) => [row.id, row]),
  );
  const evmWallets = new Map(
    data.evmWalletConnections.map((row) => [row.connectionId, row]),
  );
  const evmObservationDetails = new Map(
    data.evmBalanceObservationDetails.map((row) => [row.observationId, row]),
  );
  const evmCandidateDetails = new Map(
    data.evmCandidateDetails.map((row) => [row.candidateId, row]),
  );
  const evmL2GasFeeDetails = new Map(
    data.evmL2GasFeeDetails.map((row) => [row.candidateId, row]),
  );
  const mappingKey = (connectionId: string, providerAssetKey: string) =>
    `${connectionId}\u0000${providerAssetKey}`;
  const mappings = new Map(
    data.externalAssetMappings.map((row) => [
      mappingKey(row.connectionId, row.providerAssetKey),
      row,
    ]),
  );
  const accountMappings = new Map(
    data.externalAccountMappings.map((row) => [
      mappingKey(row.connectionId, row.providerAssetKey),
      row,
    ]),
  );
  const sources = new Map(
    data.externalSourceObjects.map((row) => [row.id, row]),
  );
  const candidates = new Map(
    data.externalTransactionCandidates.map((row) => [row.id, row]),
  );
  const candidateLegs = new Map<
    string,
    BackupData["externalTransactionLegs"]
  >();
  for (const leg of data.externalTransactionLegs) {
    const legs = candidateLegs.get(leg.candidateId) ?? [];
    legs.push(leg);
    candidateLegs.set(leg.candidateId, legs);
  }
  const importLinks = new Map(
    data.externalImportLinks.map((row) => [row.candidateId, row]),
  );
  const fileProfiles = new Map(
    data.fileImportProfiles.map((row) => [row.connectionId, row]),
  );
  const fileBatches = new Map(
    data.fileImportBatches.map((row) => [row.id, row]),
  );
  const fileBatchRows = new Map<string, number[]>();
  for (const link of data.fileImportBatchSourceObjects) {
    const rows = fileBatchRows.get(link.batchId) ?? [];
    rows.push(link.rowIndex);
    fileBatchRows.set(link.batchId, rows);
  }
  const fileSourceDetails = new Map(
    data.fileImportSourceDetails.map((row) => [row.sourceObjectId, row]),
  );
  const fileCandidateDetails = new Map(
    data.fileImportCandidateDetails.map((row) => [row.candidateId, row]),
  );
  const matchLinks = new Map(
    data.externalCandidateMatchLinks.map((row) => [row.candidateId, row]),
  );
  const fileBalanceDetails = new Map(
    data.fileImportBalanceObservationDetails.map((row) => [
      row.observationId,
      row,
    ]),
  );

  for (const connection of data.externalConnections) {
    if (!books.has(connection.bookId)) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External connection ${connection.id} references a missing book.`,
      );
    }
    if (connection.provider === "kraken") {
      if (
        connection.sourceKey !== "kraken:primary" ||
        connection.credentialRef !== "env:kraken.primary" ||
        evmWallets.has(connection.id)
      ) {
        fail(
          "BACKUP_EXTERNAL_IDENTITY_INVALID",
          `Kraken connection ${connection.id} has inconsistent identity.`,
        );
      }
      if (fileProfiles.has(connection.id)) {
        fail(
          "BACKUP_FILE_IMPORT_RELATION",
          `Kraken connection ${connection.id} cannot contain a file profile.`,
        );
      }
    } else if (connection.provider === "evm_wallet") {
      const wallet = evmWallets.get(connection.id);
      if (!wallet) {
        fail(
          "BACKUP_EVM_RELATION",
          `EVM connection ${connection.id} is missing its wallet subtype.`,
        );
      }
      try {
        if (
          wallet.addressLower !== normalizeEvmAddress(wallet.addressLower) ||
          normalizeEvmAddress(wallet.addressDisplay) !== wallet.addressLower ||
          connection.sourceKey !==
            evmWalletSourceKey(wallet.chainId, wallet.addressLower)
        ) {
          throw new Error("identity mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_IDENTITY_INVALID",
          `EVM connection ${connection.id} has inconsistent chain identity.`,
        );
      }
      if (fileProfiles.has(connection.id)) {
        fail(
          "BACKUP_FILE_IMPORT_RELATION",
          `EVM connection ${connection.id} cannot contain a file profile.`,
        );
      }
    } else {
      const profile = fileProfiles.get(connection.id);
      const account = profile
        ? accounts.get(profile.targetAccountId)
        : undefined;
      const key = `file:${connection.id}:target`;
      const assetMapping = mappings.get(mappingKey(connection.id, key));
      const accountMapping = accountMappings.get(
        mappingKey(connection.id, key),
      );
      if (
        !profile ||
        connection.sourceKey !== `file:${connection.id}` ||
        connection.credentialRef !== "local:file-import" ||
        evmWallets.has(connection.id) ||
        !account ||
        account.bookId !== connection.bookId ||
        assetMapping?.mappingStatus !== "mapped" ||
        assetMapping.talliAssetId !== account.assetId ||
        accountMapping?.talliAccountId !== account.id ||
        accountMapping.isEnabled !== true
      ) {
        fail(
          "BACKUP_FILE_IMPORT_PROFILE_INVALID",
          `File-import profile ${connection.id} has inconsistent account mapping or identity.`,
        );
      }
      let config: unknown;
      try {
        config = JSON.parse(profile.parserConfigJson);
      } catch {
        config = null;
      }
      let timezone: string | null = null;
      let configIsValid = false;
      if (profile.format === "csv") {
        const parsedConfig = csvImportConfigSchema.safeParse(config);
        if (parsedConfig.success) {
          timezone = parsedConfig.data.timezone;
          configIsValid = true;
        }
      } else {
        const parsedConfig = structuredImportConfigSchema.safeParse(config);
        if (parsedConfig.success) {
          timezone = parsedConfig.data.timezoneForDateOnly;
          configIsValid = true;
        }
      }
      try {
        if (!configIsValid || !timezone) throw new Error("bad config");
        assertIanaTimeZone(timezone);
      } catch {
        fail(
          "BACKUP_FILE_IMPORT_CONFIG_INVALID",
          `File-import profile ${connection.id} has an incompatible parser configuration.`,
        );
      }
    }
  }
  for (const profile of data.fileImportProfiles) {
    if (connections.get(profile.connectionId)?.provider !== "file_import") {
      fail(
        "BACKUP_FILE_IMPORT_RELATION",
        `File-import profile ${profile.connectionId} is orphaned.`,
      );
    }
  }
  for (const wallet of data.evmWalletConnections) {
    if (connections.get(wallet.connectionId)?.provider !== "evm_wallet") {
      fail(
        "BACKUP_EVM_RELATION",
        `EVM wallet ${wallet.connectionId} references a non-EVM connection.`,
      );
    }
  }
  for (const mapping of data.externalAssetMappings) {
    const connection = connections.get(mapping.connectionId);
    if (!connection) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External asset mapping ${mapping.providerAssetKey} references a missing connection.`,
      );
    }
    if (connection.provider === "evm_wallet") {
      try {
        const assetIdentity = parseEvmAssetKey(mapping.providerAssetKey);
        if (assetIdentity.chainId !== evmWallets.get(connection.id)?.chainId) {
          throw new Error("chain mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_ASSET_KEY_INVALID",
          `EVM mapping ${mapping.providerAssetKey} has an invalid asset identity.`,
        );
      }
    }
    if (
      (mapping.mappingStatus === "mapped" &&
        (!mapping.talliAssetId || !assets.has(mapping.talliAssetId))) ||
      (mapping.mappingStatus !== "mapped" && mapping.talliAssetId !== null)
    ) {
      fail(
        "BACKUP_EXTERNAL_MAPPING_INVALID",
        `External asset mapping ${mapping.providerAssetKey} has inconsistent status or asset.`,
      );
    }
  }
  for (const mapping of data.externalAccountMappings) {
    const assetMapping = mappings.get(
      mappingKey(mapping.connectionId, mapping.providerAssetKey),
    );
    const connection = connections.get(mapping.connectionId);
    const account = accounts.get(mapping.talliAccountId);
    if (
      !assetMapping ||
      assetMapping.mappingStatus !== "mapped" ||
      !assetMapping.talliAssetId ||
      !connection ||
      !account ||
      account.bookId !== connection.bookId ||
      account.assetId !== assetMapping.talliAssetId
    ) {
      fail(
        "BACKUP_EXTERNAL_ACCOUNT_MAPPING_INVALID",
        `External account mapping ${mapping.providerAssetKey} is incompatible.`,
      );
    }
  }
  for (const batch of data.fileImportBatches) {
    const profile = fileProfiles.get(batch.connectionId);
    const linkedRows = [...(fileBatchRows.get(batch.id) ?? [])].sort(
      (left, right) => left - right,
    );
    const unlinkedDuplicateRows = batch.sourceRowCount - linkedRows.length;
    if (
      !profile ||
      profile.format !== batch.format ||
      (batch.sourceRowCount === 0
        ? linkedRows.length !== 0
        : linkedRows.length === 0) ||
      unlinkedDuplicateRows < 0 ||
      unlinkedDuplicateRows > batch.duplicateCount ||
      batch.newCandidateCount > linkedRows.length ||
      batch.duplicateCount > batch.sourceRowCount ||
      batch.unsupportedCount > batch.sourceRowCount ||
      /[\\/\u0000-\u001f\u007f]/.test(batch.originalFilename)
    ) {
      fail(
        "BACKUP_FILE_IMPORT_BATCH_INVALID",
        `File-import batch ${batch.id} has inconsistent profile, counts, or filename.`,
      );
    }
  }
  for (const link of data.fileImportBatchSourceObjects) {
    const batch = fileBatches.get(link.batchId);
    const source = sources.get(link.sourceObjectId);
    if (
      !batch ||
      !source ||
      source.objectType !== "file_transaction" ||
      source.connectionId !== batch.connectionId ||
      link.rowIndex >= batch.sourceRowCount
    ) {
      fail(
        "BACKUP_FILE_IMPORT_BATCH_SOURCE_INVALID",
        `File-import batch source ${link.batchId}/${link.sourceObjectId} is inconsistent.`,
      );
    }
  }
  for (const observation of data.externalBalanceObservations) {
    const connection = connections.get(observation.connectionId);
    if (
      !mappings.has(
        mappingKey(observation.connectionId, observation.providerAssetKey),
      )
    ) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External observation ${observation.id} references a missing mapping.`,
      );
    }
    if (connection?.provider === "evm_wallet") {
      const detail = evmObservationDetails.get(observation.id);
      if (!detail) {
        fail(
          "BACKUP_EVM_RELATION",
          `EVM observation ${observation.id} is missing raw on-chain details.`,
        );
      }
      try {
        const asset = parseEvmAssetKey(observation.providerAssetKey);
        const wallet = evmWallets.get(observation.connectionId);
        if (
          !wallet ||
          asset.chainId !== wallet.chainId ||
          detail.chainId !== wallet.chainId ||
          asset.kind !== detail.assetKind ||
          asset.contractAddressLower !== detail.contractAddressLower ||
          (detail.assetKind === "native" && detail.tokenDecimals !== 18)
        ) {
          throw new Error("asset mismatch");
        }
        const expectedAmount =
          detail.tokenDecimals === null
            ? detail.rawAmountAtomicText
            : evmRawAtomicToDecimalText(
                BigInt(detail.rawAmountAtomicText),
                detail.tokenDecimals,
              );
        if (
          canonicalExternalDecimalText(observation.providerAmountText) !==
            expectedAmount ||
          (detail.tokenDecimals === null &&
            (detail.assetKind !== "erc20" ||
              observation.talliAssetId !== null ||
              observation.mappedAmountAtomic !== null ||
              observation.precisionStatus !== "unmapped"))
        ) {
          throw new Error("amount provenance mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_ASSET_KEY_INVALID",
          `EVM observation ${observation.id} has inconsistent asset identity.`,
        );
      }
    } else if (connection?.provider === "file_import") {
      const detail = fileBalanceDetails.get(observation.id);
      const batch = detail ? fileBatches.get(detail.batchId) : undefined;
      const profile = fileProfiles.get(observation.connectionId);
      const account = profile
        ? accounts.get(profile.targetAccountId)
        : undefined;
      if (
        !detail ||
        !batch ||
        batch.connectionId !== observation.connectionId ||
        !profile ||
        !account ||
        observation.providerAssetKey !==
          `file:${observation.connectionId}:target` ||
        observation.talliAssetId !== account.assetId ||
        observation.precisionStatus !== "exact" ||
        observation.mappedAmountAtomic === null ||
        detail.statementCurrencyCode !==
          (profile.statementCurrencyCode ?? assets.get(account.assetId)?.code)
      ) {
        fail(
          "BACKUP_FILE_IMPORT_OBSERVATION_INVALID",
          `File-import observation ${observation.id} has inconsistent statement provenance.`,
        );
      }
    } else if (
      evmObservationDetails.has(observation.id) ||
      fileBalanceDetails.has(observation.id)
    ) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `Observation ${observation.id} contains provider-incompatible details.`,
      );
    }
    validateExternalAmount({
      amountText: observation.providerAmountText,
      amountAtomic: observation.mappedAmountAtomic,
      precisionStatus: observation.precisionStatus,
      talliAssetId: observation.talliAssetId,
      assets,
      label: `External observation ${observation.id}`,
    });
  }
  for (const detail of data.evmBalanceObservationDetails) {
    const observation = data.externalBalanceObservations.find(
      (row) => row.id === detail.observationId,
    );
    if (
      !observation ||
      connections.get(observation.connectionId)?.provider !== "evm_wallet"
    ) {
      fail(
        "BACKUP_EVM_RELATION",
        `EVM observation detail ${detail.observationId} is orphaned.`,
      );
    }
  }
  for (const detail of data.fileImportBalanceObservationDetails) {
    const observation = data.externalBalanceObservations.find(
      (row) => row.id === detail.observationId,
    );
    if (
      !observation ||
      connections.get(observation.connectionId)?.provider !== "file_import"
    ) {
      fail(
        "BACKUP_FILE_IMPORT_RELATION",
        `File-import observation detail ${detail.observationId} is orphaned.`,
      );
    }
  }
  for (const source of data.externalSourceObjects) {
    const connection = connections.get(source.connectionId);
    if (!connection) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External source ${source.id} references a missing connection.`,
      );
    }
    const isKrakenSource =
      source.objectType === "kraken_ledger" ||
      source.objectType === "kraken_trade";
    const isEvmSource =
      source.objectType === "evm_transaction" ||
      source.objectType === "evm_transfer";
    const isFileSource = source.objectType === "file_transaction";
    const compatible =
      (connection.provider === "kraken" && isKrakenSource) ||
      (connection.provider === "evm_wallet" && isEvmSource) ||
      (connection.provider === "file_import" && isFileSource);
    if (!compatible) {
      fail(
        "BACKUP_EXTERNAL_SOURCE_PROVIDER_INVALID",
        `External source ${source.id} is incompatible with its provider.`,
      );
    }
    const hash = createHash("sha256").update(source.payloadJson).digest("hex");
    if (hash !== source.payloadHash) {
      fail(
        "BACKUP_EXTERNAL_SOURCE_HASH_INVALID",
        `External source ${source.id} payload hash does not match.`,
      );
    }
    const fileDetail = fileSourceDetails.get(source.id);
    if (connection.provider === "file_import") {
      const profile = fileProfiles.get(connection.id);
      let parsedPayload: ReturnType<
        typeof parseFileImportSourcePayloadJson
      > | null;
      try {
        parsedPayload = parseFileImportSourcePayloadJson(source.payloadJson);
      } catch {
        parsedPayload = null;
      }
      const appearsInBatch = data.fileImportBatchSourceObjects.some(
        (link) => link.sourceObjectId === source.id,
      );
      if (
        !profile ||
        !fileDetail ||
        !parsedPayload ||
        parsedPayload.format !== profile.format ||
        parsedPayload.sourceExternalId !== source.externalId ||
        parsedPayload.originalDateText !== fileDetail.originalDateText ||
        parsedPayload.datePrecision !== fileDetail.datePrecision ||
        parsedPayload.payee !== fileDetail.normalizedPayee ||
        parsedPayload.memo !== fileDetail.memo ||
        parsedPayload.currencyCode !== fileDetail.statementCurrencyCode ||
        !appearsInBatch
      ) {
        fail(
          "BACKUP_FILE_IMPORT_SOURCE_INVALID",
          `File-import source ${source.id} has invalid selected-field provenance.`,
        );
      }
    } else if (fileDetail) {
      fail(
        "BACKUP_FILE_IMPORT_RELATION",
        `Non-file source ${source.id} contains file-import details.`,
      );
    }
  }
  for (const detail of data.fileImportSourceDetails) {
    if (sources.get(detail.sourceObjectId)?.objectType !== "file_transaction") {
      fail(
        "BACKUP_FILE_IMPORT_RELATION",
        `File-import source detail ${detail.sourceObjectId} is orphaned.`,
      );
    }
  }
  for (const candidate of data.externalTransactionCandidates) {
    const connection = connections.get(candidate.connectionId);
    if (!connection) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External candidate ${candidate.id} references a missing connection.`,
      );
    }
    const evmDetail = evmCandidateDetails.get(candidate.id);
    if (connection.provider === "evm_wallet") {
      if (!evmDetail) {
        fail(
          "BACKUP_EVM_RELATION",
          `EVM candidate ${candidate.id} is missing details.`,
        );
      }
      try {
        const txHash = normalizeEvmTxHash(evmDetail.txHash);
        const wallet = evmWallets.get(candidate.connectionId);
        const expectedStableKey =
          evmDetail.candidateKind === "gas"
            ? evmGasStableKey(evmDetail.chainId, txHash)
            : evmMovementStableKey(evmDetail.chainId, txHash);
        if (
          !wallet ||
          wallet.chainId !== evmDetail.chainId ||
          txHash !== evmDetail.txHash ||
          candidate.stableKey !== expectedStableKey ||
          (evmDetail.chainId === 1 &&
            evmDetail.nativeTraceStatus !== "not_required") ||
          (evmDetail.chainId !== 1 &&
            evmDetail.candidateKind === "movement" &&
            evmDetail.nativeTraceStatus !== "exact") ||
          normalizeEvmAddress(evmDetail.fromAddressLower) !==
            evmDetail.fromAddressLower ||
          (evmDetail.toAddressLower !== null &&
            normalizeEvmAddress(evmDetail.toAddressLower) !==
              evmDetail.toAddressLower)
        ) {
          throw new Error("candidate mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_CANDIDATE_INVALID",
          `EVM candidate ${candidate.id} has inconsistent transaction identity.`,
        );
      }
    } else if (connection.provider === "kraken") {
      if (evmDetail || !candidate.stableKey.startsWith("kraken:")) {
        fail(
          "BACKUP_EXTERNAL_CANDIDATE_INVALID",
          `Kraken candidate ${candidate.id} has an invalid namespace or subtype.`,
        );
      }
    } else if (evmDetail) {
      fail(
        "BACKUP_FILE_IMPORT_CANDIDATE_INVALID",
        `File-import candidate ${candidate.id} contains EVM details.`,
      );
    }
    const linked = data.externalCandidateSourceObjects.filter(
      (link) => link.candidateId === candidate.id,
    );
    if (linked.filter((link) => link.relation === "primary").length !== 1) {
      fail(
        "BACKUP_EXTERNAL_CANDIDATE_INVALID",
        `External candidate ${candidate.id} must have exactly one primary source.`,
      );
    }
    const linkedSources = linked.map((link) =>
      sources.get(link.sourceObjectId),
    );
    if (
      linkedSources.some(
        (source) => !source || source.connectionId !== candidate.connectionId,
      )
    ) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External candidate ${candidate.id} has a missing or cross-connection source.`,
      );
    }
    const fingerprint = createHash("sha256")
      .update(
        linkedSources
          .map((source) => source!)
          .map(
            (source) =>
              `${source.objectType}:${source.externalId}:${source.payloadHash}`,
          )
          .sort()
          .join("\n"),
      )
      .digest("hex");
    if (fingerprint !== candidate.sourceFingerprint) {
      fail(
        "BACKUP_EXTERNAL_CANDIDATE_FINGERPRINT_INVALID",
        `External candidate ${candidate.id} source fingerprint does not match.`,
      );
    }
    const hasImport = importLinks.has(candidate.id);
    const hasMatch = matchLinks.has(candidate.id);
    const resolutionIsValid =
      (candidate.status === "imported" && hasImport && !hasMatch) ||
      (candidate.status === "matched" && hasMatch && !hasImport) ||
      (candidate.status === "source_changed" && hasImport !== hasMatch) ||
      (!["imported", "matched", "source_changed"].includes(candidate.status) &&
        !hasImport &&
        !hasMatch);
    if (!resolutionIsValid) {
      fail(
        "BACKUP_EXTERNAL_RESOLUTION_STATE_INVALID",
        `External candidate ${candidate.id} status and provenance disagree.`,
      );
    }
    if (connection.provider === "file_import") {
      const detail = fileCandidateDetails.get(candidate.id);
      const profile = fileProfiles.get(candidate.connectionId);
      const legs = candidateLegs.get(candidate.id) ?? [];
      const account = detail ? accounts.get(detail.targetAccountId) : undefined;
      const linkedFileSources = linked.flatMap((link) => {
        const source = sources.get(link.sourceObjectId);
        return source ? [source] : [];
      });
      const linkedFileSourceDetails = linkedFileSources.flatMap((source) => {
        const sourceDetail = fileSourceDetails.get(source.id);
        return sourceDetail ? [sourceDetail] : [];
      });
      try {
        assertFileImportCandidateProvenance({
          connection,
          profile: profile ?? null,
          targetAccount: account ?? null,
          targetAsset: account ? (assets.get(account.assetId) ?? null) : null,
          candidate,
          candidateDetail: detail ?? null,
          sourceLinks: linked,
          sources: linkedFileSources,
          sourceDetails: linkedFileSourceDetails,
          legs,
        });
      } catch {
        fail(
          "BACKUP_FILE_IMPORT_CANDIDATE_INVALID",
          `File-import candidate ${candidate.id} has inconsistent source-to-candidate financial provenance.`,
        );
      }
    } else if (fileCandidateDetails.has(candidate.id) || hasMatch) {
      fail(
        "BACKUP_FILE_IMPORT_RELATION",
        `Non-file candidate ${candidate.id} contains file-import details or match provenance.`,
      );
    }
  }
  for (const detail of data.fileImportCandidateDetails) {
    const candidate = candidates.get(detail.candidateId);
    if (
      !candidate ||
      connections.get(candidate.connectionId)?.provider !== "file_import"
    ) {
      fail(
        "BACKUP_FILE_IMPORT_RELATION",
        `File-import candidate detail ${detail.candidateId} is orphaned.`,
      );
    }
  }
  for (const detail of data.evmCandidateDetails) {
    const candidate = candidates.get(detail.candidateId);
    if (
      !candidate ||
      connections.get(candidate.connectionId)?.provider !== "evm_wallet" ||
      (detail.candidateKind === "gas") !==
        (detail.classification === "gas_only") ||
      (detail.chainId !== 1 && detail.candidateKind === "gas") !==
        evmL2GasFeeDetails.has(detail.candidateId)
    ) {
      fail(
        "BACKUP_EVM_RELATION",
        `EVM candidate detail ${detail.candidateId} is orphaned or inconsistent.`,
      );
    }
  }
  for (const fee of data.evmL2GasFeeDetails) {
    const detail = evmCandidateDetails.get(fee.candidateId);
    const candidate = candidates.get(fee.candidateId);
    const legs = candidateLegs.get(fee.candidateId) ?? [];
    const expectedModel =
      fee.chainId === 8453 ? "base_op_stack" : "arbitrum_nitro";
    let componentsAreExact = true;
    if (fee.feeStatus === "exact") {
      if (
        fee.executionFeeAtomicText === null ||
        fee.parentDataFeeAtomicText === null ||
        fee.totalFeeAtomicText === null ||
        (fee.chainId === 8453 && fee.operatorFeeAtomicText === null) ||
        (fee.chainId === 42161 && fee.operatorFeeAtomicText !== null)
      ) {
        componentsAreExact = false;
      } else {
        const expectedTotal =
          BigInt(fee.executionFeeAtomicText) +
          BigInt(fee.parentDataFeeAtomicText) +
          (fee.operatorFeeAtomicText === null
            ? 0n
            : BigInt(fee.operatorFeeAtomicText));
        componentsAreExact = expectedTotal === BigInt(fee.totalFeeAtomicText);
      }
    } else if (fee.totalFeeAtomicText !== null) {
      componentsAreExact = false;
    }
    let candidateBindingIsValid = false;
    if (fee.feeStatus === "exact" && fee.totalFeeAtomicText !== null) {
      const leg = legs[0];
      candidateBindingIsValid =
        candidate !== undefined &&
        detail !== undefined &&
        detail.candidateKind === "gas" &&
        detail.classification === "gas_only" &&
        detail.gasFeeStatus === "exact" &&
        detail.gasFeeAtomicText !== null &&
        detail.gasFeeAtomicText === fee.totalFeeAtomicText &&
        legs.length === 1 &&
        leg?.role === "external_out" &&
        leg.providerAssetKey === evmNativeAssetKey(fee.chainId) &&
        leg.amountText ===
          `-${evmRawAtomicToDecimalText(BigInt(fee.totalFeeAtomicText), 18)}`;
    } else if (fee.feeStatus === "unresolved") {
      candidateBindingIsValid =
        candidate !== undefined &&
        detail !== undefined &&
        detail.candidateKind === "gas" &&
        detail.classification === "gas_only" &&
        detail.gasFeeStatus === "unresolved" &&
        detail.gasFeeAtomicText === null &&
        fee.totalFeeAtomicText === null &&
        candidate.status !== "pending" &&
        candidate.status !== "needs_mapping" &&
        candidate.status !== "imported" &&
        legs.length === 0;
    }
    if (
      !detail ||
      detail.candidateKind !== "gas" ||
      detail.chainId !== fee.chainId ||
      fee.feeModel !== expectedModel ||
      !componentsAreExact ||
      !candidateBindingIsValid
    ) {
      fail(
        "BACKUP_EVM_L2_FEE_INVALID",
        `EVM L2 gas fee detail ${fee.candidateId} is inconsistent.`,
      );
    }
  }
  for (const link of data.externalCandidateSourceObjects) {
    const candidate = candidates.get(link.candidateId);
    const source = sources.get(link.sourceObjectId);
    if (
      !candidate ||
      !source ||
      candidate.connectionId !== source.connectionId
    ) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        "External candidate source link is missing or crosses connections.",
      );
    }
  }
  for (const leg of data.externalTransactionLegs) {
    const candidate = candidates.get(leg.candidateId);
    if (
      !candidate ||
      !mappings.has(mappingKey(candidate.connectionId, leg.providerAssetKey))
    ) {
      fail(
        "BACKUP_EXTERNAL_RELATION",
        `External candidate leg ${leg.id} references a missing candidate or mapping.`,
      );
    }
    const connection = candidate
      ? connections.get(candidate.connectionId)
      : undefined;
    if (connection?.provider === "evm_wallet") {
      try {
        const assetIdentity = parseEvmAssetKey(leg.providerAssetKey);
        if (assetIdentity.chainId !== evmWallets.get(connection.id)?.chainId) {
          throw new Error("chain mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_ASSET_KEY_INVALID",
          `EVM candidate leg ${leg.id} has an invalid asset identity.`,
        );
      }
    }
    validateExternalAmount({
      amountText: leg.amountText,
      amountAtomic: leg.amountAtomic,
      precisionStatus: leg.precisionStatus,
      talliAssetId: leg.talliAssetId,
      assets,
      label: `External candidate leg ${leg.id}`,
    });
  }
  for (const link of data.externalImportLinks) {
    const candidate = candidates.get(link.candidateId);
    const event = events.get(link.ledgerEventId);
    const connection = candidate
      ? connections.get(candidate.connectionId)
      : undefined;
    if (
      !candidate ||
      !event ||
      !connection ||
      event.bookId !== connection.bookId
    ) {
      fail(
        "BACKUP_EXTERNAL_IMPORT_INVALID",
        `External import link for candidate ${link.candidateId} is invalid.`,
      );
    }
  }
  for (const link of data.externalCandidateMatchLinks) {
    const candidate = candidates.get(link.candidateId);
    const event = events.get(link.ledgerEventId);
    const connection = candidate
      ? connections.get(candidate.connectionId)
      : undefined;
    const detail = candidate
      ? fileCandidateDetails.get(candidate.id)
      : undefined;
    const leg = candidate
      ? (candidateLegs.get(candidate.id) ?? [])[0]
      : undefined;
    const exactEntry = data.ledgerEntries.some(
      (entry) =>
        entry.eventId === link.ledgerEventId &&
        entry.accountId === detail?.targetAccountId &&
        entry.amountAtomic === leg?.amountAtomic,
    );
    const expectedFingerprint = candidate
      ? createHash("sha256")
          .update(
            canonicalExternalJson({
              candidateId: candidate.id,
              ledgerEventId: link.ledgerEventId,
              sourceFingerprint: candidate.sourceFingerprint,
              matchedAt: link.matchedAt,
            }),
          )
          .digest("hex")
      : null;
    if (
      !candidate ||
      !event ||
      connection?.provider !== "file_import" ||
      event.bookId !== connection.bookId ||
      !detail ||
      !leg ||
      (candidate.status !== "matched" &&
        candidate.status !== "source_changed") ||
      (candidate.status === "matched" &&
        (!exactEntry || link.matchFingerprint !== expectedFingerprint))
    ) {
      fail(
        "BACKUP_FILE_IMPORT_MATCH_INVALID",
        `File-import match for candidate ${link.candidateId} is invalid.`,
      );
    }
  }
}

function parseAutomationJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail("BACKUP_AUTOMATION_JSON_INVALID", `${label} is not valid JSON.`);
  }
}

function compareUnsignedDecimalText(left: string, right: string): number {
  const [leftIntegerRaw, leftFractionRaw = ""] = left.split(".");
  const [rightIntegerRaw, rightFractionRaw = ""] = right.split(".");
  const leftInteger = leftIntegerRaw!.replace(/^0+(?=\d)/, "");
  const rightInteger = rightIntegerRaw!.replace(/^0+(?=\d)/, "");
  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length - rightInteger.length;
  }
  const integerOrder = leftInteger.localeCompare(rightInteger);
  if (integerOrder !== 0) return integerOrder;
  const length = Math.max(leftFractionRaw.length, rightFractionRaw.length);
  return leftFractionRaw
    .padEnd(length, "0")
    .localeCompare(rightFractionRaw.padEnd(length, "0"));
}

function validateAutomationAndRecurring(data: BackupData): void {
  uniqueBy(data.automationRules, (row) => row.id, "automation rule id");
  uniqueBy(
    data.automationRuleConditions,
    (row) => row.id,
    "automation condition id",
  );
  uniqueBy(
    data.automationRuleConditions,
    (row) => `${row.ruleId}\u0000${row.position}`,
    "automation condition position",
  );
  uniqueBy(data.automationRuleActions, (row) => row.id, "automation action id");
  uniqueBy(
    data.automationRuleActions,
    (row) => `${row.ruleId}\u0000${row.position}`,
    "automation action position",
  );
  const books = new Map(data.books.map((row) => [row.id, row]));
  const accounts = new Map(data.accounts.map((row) => [row.id, row]));
  const assets = new Map(data.assets.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  const tags = new Map(data.tags.map((row) => [row.id, row]));
  const profiles = new Map(
    data.fileImportProfiles.map((row) => [row.connectionId, row]),
  );
  const connections = new Map(
    data.externalConnections.map((row) => [row.id, row]),
  );
  const conditionRowsByRule = new Map<
    string,
    BackupData["automationRuleConditions"]
  >();
  const actionRowsByRule = new Map<
    string,
    BackupData["automationRuleActions"]
  >();
  for (const condition of data.automationRuleConditions) {
    const rows = conditionRowsByRule.get(condition.ruleId) ?? [];
    rows.push(condition);
    conditionRowsByRule.set(condition.ruleId, rows);
  }
  for (const action of data.automationRuleActions) {
    const rows = actionRowsByRule.get(action.ruleId) ?? [];
    rows.push(action);
    actionRowsByRule.set(action.ruleId, rows);
  }
  const ruleIds = new Set(data.automationRules.map((row) => row.id));
  for (const condition of data.automationRuleConditions) {
    if (!ruleIds.has(condition.ruleId)) {
      fail(
        "BACKUP_AUTOMATION_RELATION_INVALID",
        `Automation condition ${condition.id} references a missing rule.`,
      );
    }
  }
  for (const action of data.automationRuleActions) {
    if (!ruleIds.has(action.ruleId)) {
      fail(
        "BACKUP_AUTOMATION_RELATION_INVALID",
        `Automation action ${action.id} references a missing rule.`,
      );
    }
  }
  const enabledCounts = new Map<string, number>();
  for (const row of data.automationRules) {
    if (!books.has(row.bookId)) {
      fail(
        "BACKUP_AUTOMATION_BOOK_INVALID",
        `Automation rule ${row.id} references a missing book.`,
      );
    }
    if (row.isEnabled) {
      enabledCounts.set(row.bookId, (enabledCounts.get(row.bookId) ?? 0) + 1);
    }
    const conditionRows = conditionRowsByRule.get(row.id) ?? [];
    const actionRows = actionRowsByRule.get(row.id) ?? [];
    if (
      conditionRows.length < 1 ||
      conditionRows.length > 50 ||
      actionRows.length < 1 ||
      actionRows.length > 20
    ) {
      fail(
        "BACKUP_AUTOMATION_SHAPE_INVALID",
        `Automation rule ${row.id} has an invalid condition or action count.`,
      );
    }
    const conditions: AutomationRule["conditions"] = conditionRows.map(
      (condition) => {
        if (
          !automationOperatorIsCompatible(condition.field, condition.operator)
        ) {
          fail(
            "BACKUP_AUTOMATION_OPERATOR_INVALID",
            `Automation condition ${condition.id} has an incompatible operator.`,
          );
        }
        const value = parseAutomationJson(
          condition.valueJson,
          `Automation condition ${condition.id}`,
        );
        if (condition.field === "amount_abs") {
          const decimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
          if (condition.operator === "between") {
            if (
              value === null ||
              typeof value !== "object" ||
              Array.isArray(value) ||
              Object.keys(value).sort().join(",") !== "max,min"
            ) {
              fail(
                "BACKUP_AUTOMATION_VALUE_INVALID",
                `Automation condition ${condition.id} requires only min and max.`,
              );
            }
            const range = value as Record<string, unknown>;
            if (
              typeof range.min !== "string" ||
              typeof range.max !== "string" ||
              !decimal.test(range.min) ||
              !decimal.test(range.max) ||
              compareUnsignedDecimalText(range.min, range.max) > 0
            ) {
              fail(
                "BACKUP_AUTOMATION_VALUE_INVALID",
                `Automation condition ${condition.id} has an invalid amount range.`,
              );
            }
          } else if (typeof value !== "string" || !decimal.test(value)) {
            fail(
              "BACKUP_AUTOMATION_VALUE_INVALID",
              `Automation condition ${condition.id} has an invalid amount value.`,
            );
          }
        } else if (typeof value !== "string" || value.length > 500) {
          fail(
            "BACKUP_AUTOMATION_VALUE_INVALID",
            `Automation condition ${condition.id} must contain bounded text.`,
          );
        }
        if (
          (condition.operator === "is_empty" ||
            condition.operator === "is_not_empty") &&
          value !== ""
        ) {
          fail(
            "BACKUP_AUTOMATION_VALUE_INVALID",
            `Automation emptiness condition ${condition.id} must store an empty string.`,
          );
        }
        if (condition.field === "source_format") {
          if (!["csv", "ofx", "qfx", "camt053"].includes(value as string)) {
            fail(
              "BACKUP_AUTOMATION_VALUE_INVALID",
              `Automation condition ${condition.id} has an invalid source format.`,
            );
          }
        } else if (condition.field === "direction") {
          if (value !== "in" && value !== "out") {
            fail(
              "BACKUP_AUTOMATION_VALUE_INVALID",
              `Automation condition ${condition.id} has an invalid direction.`,
            );
          }
        } else if (condition.field === "identity_strength") {
          if (value !== "strong" && value !== "weak") {
            fail(
              "BACKUP_AUTOMATION_VALUE_INVALID",
              `Automation condition ${condition.id} has invalid identity strength.`,
            );
          }
        } else if (condition.field === "file_profile") {
          const profile = profiles.get(value as string);
          const connection = profile
            ? connections.get(profile.connectionId)
            : undefined;
          if (
            !profile ||
            connection?.provider !== "file_import" ||
            connection.bookId !== row.bookId ||
            (row.isEnabled && !connection.isEnabled)
          ) {
            fail(
              "BACKUP_AUTOMATION_REFERENCE_INVALID",
              `Automation condition ${condition.id} has an invalid file profile.`,
            );
          }
        } else if (condition.field === "target_account") {
          const account = accounts.get(value as string);
          const asset = account ? assets.get(account.assetId) : undefined;
          if (
            !account ||
            account.bookId !== row.bookId ||
            (row.isEnabled && (account.isArchived || asset?.isArchived))
          ) {
            fail(
              "BACKUP_AUTOMATION_REFERENCE_INVALID",
              `Automation condition ${condition.id} has an invalid target account.`,
            );
          }
        }
        return {
          id: condition.id,
          position: condition.position,
          field: condition.field,
          operator: condition.operator,
          value,
          isNegated: condition.isNegated,
        };
      },
    );
    const hydrated: AutomationRule = {
      ...row,
      conditions,
      actions: [],
    };
    let directions: Array<"in" | "out">;
    try {
      directions = possibleRuleDirections(hydrated);
    } catch {
      fail(
        "BACKUP_AUTOMATION_DIRECTION_INVALID",
        `Automation rule ${row.id} has invalid direction conditions.`,
      );
    }
    hydrated.actions = actionRows.map((action) => {
      const value = parseAutomationJson(
        action.valueJson,
        `Automation action ${action.id}`,
      );
      if (typeof value !== "string") {
        fail(
          "BACKUP_AUTOMATION_VALUE_INVALID",
          `Automation action ${action.id} must contain text.`,
        );
      }
      const max =
        action.actionType === "set_note" || action.actionType === "append_note"
          ? 2000
          : action.actionType === "suggest_event_type"
            ? 20
            : 200;
      if (value.length > max) {
        fail(
          "BACKUP_AUTOMATION_VALUE_INVALID",
          `Automation action ${action.id} exceeds its text bound.`,
        );
      }
      if (action.actionType === "set_category") {
        const category = categories.get(value);
        const compatible = category
          ? directions.every(
              (direction) =>
                category.categoryType === "both" ||
                category.categoryType ===
                  (direction === "out" ? "expense" : "income"),
            )
          : false;
        if (
          !category ||
          category.bookId !== row.bookId ||
          !compatible ||
          (row.isEnabled && category.isArchived)
        ) {
          fail(
            "BACKUP_AUTOMATION_REFERENCE_INVALID",
            `Automation action ${action.id} has an invalid category.`,
          );
        }
      } else if (action.actionType === "add_tag") {
        const tag = tags.get(value);
        if (
          !tag ||
          tag.bookId !== row.bookId ||
          (row.isEnabled && tag.isArchived)
        ) {
          fail(
            "BACKUP_AUTOMATION_REFERENCE_INVALID",
            `Automation action ${action.id} has an invalid tag.`,
          );
        }
      } else if (action.actionType === "suggest_event_type") {
        const requiredDirection = value === "expense" ? "out" : "in";
        if (
          (value !== "expense" && value !== "income") ||
          directions.length === 0 ||
          !directions.every((direction) => direction === requiredDirection)
        ) {
          fail(
            "BACKUP_AUTOMATION_DIRECTION_INVALID",
            `Automation action ${action.id} has an unsafe event-type suggestion.`,
          );
        }
      }
      return {
        id: action.id,
        position: action.position,
        actionType: action.actionType,
        value,
      };
    });
  }
  if ([...enabledCounts.values()].some((count) => count > 1000)) {
    fail(
      "BACKUP_AUTOMATION_LIMIT",
      "A backup cannot enable more than 1000 rules in one book.",
    );
  }

  uniqueBy(data.recurringItems, (row) => row.id, "recurring item id");
  uniqueBy(
    data.recurringItemTags,
    (row) => `${row.recurringItemId}\u0000${row.tagId}`,
    "recurring item tag",
  );
  uniqueBy(
    data.recurringOccurrenceLinks,
    (row) => `${row.recurringItemId}\u0000${row.occurrenceDate}`,
    "recurring occurrence link",
  );
  uniqueBy(
    data.recurringOccurrenceLinks,
    (row) => row.ledgerEventId,
    "recurring linked Ledger event",
  );
  uniqueBy(
    data.recurringOccurrenceSkips,
    (row) => `${row.recurringItemId}\u0000${row.occurrenceDate}`,
    "recurring occurrence skip",
  );
  const itemTagIds = new Map<string, string[]>();
  for (const link of data.recurringItemTags) {
    const values = itemTagIds.get(link.recurringItemId) ?? [];
    values.push(link.tagId);
    itemTagIds.set(link.recurringItemId, values);
  }
  const recurringById = new Map<string, RecurringItem>();
  for (const row of data.recurringItems) {
    const account = accounts.get(row.accountId);
    const asset = assets.get(row.assetId);
    const category = row.categoryId ? categories.get(row.categoryId) : null;
    const tagIds = itemTagIds.get(row.id) ?? [];
    if (
      !books.has(row.bookId) ||
      !account ||
      account.bookId !== row.bookId ||
      account.assetId !== row.assetId ||
      !asset
    ) {
      fail(
        "BACKUP_RECURRING_RELATION_INVALID",
        `Recurring item ${row.id} has an invalid book, account, or asset.`,
      );
    }
    if (row.isActive && (account.isArchived || asset.isArchived)) {
      fail(
        "BACKUP_RECURRING_REFERENCE_ARCHIVED",
        `Active recurring item ${row.id} uses an archived account or asset.`,
      );
    }
    if (
      category &&
      (category.bookId !== row.bookId ||
        (category.categoryType !== "both" &&
          category.categoryType !== row.eventType) ||
        (row.isActive && category.isArchived))
    ) {
      fail(
        "BACKUP_RECURRING_CATEGORY_INVALID",
        `Recurring item ${row.id} has an invalid category.`,
      );
    }
    if (row.categoryId && !category) {
      fail(
        "BACKUP_RECURRING_CATEGORY_INVALID",
        `Recurring item ${row.id} references a missing category.`,
      );
    }
    for (const tagId of tagIds) {
      const tag = tags.get(tagId);
      if (
        !tag ||
        tag.bookId !== row.bookId ||
        (row.isActive && tag.isArchived)
      ) {
        fail(
          "BACKUP_RECURRING_TAG_INVALID",
          `Recurring item ${row.id} has an invalid tag.`,
        );
      }
    }
    const item: RecurringItem = {
      id: row.id,
      bookId: row.bookId,
      accountId: row.accountId,
      assetId: row.assetId,
      name: row.name,
      eventType: row.eventType,
      payeeText: row.payeeText,
      payeeMatchMode: row.payeeMatchMode,
      categoryId: row.categoryId,
      tagIds,
      note: row.note,
      amountMode: row.amountMode,
      amountAtomic:
        row.amountAtomicText === null
          ? null
          : parsePositiveAtomicText(row.amountAtomicText),
      toleranceBps: row.toleranceBps,
      minAmountAtomic:
        row.minAmountAtomicText === null
          ? null
          : parsePositiveAtomicText(row.minAmountAtomicText),
      maxAmountAtomic:
        row.maxAmountAtomicText === null
          ? null
          : parsePositiveAtomicText(row.maxAmountAtomicText),
      frequency: row.frequency,
      intervalCount: row.intervalCount,
      anchorDate: row.anchorDate,
      monthlyDayMode: row.monthlyDayMode,
      dateWindowBeforeDays: row.dateWindowBeforeDays,
      dateWindowAfterDays: row.dateWindowAfterDays,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      isActive: row.isActive,
    };
    try {
      validateRecurringItem(item);
    } catch {
      fail(
        "BACKUP_RECURRING_DEFINITION_INVALID",
        `Recurring item ${row.id} has invalid amount or recurrence fields.`,
      );
    }
    recurringById.set(row.id, item);
  }
  for (const link of data.recurringItemTags) {
    if (!recurringById.has(link.recurringItemId)) {
      fail(
        "BACKUP_RECURRING_RELATION_INVALID",
        `Recurring tag references missing item ${link.recurringItemId}.`,
      );
    }
  }
  const eventById = new Map(data.ledgerEvents.map((row) => [row.id, row]));
  const occurrenceKeys = new Set<string>();
  for (const link of data.recurringOccurrenceLinks) {
    const item = recurringById.get(link.recurringItemId);
    const event = eventById.get(link.ledgerEventId);
    const mainEntries = data.ledgerEntries.filter(
      (entry) =>
        entry.eventId === link.ledgerEventId && entry.entryRole === "main",
    );
    let generated = false;
    try {
      generated = Boolean(
        item &&
        isGeneratedOccurrence({ ...item, isActive: true }, link.occurrenceDate),
      );
    } catch {
      generated = false;
    }
    const amount =
      mainEntries.length === 1 ? BigInt(mainEntries[0]!.amountAtomic) : 0n;
    if (
      !item ||
      !generated ||
      !event ||
      event.bookId !== item.bookId ||
      event.eventType !== item.eventType ||
      mainEntries.length !== 1 ||
      mainEntries[0]!.accountId !== item.accountId ||
      (item.eventType === "expense" ? amount >= 0n : amount <= 0n)
    ) {
      fail(
        "BACKUP_RECURRING_LINK_INVALID",
        `Recurring occurrence link ${link.recurringItemId}/${link.occurrenceDate} is invalid.`,
      );
    }
    occurrenceKeys.add(`${link.recurringItemId}\u0000${link.occurrenceDate}`);
  }
  for (const skip of data.recurringOccurrenceSkips) {
    const item = recurringById.get(skip.recurringItemId);
    let generated = false;
    try {
      generated = Boolean(
        item &&
        isGeneratedOccurrence({ ...item, isActive: true }, skip.occurrenceDate),
      );
    } catch {
      generated = false;
    }
    const key = `${skip.recurringItemId}\u0000${skip.occurrenceDate}`;
    if (!item || !generated || occurrenceKeys.has(key)) {
      fail(
        "BACKUP_RECURRING_SKIP_INVALID",
        `Recurring occurrence skip ${skip.recurringItemId}/${skip.occurrenceDate} is invalid.`,
      );
    }
  }
}

function validateRelations(data: BackupData): void {
  uniqueBy(data.books, (row) => row.id, "book id");
  uniqueBy(data.assets, (row) => row.id, "asset id");
  uniqueBy(
    data.assets,
    (row) => row.code.toLocaleLowerCase("en-US"),
    "asset code",
  );
  uniqueBy(data.accounts, (row) => row.id, "account id");
  uniqueBy(data.categories, (row) => row.id, "category id");
  uniqueBy(data.tags, (row) => row.id, "tag id");
  uniqueBy(data.tags, (row) => `${row.bookId}\u0000${row.name}`, "tag name");
  uniqueBy(data.ledgerEvents, (row) => row.id, "event id");
  uniqueBy(data.ledgerEntries, (row) => row.id, "entry id");
  uniqueBy(
    data.eventTags,
    (row) => `${row.eventId}\u0000${row.tagId}`,
    "event-tag pair",
  );
  uniqueBy(data.balanceSnapshots, (row) => row.id, "snapshot id");
  uniqueBy(
    data.balanceSnapshots,
    (row) => `${row.accountId}\u0000${row.asOf}`,
    "account snapshot time",
  );
  uniqueBy(data.settings, (row) => row.key, "setting key");
  uniqueBy(
    data.bookValuationSettings,
    (row) => row.bookId,
    "book valuation setting",
  );
  uniqueBy(
    data.priceProviderMappings,
    (row) => `${row.assetId}\u0000${row.provider}`,
    "provider mapping",
  );
  uniqueBy(data.manualPriceQuotes, (row) => row.id, "manual quote id");
  uniqueBy(
    data.manualPriceQuotes.filter((row) => row.isActive),
    (row) => `${row.baseAssetId}\u0000${row.quoteAssetId}`,
    "active manual quote pair",
  );

  if (data.books.filter((book) => book.isDefault).length !== 1) {
    fail(
      "BACKUP_DEFAULT_BOOK",
      "Backup must contain exactly one default book.",
    );
  }
  const books = new Map(data.books.map((row) => [row.id, row]));
  const assets = new Map(data.assets.map((row) => [row.id, row]));
  const accounts = new Map(data.accounts.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  const tags = new Map(data.tags.map((row) => [row.id, row]));
  const events = new Map(data.ledgerEvents.map((row) => [row.id, row]));

  for (const category of data.categories) {
    if (!books.has(category.bookId)) {
      fail(
        "BACKUP_RELATION",
        `Category ${category.id} references a missing book.`,
      );
    }
    if (category.parentId) {
      const parent = categories.get(category.parentId);
      if (
        !parent ||
        parent.bookId !== category.bookId ||
        parent.id === category.id
      ) {
        fail(
          "BACKUP_CATEGORY_TREE",
          `Category ${category.id} has an invalid parent.`,
        );
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitCategory = (categoryId: string): void => {
    if (visiting.has(categoryId)) {
      fail(
        "BACKUP_CATEGORY_TREE",
        "Backup category hierarchy contains a cycle.",
      );
    }
    if (visited.has(categoryId)) {
      return;
    }
    visiting.add(categoryId);
    const parentId = categories.get(categoryId)?.parentId;
    if (parentId) {
      visitCategory(parentId);
    }
    visiting.delete(categoryId);
    visited.add(categoryId);
  };
  for (const category of data.categories) {
    visitCategory(category.id);
  }

  for (const tag of data.tags) {
    if (!books.has(tag.bookId)) {
      fail("BACKUP_RELATION", `Tag ${tag.id} references a missing book.`);
    }
  }
  for (const account of data.accounts) {
    if (!books.has(account.bookId) || !assets.has(account.assetId)) {
      fail(
        "BACKUP_RELATION",
        `Account ${account.id} has a missing book or asset.`,
      );
    }
  }
  for (const event of data.ledgerEvents) {
    if (!books.has(event.bookId)) {
      fail("BACKUP_RELATION", `Event ${event.id} references a missing book.`);
    }
    if (event.categoryId) {
      const category = categories.get(event.categoryId);
      if (!category || category.bookId !== event.bookId) {
        fail("BACKUP_RELATION", `Event ${event.id} has an invalid category.`);
      }
      if (
        (event.eventType === "expense" && category.categoryType === "income") ||
        (event.eventType === "income" && category.categoryType === "expense") ||
        event.eventType === "transfer" ||
        event.eventType === "exchange"
      ) {
        fail(
          "BACKUP_EVENT_INVARIANT",
          `Event ${event.id} category is not applicable.`,
        );
      }
    }
  }
  for (const entry of data.ledgerEntries) {
    const event = events.get(entry.eventId);
    const account = accounts.get(entry.accountId);
    if (!event || !account || event.bookId !== account.bookId) {
      fail(
        "BACKUP_RELATION",
        `Entry ${entry.id} has an invalid event or account.`,
      );
    }
  }
  for (const eventTag of data.eventTags) {
    const event = events.get(eventTag.eventId);
    const tag = tags.get(eventTag.tagId);
    if (!event || !tag || event.bookId !== tag.bookId) {
      fail(
        "BACKUP_RELATION",
        "Event-tag relation crosses a book or is missing.",
      );
    }
  }
  for (const snapshot of data.balanceSnapshots) {
    if (!accounts.has(snapshot.accountId)) {
      fail(
        "BACKUP_RELATION",
        `Snapshot ${snapshot.id} references a missing account.`,
      );
    }
  }
  for (const setting of data.settings) {
    if (setting.key === "app_timezone") {
      const value = JSON.parse(setting.valueJson) as unknown;
      if (typeof value !== "string") {
        fail(
          "BACKUP_SETTING_INVALID",
          "app_timezone setting must contain a JSON string.",
        );
      }
      try {
        assertIanaTimeZone(value);
      } catch {
        fail(
          "BACKUP_SETTING_INVALID",
          "app_timezone setting must contain a valid IANA timezone.",
        );
      }
    }
  }
  for (const setting of data.bookValuationSettings) {
    const homeAsset = assets.get(setting.homeAssetId);
    if (!books.has(setting.bookId) || !homeAsset) {
      fail(
        "BACKUP_VALUATION_RELATION",
        `Book valuation setting ${setting.bookId} has a missing book or Home Asset.`,
      );
    }
    if (homeAsset.assetType !== "fiat" || homeAsset.isArchived) {
      fail(
        "BACKUP_HOME_ASSET_INVALID",
        `Home Asset ${homeAsset.id} must be an active fiat asset.`,
      );
    }
  }
  for (const mapping of data.priceProviderMappings) {
    const asset = assets.get(mapping.assetId);
    if (!asset) {
      fail(
        "BACKUP_VALUATION_RELATION",
        `Provider mapping references missing asset ${mapping.assetId}.`,
      );
    }
    if (
      (mapping.provider === "coingecko" && asset.assetType !== "crypto") ||
      (mapping.provider === "ecb" && asset.assetType !== "fiat")
    ) {
      fail(
        "BACKUP_PROVIDER_MAPPING_INVALID",
        `Provider mapping for ${asset.code} does not match its asset type.`,
      );
    }
    if (
      mapping.provider === "ecb" &&
      !/^[A-Z]{3}$/.test(mapping.providerAssetKey)
    ) {
      fail(
        "BACKUP_PROVIDER_MAPPING_INVALID",
        `ECB provider mapping for ${asset.code} must use a three-letter currency code.`,
      );
    }
  }
  for (const quote of data.manualPriceQuotes) {
    if (
      !assets.has(quote.baseAssetId) ||
      !assets.has(quote.quoteAssetId) ||
      quote.baseAssetId === quote.quoteAssetId
    ) {
      fail(
        "BACKUP_MANUAL_QUOTE_INVALID",
        `Manual quote ${quote.id} has an invalid asset pair.`,
      );
    }
    try {
      normalizePositiveDecimalText(quote.rateText);
    } catch {
      fail(
        "BACKUP_MANUAL_QUOTE_INVALID",
        `Manual quote ${quote.id} has an invalid rate.`,
      );
    }
  }
  validateEventEntries(data);
  validateExternalRelations(data);
  validateAutomationAndRecurring(data);
}

const LEGACY_PROVIDER_MAPPINGS = [
  ["CNY", "fiat", "ecb", "CNY"],
  ["USD", "fiat", "ecb", "USD"],
  ["EUR", "fiat", "ecb", "EUR"],
  ["HKD", "fiat", "ecb", "HKD"],
  ["USDT", "crypto", "coingecko", "tether"],
  ["USDC", "crypto", "coingecko", "usd-coin"],
  ["BTC", "crypto", "coingecko", "bitcoin"],
  ["ETH", "crypto", "coingecko", "ethereum"],
  ["SOL", "crypto", "coingecko", "solana"],
] as const;

function upgradeLegacyBackup(payload: LegacyBackupPayload): V2BackupPayload {
  const defaultBook = payload.data.books.find((book) => book.isDefault);
  const activeFiat = payload.data.assets
    .filter((asset) => asset.assetType === "fiat" && !asset.isArchived)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.code.localeCompare(right.code) ||
        left.id.localeCompare(right.id),
    );
  const homeAsset =
    activeFiat.find((asset) => asset.code.toUpperCase() === "CNY") ??
    activeFiat.find((asset) => asset.code.toUpperCase() === "USD") ??
    activeFiat[0];
  const inferredMappings: BackupData["priceProviderMappings"] = [];
  for (const [
    code,
    expectedType,
    provider,
    providerAssetKey,
  ] of LEGACY_PROVIDER_MAPPINGS) {
    const asset = payload.data.assets.find(
      (candidate) =>
        candidate.code.toUpperCase() === code &&
        candidate.assetType === expectedType,
    );
    if (asset) {
      inferredMappings.push({
        assetId: asset.id,
        provider,
        providerAssetKey,
        isEnabled: true,
        priority: 100,
        createdAt: payload.exportedAt,
        updatedAt: payload.exportedAt,
      });
    }
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_V2_SCHEMA_VERSION,
    exportedAt: payload.exportedAt,
    data: {
      ...payload.data,
      bookValuationSettings:
        defaultBook && homeAsset
          ? [
              {
                bookId: defaultBook.id,
                homeAssetId: homeAsset.id,
                createdAt: payload.exportedAt,
                updatedAt: payload.exportedAt,
              },
            ]
          : [],
      priceProviderMappings: inferredMappings,
      manualPriceQuotes: [],
    },
  };
}

function upgradeV2Backup(payload: V2BackupPayload): V3BackupPayload {
  return {
    ...payload,
    schemaVersion: BACKUP_V3_SCHEMA_VERSION,
    data: {
      ...payload.data,
      externalConnections: [],
      externalAssetMappings: [],
      externalAccountMappings: [],
      externalBalanceObservations: [],
      externalSourceObjects: [],
      externalTransactionCandidates: [],
      externalCandidateSourceObjects: [],
      externalTransactionLegs: [],
      externalImportLinks: [],
    },
  };
}

function upgradeV3Backup(payload: V3BackupPayload): V4BackupPayload {
  return {
    ...payload,
    schemaVersion: BACKUP_V4_SCHEMA_VERSION,
    data: {
      ...payload.data,
      externalConnections: payload.data.externalConnections.map(
        (connection) => ({
          ...connection,
          sourceKey: "kraken:primary" as const,
        }),
      ),
      evmWalletConnections: [],
      evmBalanceObservationDetails: [],
      evmCandidateDetails: [],
    },
  };
}

function upgradeV4Backup(payload: V4BackupPayload): V5BackupPayload {
  return {
    ...payload,
    schemaVersion: BACKUP_V5_SCHEMA_VERSION,
    data: {
      ...payload.data,
      evmWalletConnections: payload.data.evmWalletConnections.map((wallet) => ({
        ...wallet,
        chainId: 1 as const,
        networkId: "eth-mainnet" as const,
        dataProvider: "alchemy" as const,
      })),
      evmBalanceObservationDetails:
        payload.data.evmBalanceObservationDetails.map((detail) => ({
          ...detail,
          chainId: 1 as const,
        })),
      evmCandidateDetails: payload.data.evmCandidateDetails.map((detail) => ({
        ...detail,
        chainId: 1 as const,
        nativeTraceStatus: "not_required" as const,
      })),
      evmL2GasFeeDetails: [],
    },
  };
}

function upgradeV5Backup(payload: V5BackupPayload): V6BackupPayload {
  return {
    ...payload,
    schemaVersion: BACKUP_V6_SCHEMA_VERSION,
    data: {
      ...payload.data,
      fileImportProfiles: [],
      fileImportBatches: [],
      fileImportSourceDetails: [],
      fileImportBatchSourceObjects: [],
      fileImportCandidateDetails: [],
      externalCandidateMatchLinks: [],
      fileImportBalanceObservationDetails: [],
    },
  };
}

function upgradeV6Backup(payload: V6BackupPayload): BackupPayload {
  return {
    ...payload,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    data: {
      ...payload.data,
      automationRules: [],
      automationRuleConditions: [],
      automationRuleActions: [],
      recurringItems: [],
      recurringItemTags: [],
      recurringOccurrenceLinks: [],
      recurringOccurrenceSkips: [],
    },
  };
}

function schemaFailure(result: z.ZodSafeParseError<unknown>): never {
  const issue = result.error.issues[0];
  throw new BackupValidationError(
    "BACKUP_SCHEMA_INVALID",
    `Backup schema is invalid at ${issue?.path.join(".") || "root"}: ${
      issue?.message ?? "unknown error"
    }`,
  );
}

export function parseBackupPayload(value: unknown): BackupPayload {
  const schemaVersion =
    value && typeof value === "object" && "schemaVersion" in value
      ? (value as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  let normalized: BackupPayload;
  if (schemaVersion === BACKUP_LEGACY_SCHEMA_VERSION) {
    const legacy = legacyBackupPayloadSchema.safeParse(value);
    if (!legacy.success) schemaFailure(legacy);
    normalized = upgradeV6Backup(
      upgradeV5Backup(
        upgradeV4Backup(
          upgradeV3Backup(upgradeV2Backup(upgradeLegacyBackup(legacy.data))),
        ),
      ),
    );
  } else if (schemaVersion === BACKUP_V2_SCHEMA_VERSION) {
    const v2 = v2BackupPayloadSchema.safeParse(value);
    if (!v2.success) schemaFailure(v2);
    normalized = upgradeV6Backup(
      upgradeV5Backup(
        upgradeV4Backup(upgradeV3Backup(upgradeV2Backup(v2.data))),
      ),
    );
  } else if (schemaVersion === BACKUP_V3_SCHEMA_VERSION) {
    const v3 = v3BackupPayloadSchema.safeParse(value);
    if (!v3.success) schemaFailure(v3);
    normalized = upgradeV6Backup(
      upgradeV5Backup(upgradeV4Backup(upgradeV3Backup(v3.data))),
    );
  } else if (schemaVersion === BACKUP_V4_SCHEMA_VERSION) {
    const v4 = v4BackupPayloadSchema.safeParse(value);
    if (!v4.success) schemaFailure(v4);
    normalized = upgradeV6Backup(upgradeV5Backup(upgradeV4Backup(v4.data)));
  } else if (schemaVersion === BACKUP_V5_SCHEMA_VERSION) {
    const v5 = v5BackupPayloadSchema.safeParse(value);
    if (!v5.success) schemaFailure(v5);
    normalized = upgradeV6Backup(upgradeV5Backup(v5.data));
  } else if (schemaVersion === BACKUP_V6_SCHEMA_VERSION) {
    const v6 = v6BackupPayloadSchema.safeParse(value);
    if (!v6.success) schemaFailure(v6);
    normalized = upgradeV6Backup(v6.data);
  } else {
    const v7 = backupPayloadSchema.safeParse(value);
    if (!v7.success) schemaFailure(v7);
    normalized = v7.data;
  }
  validateRelations(normalized.data);
  return normalized;
}

export function categoriesParentFirst(
  categories: readonly BackupData["categories"][number][],
): BackupData["categories"] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const ordered: BackupData["categories"] = [];
  const visited = new Set<string>();
  const visit = (category: BackupData["categories"][number]): void => {
    if (visited.has(category.id)) {
      return;
    }
    if (category.parentId) {
      visit(byId.get(category.parentId)!);
    }
    visited.add(category.id);
    ordered.push(category);
  };
  for (const category of categories) {
    visit(category);
  }
  return ordered;
}
