import type { DatabaseContext } from "../db/connection";
import {
  deleteExternalAccountMapping,
  ensureExternalConnectionState,
  findAssetById,
  findBookById,
  findExternalAccountMappingByAccountId,
  findExternalAssetMapping,
  findExternalConnection,
  findAccountWithAsset,
  insertExternalConnection,
  listExternalConnections,
  upsertExternalAccountMapping,
  upsertExternalAssetMapping,
} from "../db/queries";
import { assertService } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

export class ExternalMappingService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  async createKrakenConnection(input: {
    bookId: string;
    name?: string | null;
  }): Promise<string> {
    return this.context.db.transaction(
      (transaction) => {
        assertService(
          findBookById(transaction, input.bookId),
          "BOOK_NOT_FOUND",
          "Book was not found.",
        );
        const existing = listExternalConnections(transaction).find(
          (connection) =>
            connection.bookId === input.bookId &&
            connection.provider === "kraken" &&
            connection.sourceKey === "kraken:primary",
        );
        if (existing) return existing.id;

        const now = runtimeNow(this.runtime);
        const id = this.runtime.id();
        insertExternalConnection(transaction, {
          id,
          bookId: input.bookId,
          provider: "kraken",
          sourceKey: "kraken:primary",
          name: input.name?.trim() || "Kraken",
          credentialRef: "env:kraken.primary",
          isEnabled: true,
          createdAt: now,
          updatedAt: now,
        });
        ensureExternalConnectionState(transaction, id, now);
        return id;
      },
      { behavior: "immediate" },
    );
  }

  async updateMapping(input: {
    connectionId: string;
    providerAssetKey: string;
    mappingStatus: "mapped" | "unmapped" | "ignored";
    talliAssetId?: string | null;
    talliAccountId?: string | null;
  }): Promise<void> {
    this.context.db.transaction(
      (transaction) => {
        const connection = findExternalConnection(
          transaction,
          input.connectionId,
        );
        assertService(
          connection,
          "EXTERNAL_CONNECTION_NOT_FOUND",
          "External connection was not found.",
        );
        const existing = findExternalAssetMapping(
          transaction,
          input.connectionId,
          input.providerAssetKey,
        );
        assertService(
          existing,
          "EXTERNAL_ASSET_MAPPING_NOT_FOUND",
          "Sync this provider asset before mapping it.",
        );
        const now = runtimeNow(this.runtime);

        if (input.mappingStatus !== "mapped") {
          deleteExternalAccountMapping(
            transaction,
            input.connectionId,
            input.providerAssetKey,
          );
          upsertExternalAssetMapping(transaction, {
            ...existing,
            talliAssetId: null,
            mappingStatus: input.mappingStatus,
            updatedAt: now,
          });
          return;
        }

        if (connection.provider === "evm_wallet") {
          let decimals: unknown = null;
          try {
            const metadata = existing.providerMetadataJson
              ? (JSON.parse(existing.providerMetadataJson) as Record<
                  string,
                  unknown
                >)
              : null;
            decimals = metadata?.decimals ?? null;
          } catch {
            decimals = null;
          }
          assertService(
            typeof decimals === "number" &&
              Number.isInteger(decimals) &&
              decimals >= 0 &&
              decimals <= 255,
            "EVM_TOKEN_DECIMALS_UNRESOLVED",
            "Token decimals must be resolved before this on-chain asset can be mapped.",
          );
        }

        assertService(
          input.talliAssetId,
          "EXTERNAL_ASSET_REQUIRED",
          "Select a Talli asset for a mapped provider asset.",
        );
        const asset = findAssetById(transaction, input.talliAssetId);
        assertService(
          asset && !asset.isArchived,
          "EXTERNAL_ASSET_UNAVAILABLE",
          "Mapped Talli asset must be active.",
        );
        assertService(
          input.talliAccountId,
          "EXTERNAL_ACCOUNT_REQUIRED",
          "Select a Talli account for a mapped provider asset.",
        );
        const account = findAccountWithAsset(transaction, input.talliAccountId);
        assertService(
          account && !account.account.isArchived && !account.asset.isArchived,
          "EXTERNAL_ACCOUNT_UNAVAILABLE",
          "Mapped Talli account and asset must be active.",
        );
        assertService(
          account.account.bookId === connection.bookId,
          "EXTERNAL_ACCOUNT_BOOK_MISMATCH",
          "Mapped account must belong to the connection book.",
        );
        assertService(
          account.account.assetId === asset.id,
          "EXTERNAL_ACCOUNT_ASSET_MISMATCH",
          "Mapped account must use the mapped asset.",
        );
        const occupied = findExternalAccountMappingByAccountId(
          transaction,
          account.account.id,
        );
        assertService(
          !occupied ||
            (occupied.connectionId === input.connectionId &&
              occupied.providerAssetKey === input.providerAssetKey),
          "EXTERNAL_ACCOUNT_ALREADY_MAPPED",
          "A Talli account can be used by only one external mapping.",
        );

        upsertExternalAssetMapping(transaction, {
          ...existing,
          talliAssetId: asset.id,
          mappingStatus: "mapped",
          updatedAt: now,
        });
        upsertExternalAccountMapping(transaction, {
          connectionId: input.connectionId,
          providerAssetKey: input.providerAssetKey,
          talliAccountId: account.account.id,
          isEnabled: true,
          createdAt: occupied?.createdAt ?? now,
          updatedAt: now,
        });
      },
      { behavior: "immediate" },
    );
  }
}
