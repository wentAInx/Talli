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
  externalDecimalToAtomic,
  validatedExternalDecimalText,
} from "./external-sync";
import {
  EVM_ALCHEMY_CREDENTIAL_REF,
  evmGasStableKey,
  evmMovementStableKey,
  evmWalletSourceKey,
  normalizeEvmAddress,
  normalizeEvmTxHash,
  parseEvmAssetKey,
} from "./evm";
import { assertIanaTimeZone, canonicalUtcInstantValue } from "./time";
import type { LedgerEntryDraft } from "./types";

export const BACKUP_FORMAT = "multi-asset-ledger-backup";
export const BACKUP_LEGACY_SCHEMA_VERSION = 1;
export const BACKUP_V2_SCHEMA_VERSION = 2;
export const BACKUP_V3_SCHEMA_VERSION = 3;
export const BACKUP_SCHEMA_VERSION = 4;

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

const evmWalletConnectionSchema = z
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

const evmBalanceObservationDetailSchema = z
  .object({
    observationId: id,
    chainId: z
      .number()
      .int()
      .refine((value): boolean => value === 1),
    assetKind: z.enum(["native", "erc20"]),
    contractAddressLower: z.string().nullable(),
    rawAmountAtomicText: z.string().regex(/^\d+$/),
    tokenDecimals: z.number().int().min(0).max(255),
    syncHeadBlockText: z.string().regex(/^\d+$/).nullable(),
  })
  .strict();

const evmCandidateDetailSchema = z
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
    evmWalletConnections: z.array(evmWalletConnectionSchema),
    evmBalanceObservationDetails: z.array(evmBalanceObservationDetailSchema),
    evmCandidateDetails: z.array(evmCandidateDetailSchema),
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

export const backupPayloadSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    exportedAt: canonicalInstant,
    data: v4DataSchema,
  })
  .strict();

export type BackupPayload = z.infer<typeof backupPayloadSchema>;
export type BackupData = BackupPayload["data"];
type LegacyBackupPayload = z.infer<typeof legacyBackupPayloadSchema>;
type V2BackupPayload = z.infer<typeof v2BackupPayloadSchema>;
type V3BackupPayload = z.infer<typeof v3BackupPayloadSchema>;

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
    data.externalAccountMappings,
    (row) => row.talliAccountId,
    "externally mapped Talli account",
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
  const mappingKey = (connectionId: string, providerAssetKey: string) =>
    `${connectionId}\u0000${providerAssetKey}`;
  const mappings = new Map(
    data.externalAssetMappings.map((row) => [
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
  const importLinks = new Map(
    data.externalImportLinks.map((row) => [row.candidateId, row]),
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
    } else {
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
          connection.sourceKey !== evmWalletSourceKey(wallet.addressLower)
        ) {
          throw new Error("identity mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_IDENTITY_INVALID",
          `EVM connection ${connection.id} has inconsistent mainnet identity.`,
        );
      }
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
        parseEvmAssetKey(mapping.providerAssetKey);
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
        if (
          asset.kind !== detail.assetKind ||
          asset.contractAddressLower !== detail.contractAddressLower
        ) {
          throw new Error("asset mismatch");
        }
      } catch {
        fail(
          "BACKUP_EVM_ASSET_KEY_INVALID",
          `EVM observation ${observation.id} has inconsistent asset identity.`,
        );
      }
    } else if (evmObservationDetails.has(observation.id)) {
      fail(
        "BACKUP_EVM_RELATION",
        `Non-EVM observation ${observation.id} contains EVM details.`,
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
    if ((connection.provider === "kraken") !== isKrakenSource) {
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
        const expectedStableKey =
          evmDetail.candidateKind === "gas"
            ? evmGasStableKey(txHash)
            : evmMovementStableKey(txHash);
        if (
          txHash !== evmDetail.txHash ||
          candidate.stableKey !== expectedStableKey ||
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
    } else if (evmDetail || !candidate.stableKey.startsWith("kraken:")) {
      fail(
        "BACKUP_EXTERNAL_CANDIDATE_INVALID",
        `Kraken candidate ${candidate.id} has an invalid namespace or subtype.`,
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
    if (
      (candidate.status === "imported" ||
        candidate.status === "source_changed") !== hasImport
    ) {
      fail(
        "BACKUP_EXTERNAL_IMPORT_STATE_INVALID",
        `External candidate ${candidate.id} import status and provenance disagree.`,
      );
    }
  }
  for (const detail of data.evmCandidateDetails) {
    const candidate = candidates.get(detail.candidateId);
    if (
      !candidate ||
      connections.get(candidate.connectionId)?.provider !== "evm_wallet" ||
      (detail.candidateKind === "gas") !==
        (detail.classification === "gas_only")
    ) {
      fail(
        "BACKUP_EVM_RELATION",
        `EVM candidate detail ${detail.candidateId} is orphaned or inconsistent.`,
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
        parseEvmAssetKey(leg.providerAssetKey);
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

function upgradeV3Backup(payload: V3BackupPayload): BackupPayload {
  return {
    ...payload,
    schemaVersion: BACKUP_SCHEMA_VERSION,
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
    normalized = upgradeV3Backup(
      upgradeV2Backup(upgradeLegacyBackup(legacy.data)),
    );
  } else if (schemaVersion === BACKUP_V2_SCHEMA_VERSION) {
    const v2 = v2BackupPayloadSchema.safeParse(value);
    if (!v2.success) schemaFailure(v2);
    normalized = upgradeV3Backup(upgradeV2Backup(v2.data));
  } else if (schemaVersion === BACKUP_V3_SCHEMA_VERSION) {
    const v3 = v3BackupPayloadSchema.safeParse(value);
    if (!v3.success) schemaFailure(v3);
    normalized = upgradeV3Backup(v3.data);
  } else {
    const v4 = backupPayloadSchema.safeParse(value);
    if (!v4.success) schemaFailure(v4);
    normalized = v4.data;
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
