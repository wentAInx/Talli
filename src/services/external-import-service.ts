import { createHash } from "node:crypto";

import type { DatabaseContext, DatabaseExecutor } from "../db/connection";
import {
  findAccountWithAsset,
  findExternalAccountMapping,
  findExternalAssetMapping,
  findExternalCandidate,
  findExternalConnection,
  findExternalImportLink,
  findExternalSourceObjectById,
  insertExternalImportLink,
  listExternalCandidateLegs,
  listExternalCandidateSourceLinks,
  updateExternalCandidate,
} from "../db/queries";
import {
  canonicalExternalDecimalText,
  canonicalExternalJson,
} from "../domain/external-sync";
import { krakenReportedNonzeroTradeFee } from "../providers/kraken/candidates";
import type { LedgerMutationInput, OptionalFeeInput } from "./contracts";
import { assertService } from "./errors";
import { createLedgerEventIn } from "./ledger-command-service";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

export interface CandidateImportInput {
  candidateId: string;
  chosenEventType: "expense" | "income" | "transfer" | "exchange";
  sourceAccountId?: string;
  destinationAccountId?: string;
  mainAccountId?: string;
  feeAccountId?: string | null;
  ignoreUnresolvedFee?: boolean;
  categoryId?: string | null;
  note?: string | null;
  confirmed: true;
}

function magnitudeText(value: string): string {
  return canonicalExternalDecimalText(value).replace(/^[+-]/, "");
}

function requireAccountForProviderLeg(input: {
  executor: DatabaseExecutor;
  connectionId: string;
  providerAssetKey: string;
  accountId: string | undefined;
  role: string;
}): void {
  assertService(
    input.accountId,
    "EXTERNAL_IMPORT_ACCOUNT_REQUIRED",
    `Select a Talli account for the ${input.role} leg.`,
  );
  const mapping = findExternalAssetMapping(
    input.executor,
    input.connectionId,
    input.providerAssetKey,
  );
  const accountMapping = findExternalAccountMapping(
    input.executor,
    input.connectionId,
    input.providerAssetKey,
  );
  assertService(
    mapping?.mappingStatus === "mapped" &&
      mapping.talliAssetId &&
      accountMapping?.isEnabled,
    "EXTERNAL_IMPORT_MAPPING_REQUIRED",
    "Every imported leg requires an active asset and account mapping.",
  );
  assertService(
    accountMapping.talliAccountId === input.accountId,
    "EXTERNAL_IMPORT_ACCOUNT_MAPPING_MISMATCH",
    "Selected account must match the provider account mapping.",
  );
  const account = findAccountWithAsset(input.executor, input.accountId);
  assertService(
    account && !account.account.isArchived && !account.asset.isArchived,
    "EXTERNAL_IMPORT_ACCOUNT_UNAVAILABLE",
    "Selected import account and asset must be active.",
  );
  assertService(
    account.account.assetId === mapping.talliAssetId,
    "EXTERNAL_IMPORT_ASSET_MISMATCH",
    "Selected import account must use the mapped asset.",
  );
}

function explicitUnresolvedFeeAmount(
  executor: DatabaseExecutor,
  candidateId: string,
): string | null {
  const sources = listExternalCandidateSourceLinks(executor, candidateId)
    .filter((link) => link.relation === "primary")
    .map((link) => findExternalSourceObjectById(executor, link.sourceObjectId))
    .filter((source) => source?.objectType === "kraken_trade");
  if (sources.length !== 1) return null;
  return krakenReportedNonzeroTradeFee(sources[0]!);
}

function prepareCommand(
  executor: DatabaseExecutor,
  input: CandidateImportInput,
): { command: LedgerMutationInput; sourceFingerprint: string } {
  assertService(
    input.confirmed === true,
    "EXTERNAL_IMPORT_CONFIRMATION_REQUIRED",
    "Import requires explicit confirmation.",
  );
  const candidate = findExternalCandidate(executor, input.candidateId);
  assertService(
    candidate,
    "EXTERNAL_CANDIDATE_NOT_FOUND",
    "External candidate was not found.",
  );
  assertService(
    !findExternalImportLink(executor, input.candidateId),
    "EXTERNAL_CANDIDATE_ALREADY_IMPORTED",
    "Candidate has already been imported.",
  );
  assertService(
    candidate.status === "pending" || candidate.status === "needs_mapping",
    "EXTERNAL_CANDIDATE_NOT_IMPORTABLE",
    "Candidate is not available for import.",
  );
  const connection = findExternalConnection(executor, candidate.connectionId);
  assertService(
    connection,
    "EXTERNAL_CONNECTION_NOT_FOUND",
    "External connection was not found.",
  );
  const legs = listExternalCandidateLegs(executor, candidate.id);
  const source = legs.find((leg) => leg.role === "source");
  const destination = legs.find((leg) => leg.role === "destination");
  const external = legs.find(
    (leg) => leg.role === "external_in" || leg.role === "external_out",
  );
  const feeLeg = legs.find((leg) => leg.role === "fee");

  let fee: OptionalFeeInput | null = null;
  if (feeLeg) {
    assertService(
      input.ignoreUnresolvedFee !== true,
      "EXTERNAL_IMPORT_FEE_IGNORE_INVALID",
      "A fee with explicit asset evidence cannot be ignored.",
    );
    assertService(
      input.feeAccountId,
      "EXTERNAL_IMPORT_FEE_ACCOUNT_REQUIRED",
      "Select the mapped fee account before importing.",
    );
    requireAccountForProviderLeg({
      executor,
      connectionId: candidate.connectionId,
      providerAssetKey: feeLeg.providerAssetKey,
      accountId: input.feeAccountId,
      role: "fee",
    });
    fee = {
      accountId: input.feeAccountId,
      amount: magnitudeText(feeLeg.amountText),
    };
  } else {
    const amount = explicitUnresolvedFeeAmount(executor, candidate.id);
    if (amount) {
      assertService(
        !(input.feeAccountId && input.ignoreUnresolvedFee),
        "EXTERNAL_IMPORT_FEE_CHOICE_CONFLICT",
        "Choose a fee account or explicitly ignore the unresolved fee, not both.",
      );
      assertService(
        input.feeAccountId || input.ignoreUnresolvedFee === true,
        "EXTERNAL_IMPORT_FEE_UNRESOLVED",
        "Kraken reported a nonzero fee. Select a Talli fee account or explicitly confirm that the fee should not be imported.",
      );
      if (input.feeAccountId) {
        const feeAccount = findAccountWithAsset(executor, input.feeAccountId);
        assertService(
          feeAccount &&
            !feeAccount.account.isArchived &&
            !feeAccount.asset.isArchived &&
            feeAccount.account.bookId === connection.bookId,
          "EXTERNAL_IMPORT_FEE_ACCOUNT_INVALID",
          "Selected manual fee account must be active and in the connection book.",
        );
        fee = {
          accountId: input.feeAccountId,
          amount: magnitudeText(amount),
        };
      }
    } else {
      assertService(
        !input.feeAccountId && input.ignoreUnresolvedFee !== true,
        "EXTERNAL_IMPORT_FEE_UNAVAILABLE",
        "Candidate has no unresolved fee to resolve or ignore.",
      );
    }
  }

  const common = {
    occurredAt: candidate.occurredAt,
    note: input.note ?? null,
    tagIds: [] as string[],
  };
  let command: LedgerMutationInput;
  if (input.chosenEventType === "exchange") {
    assertService(
      source && destination,
      "EXTERNAL_IMPORT_LEGS_INVALID",
      "Exchange import requires source and destination legs.",
    );
    requireAccountForProviderLeg({
      executor,
      connectionId: candidate.connectionId,
      providerAssetKey: source.providerAssetKey,
      accountId: input.sourceAccountId,
      role: "source",
    });
    requireAccountForProviderLeg({
      executor,
      connectionId: candidate.connectionId,
      providerAssetKey: destination.providerAssetKey,
      accountId: input.destinationAccountId,
      role: "destination",
    });
    command = {
      eventType: "exchange",
      input: {
        ...common,
        sourceAccountId: input.sourceAccountId!,
        sourceAmount: magnitudeText(source.amountText),
        destinationAccountId: input.destinationAccountId!,
        destinationAmount: magnitudeText(destination.amountText),
        fee,
      },
    };
  } else if (input.chosenEventType === "transfer") {
    assertService(
      external,
      "EXTERNAL_IMPORT_LEGS_INVALID",
      "Transfer import requires an external balance leg.",
    );
    assertService(
      input.sourceAccountId && input.destinationAccountId,
      "EXTERNAL_IMPORT_TRANSFER_ACCOUNTS_REQUIRED",
      "Transfer import requires both source and destination accounts.",
    );
    const mappedAccountId =
      external.role === "external_in"
        ? input.destinationAccountId
        : input.sourceAccountId;
    requireAccountForProviderLeg({
      executor,
      connectionId: candidate.connectionId,
      providerAssetKey: external.providerAssetKey,
      accountId: mappedAccountId,
      role: external.role,
    });
    command = {
      eventType: "transfer",
      input: {
        ...common,
        sourceAccountId: input.sourceAccountId!,
        destinationAccountId: input.destinationAccountId!,
        amount: magnitudeText(external.amountText),
        fee,
      },
    };
  } else {
    const main = external ?? source ?? destination;
    assertService(
      main,
      "EXTERNAL_IMPORT_LEGS_INVALID",
      "Income or expense import requires one main amount leg.",
    );
    requireAccountForProviderLeg({
      executor,
      connectionId: candidate.connectionId,
      providerAssetKey: main.providerAssetKey,
      accountId: input.mainAccountId,
      role: "main",
    });
    command = {
      eventType: input.chosenEventType,
      input: {
        ...common,
        accountId: input.mainAccountId!,
        amount: magnitudeText(main.amountText),
        categoryId: input.categoryId ?? null,
        payee: "Kraken",
      },
    };
  }
  return { command, sourceFingerprint: candidate.sourceFingerprint };
}

export class ExternalImportService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async importCandidate(input: CandidateImportInput): Promise<{
    candidateId: string;
    ledgerEventId: string;
  }> {
    return this.context.db.transaction(
      (transaction) => {
        const prepared = prepareCommand(transaction, input);
        const ledgerEventId = createLedgerEventIn(
          transaction,
          this.runtime,
          prepared.command,
        );
        const importedAt = runtimeNow(this.runtime);
        const importPayload = canonicalExternalJson({
          candidateId: input.candidateId,
          chosenEventType: input.chosenEventType,
          sourceAccountId: input.sourceAccountId ?? null,
          destinationAccountId: input.destinationAccountId ?? null,
          mainAccountId: input.mainAccountId ?? null,
          feeAccountId: input.feeAccountId ?? null,
          ignoreUnresolvedFee: input.ignoreUnresolvedFee === true,
          categoryId: input.categoryId ?? null,
          note: input.note ?? null,
          sourceFingerprint: prepared.sourceFingerprint,
        });
        insertExternalImportLink(transaction, {
          candidateId: input.candidateId,
          ledgerEventId,
          importedAt,
          importFingerprint: createHash("sha256")
            .update(importPayload)
            .digest("hex"),
        });
        updateExternalCandidate(transaction, input.candidateId, {
          status: "imported",
          updatedAt: importedAt,
          lastSeenAt: importedAt,
        });
        return { candidateId: input.candidateId, ledgerEventId };
      },
      { behavior: "immediate" },
    );
  }

  async ignoreCandidate(candidateId: string): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        const candidate = findExternalCandidate(transaction, candidateId);
        assertService(
          candidate,
          "EXTERNAL_CANDIDATE_NOT_FOUND",
          "External candidate was not found.",
        );
        assertService(
          candidate.status !== "imported" &&
            candidate.status !== "source_changed",
          "EXTERNAL_CANDIDATE_NOT_IGNORABLE",
          "Imported or source-changed candidates cannot be ignored.",
        );
        const now = runtimeNow(this.runtime);
        updateExternalCandidate(transaction, candidateId, {
          status: "ignored",
          updatedAt: now,
          lastSeenAt: now,
        });
      },
      { behavior: "immediate" },
    );
  }
}
