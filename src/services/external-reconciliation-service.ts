import { atomicFromDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import {
  findAccountWithAsset,
  findExternalAccountMapping,
  findExternalAssetMapping,
  findExternalBalanceObservation,
  findExternalConnection,
  findFileImportBalanceObservationDetail,
  findFileImportProfile,
  queryBalanceAt,
} from "../db/queries";
import { externalDecimalToAtomic } from "../domain/external-sync";
import { assertService } from "./errors";
import { createSnapshotIn } from "./reconciliation-service";
import { defaultServiceRuntime, type ServiceRuntime } from "./runtime";

export interface ExternalReconciliationInput {
  observationId: string;
  accountId: string;
  confirmed: true;
  note?: string | null;
}

export class ExternalReconciliationService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async reconcileObservation(input: ExternalReconciliationInput): Promise<{
    snapshotId: string;
    ledgerBeforeAtomic: bigint;
    externalAtomic: bigint;
    differenceAtomic: bigint;
  }> {
    return this.context.db.transaction(
      (transaction) => {
        assertService(
          input.confirmed === true,
          "EXTERNAL_RECONCILIATION_CONFIRMATION_REQUIRED",
          "External balance reconciliation requires explicit confirmation.",
        );
        const observation = findExternalBalanceObservation(
          transaction,
          input.observationId,
        );
        assertService(
          observation,
          "EXTERNAL_OBSERVATION_NOT_FOUND",
          "External balance observation was not found.",
        );
        assertService(
          observation.precisionStatus === "exact" &&
            observation.mappedAmountAtomic !== null &&
            observation.talliAssetId !== null,
          "EXTERNAL_OBSERVATION_NOT_EXACT",
          "Only an exact mapped observation can be reconciled.",
        );
        const connection = findExternalConnection(
          transaction,
          observation.connectionId,
        );
        assertService(
          connection,
          "EXTERNAL_CONNECTION_NOT_FOUND",
          "External connection was not found.",
        );
        if (connection.provider === "file_import") {
          assertService(
            findFileImportBalanceObservationDetail(
              transaction,
              observation.id,
            ) &&
              findFileImportProfile(transaction, observation.connectionId)
                ?.targetAccountId === input.accountId,
            "FILE_IMPORT_OBSERVATION_INTEGRITY_ERROR",
            "Statement balance provenance or explicit profile account binding is invalid.",
          );
        }
        const assetMapping = findExternalAssetMapping(
          transaction,
          observation.connectionId,
          observation.providerAssetKey,
        );
        const accountMapping = findExternalAccountMapping(
          transaction,
          observation.connectionId,
          observation.providerAssetKey,
        );
        assertService(
          assetMapping?.mappingStatus === "mapped" &&
            assetMapping.talliAssetId === observation.talliAssetId &&
            accountMapping?.isEnabled &&
            accountMapping.talliAccountId === input.accountId,
          "EXTERNAL_OBSERVATION_MAPPING_CHANGED",
          "Observation mapping changed after it was recorded.",
        );
        const account = findAccountWithAsset(transaction, input.accountId);
        assertService(
          account &&
            !account.account.isArchived &&
            !account.asset.isArchived &&
            account.account.bookId === connection.bookId &&
            account.account.assetId === observation.talliAssetId,
          "EXTERNAL_RECONCILIATION_ACCOUNT_INVALID",
          "Mapped reconciliation account is unavailable or incompatible.",
        );
        const reconverted = externalDecimalToAtomic(
          observation.providerAmountText,
          account.asset.scale,
        );
        const externalAtomic = atomicFromDb(observation.mappedAmountAtomic);
        assertService(
          reconverted.precisionStatus === "exact" &&
            reconverted.amountAtomic === externalAtomic,
          "EXTERNAL_OBSERVATION_INTEGRITY_ERROR",
          "Observation exact amount no longer matches its asset scale.",
        );
        const ledgerBeforeAtomic = queryBalanceAt(
          transaction,
          input.accountId,
          observation.observedAt,
        );
        const snapshotId = createSnapshotIn(transaction, this.runtime, {
          accountId: input.accountId,
          actualBalance: observation.providerAmountText,
          asOf: observation.observedAt,
          note:
            input.note?.trim() ||
            `Explicit reconciliation from ${
              connection.provider === "evm_wallet"
                ? "Ethereum wallet"
                : connection.provider === "file_import"
                  ? "file statement"
                  : "Kraken"
            } observation ${observation.id}`,
        });
        return {
          snapshotId,
          ledgerBeforeAtomic,
          externalAtomic,
          differenceAtomic: externalAtomic - ledgerBeforeAtomic,
        };
      },
      { behavior: "immediate" },
    );
  }
}
