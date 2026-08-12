import { atomicFromDb } from "../db/atomic";
import type { DatabaseContext } from "../db/connection";
import {
  findExternalAccountMapping,
  findExternalAssetMapping,
  findExternalCandidate,
  findExternalConnection,
  findExternalConnectionState,
  findEvmBalanceObservationDetail,
  findEvmCandidateDetail,
  findEvmWalletConnection,
  findEvmWalletConnectionState,
  findExternalImportLink,
  findExternalSourceObjectById,
  findSnapshotAtTime,
  listAccountsForBook,
  listAssets,
  listExternalAccountMappings,
  listExternalAssetMappings,
  listExternalBalanceObservations,
  listExternalCandidateLegs,
  listExternalCandidateSourceLinks,
  listExternalCandidates,
  listExternalConnections,
  queryBalanceAt,
} from "../db/queries";
import { formatAtomic } from "../domain/money";
import { krakenReportedNonzeroTradeFee } from "../providers/kraken/candidates";
import { ServiceError } from "./errors";

function formatAmount(amount: bigint, scale: number, code: string): string {
  return `${formatAtomic(amount, scale)} ${code}`;
}

function formatDifference(amount: bigint, scale: number, code: string): string {
  const sign = amount > 0n ? "+" : "";
  return `${sign}${formatAtomic(amount, scale)} ${code}`;
}

function permissionSummary(value: string | null): {
  ok: boolean;
  permissions: string[];
  missingRequired: string[];
  forbiddenWritePermissions: string[];
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.ok !== "boolean" ||
      !Array.isArray(parsed.permissions) ||
      !Array.isArray(parsed.missingRequired) ||
      !Array.isArray(parsed.forbiddenWritePermissions)
    ) {
      return null;
    }
    return {
      ok: parsed.ok,
      permissions: parsed.permissions.filter(
        (item): item is string => typeof item === "string",
      ),
      missingRequired: parsed.missingRequired.filter(
        (item): item is string => typeof item === "string",
      ),
      forbiddenWritePermissions: parsed.forbiddenWritePermissions.filter(
        (item): item is string => typeof item === "string",
      ),
    };
  } catch {
    return null;
  }
}

function providerMetadata(value: string | null): {
  contractAddress: string | null;
  decimals: number | null;
  symbol: string | null;
} {
  try {
    const parsed = value ? (JSON.parse(value) as Record<string, unknown>) : {};
    return {
      contractAddress:
        typeof parsed.contractAddress === "string"
          ? parsed.contractAddress
          : null,
      decimals: typeof parsed.decimals === "number" ? parsed.decimals : null,
      symbol: typeof parsed.symbol === "string" ? parsed.symbol : null,
    };
  } catch {
    return { contractAddress: null, decimals: null, symbol: null };
  }
}

export class ExternalSyncReadService {
  constructor(private readonly context: DatabaseContext) {}

  overview() {
    const assets = new Map(
      listAssets(this.context.db).map((row) => [row.id, row]),
    );
    const connections = listExternalConnections(this.context.db).map(
      (connection) => {
        const accounts = new Map(
          listAccountsForBook(this.context.db, connection.bookId).map((row) => [
            row.id,
            row,
          ]),
        );
        const accountMappings = new Map(
          listExternalAccountMappings(this.context.db, connection.id).map(
            (row) => [row.providerAssetKey, row],
          ),
        );
        const mappings = listExternalAssetMappings(
          this.context.db,
          connection.id,
        ).map((mapping) => {
          const asset = mapping.talliAssetId
            ? assets.get(mapping.talliAssetId)
            : undefined;
          const accountMapping = accountMappings.get(mapping.providerAssetKey);
          const account = accountMapping
            ? accounts.get(accountMapping.talliAccountId)
            : undefined;
          return {
            providerAssetKey: mapping.providerAssetKey,
            providerDisplayCode: mapping.providerDisplayCode,
            mappingStatus: mapping.mappingStatus,
            talliAssetId: mapping.talliAssetId,
            talliAssetCode: asset?.code ?? null,
            talliAccountId: account?.id ?? null,
            talliAccountName: account?.name ?? null,
            providerMetadata: providerMetadata(mapping.providerMetadataJson),
          };
        });
        const latest = new Map<
          string,
          ReturnType<typeof listExternalBalanceObservations>[number]
        >();
        for (const observation of listExternalBalanceObservations(
          this.context.db,
          connection.id,
        )) {
          if (!latest.has(observation.providerAssetKey)) {
            latest.set(observation.providerAssetKey, observation);
          }
        }
        const observations = [...latest.values()].map((observation) => {
          const evmDetail = findEvmBalanceObservationDetail(
            this.context.db,
            observation.id,
          );
          const asset = observation.talliAssetId
            ? assets.get(observation.talliAssetId)
            : undefined;
          const accountMapping = accountMappings.get(
            observation.providerAssetKey,
          );
          const account = accountMapping
            ? accounts.get(accountMapping.talliAccountId)
            : undefined;
          if (
            observation.precisionStatus !== "exact" ||
            observation.mappedAmountAtomic === null ||
            !asset ||
            !account ||
            !accountMapping?.isEnabled
          ) {
            return {
              id: observation.id,
              providerAssetKey: observation.providerAssetKey,
              assetCode: asset?.code ?? observation.providerAssetKey,
              accountId: account?.id ?? null,
              accountName: account?.name ?? null,
              providerAmountText: observation.providerAmountText,
              precisionStatus: observation.precisionStatus,
              observedAt: observation.observedAt,
              externalDisplay: `${observation.providerAmountText} ${asset?.code ?? observation.providerAssetKey}`,
              ledgerDisplay: null,
              differenceDisplay: null,
              differenceDirection: null,
              reconciled: false,
              evmDetail: evmDetail ?? null,
            };
          }
          const externalAtomic = atomicFromDb(observation.mappedAmountAtomic);
          const ledgerAtomic = queryBalanceAt(
            this.context.db,
            account.id,
            observation.observedAt,
          );
          const difference = externalAtomic - ledgerAtomic;
          return {
            id: observation.id,
            providerAssetKey: observation.providerAssetKey,
            assetCode: asset.code,
            accountId: account.id,
            accountName: account.name,
            providerAmountText: observation.providerAmountText,
            precisionStatus: observation.precisionStatus,
            observedAt: observation.observedAt,
            externalDisplay: formatAmount(
              externalAtomic,
              asset.scale,
              asset.code,
            ),
            ledgerDisplay: formatAmount(ledgerAtomic, asset.scale, asset.code),
            differenceDisplay: formatDifference(
              difference,
              asset.scale,
              asset.code,
            ),
            differenceDirection:
              difference > 0n
                ? "positive"
                : difference < 0n
                  ? "negative"
                  : "zero",
            reconciled: Boolean(
              findSnapshotAtTime(
                this.context.db,
                account.id,
                observation.observedAt,
              ),
            ),
            evmDetail: evmDetail ?? null,
          };
        });
        const state = findExternalConnectionState(
          this.context.db,
          connection.id,
        );
        const candidates = listExternalCandidates(
          this.context.db,
          connection.id,
          undefined,
          100,
        ).map((candidate) => {
          const evmDetail = findEvmCandidateDetail(
            this.context.db,
            candidate.id,
          );
          return {
            ...candidate,
            evmDetail: evmDetail ?? null,
            legs: listExternalCandidateLegs(this.context.db, candidate.id).map(
              (leg) => ({
                role: leg.role,
                providerAssetKey: leg.providerAssetKey,
                amountText: leg.amountText,
                assetCode: leg.talliAssetId
                  ? (assets.get(leg.talliAssetId)?.code ?? null)
                  : null,
                precisionStatus: leg.precisionStatus,
              }),
            ),
            ledgerEventId:
              findExternalImportLink(this.context.db, candidate.id)
                ?.ledgerEventId ?? null,
          };
        });
        const evmWallet = findEvmWalletConnection(
          this.context.db,
          connection.id,
        );
        const evmState = findEvmWalletConnectionState(
          this.context.db,
          connection.id,
        );
        return {
          ...connection,
          state: state
            ? {
                lastAttemptAt: state.lastAttemptAt,
                lastSuccessAt: state.lastSuccessAt,
                lastErrorCode: state.lastErrorCode,
                lastErrorMessage: state.lastErrorMessage,
                permissionCheckedAt: state.permissionCheckedAt,
                permissions: permissionSummary(state.permissionSummaryJson),
              }
            : null,
          mappings,
          observations,
          candidates,
          evmWallet: evmWallet ?? null,
          evmState: evmState ?? null,
          assets: [...assets.values()]
            .filter((asset) => !asset.isArchived)
            .map((asset) => ({
              id: asset.id,
              code: asset.code,
              name: asset.name,
            })),
          accounts: [...accounts.values()]
            .filter((account) => !account.isArchived)
            .map((account) => ({
              id: account.id,
              name: account.name,
              assetId: account.assetId,
              assetCode: assets.get(account.assetId)?.code ?? "?",
            })),
        };
      },
    );
    return { connections };
  }

  candidate(candidateId: string) {
    const candidate = findExternalCandidate(this.context.db, candidateId);
    if (!candidate) {
      throw new ServiceError(
        "EXTERNAL_CANDIDATE_NOT_FOUND",
        "External candidate was not found.",
      );
    }
    const connection = findExternalConnection(
      this.context.db,
      candidate.connectionId,
    );
    if (!connection) {
      throw new ServiceError(
        "EXTERNAL_CONNECTION_NOT_FOUND",
        "External connection was not found.",
      );
    }
    const assets = new Map(
      listAssets(this.context.db).map((row) => [row.id, row]),
    );
    const accounts = listAccountsForBook(this.context.db, connection.bookId)
      .filter((account) => !account.isArchived)
      .map((account) => ({
        id: account.id,
        name: account.name,
        assetId: account.assetId,
        assetCode: assets.get(account.assetId)?.code ?? "?",
      }));
    const legs = listExternalCandidateLegs(this.context.db, candidate.id).map(
      (leg) => {
        const mapping = findExternalAssetMapping(
          this.context.db,
          connection.id,
          leg.providerAssetKey,
        );
        const accountMapping = findExternalAccountMapping(
          this.context.db,
          connection.id,
          leg.providerAssetKey,
        );
        return {
          ...leg,
          talliAssetCode: leg.talliAssetId
            ? (assets.get(leg.talliAssetId)?.code ?? null)
            : null,
          mappingStatus: mapping?.mappingStatus ?? "unmapped",
          mappedAccountId: accountMapping?.isEnabled
            ? accountMapping.talliAccountId
            : null,
          mappedAccountName:
            accounts.find(
              (account) => account.id === accountMapping?.talliAccountId,
            )?.name ?? null,
        };
      },
    );
    const sourceRows = listExternalCandidateSourceLinks(
      this.context.db,
      candidate.id,
    ).map((link) => {
      const source = findExternalSourceObjectById(
        this.context.db,
        link.sourceObjectId,
      );
      return { link, source };
    });
    const sources = sourceRows.map(({ link, source }) => {
      return {
        relation: link.relation,
        id: source?.id ?? link.sourceObjectId,
        objectType: source?.objectType ?? null,
        externalId: source?.externalId ?? null,
        occurredAt: source?.occurredAt ?? null,
      };
    });
    const primaryTradeSources = sourceRows.filter(
      ({ link, source }) =>
        link.relation === "primary" && source?.objectType === "kraken_trade",
    );
    const unresolvedFeeAmountText =
      !legs.some((leg) => leg.role === "fee") &&
      primaryTradeSources.length === 1
        ? krakenReportedNonzeroTradeFee({
            objectType: "kraken_trade",
            payloadJson: primaryTradeSources[0]!.source!.payloadJson,
          })
        : null;
    const evmDetail = findEvmCandidateDetail(this.context.db, candidate.id);
    const allowedEventTypes:
      Array<"exchange" | "transfer" | "income" | "expense"> | undefined =
      evmDetail
        ? evmDetail.candidateKind === "gas"
          ? ["expense"]
          : evmDetail.classification === "simple_exchange"
            ? ["exchange"]
            : evmDetail.classification === "simple_in"
              ? ["income", "transfer"]
              : evmDetail.classification === "simple_out"
                ? ["expense", "transfer"]
                : []
        : undefined;
    return {
      ...candidate,
      connectionName: connection.name,
      provider: connection.provider,
      providerName:
        connection.provider === "evm_wallet" ? "Ethereum" : "Kraken",
      evmDetail: evmDetail ?? null,
      allowedEventTypes,
      sources,
      legs,
      accounts,
      importLink: findExternalImportLink(this.context.db, candidate.id) ?? null,
      unresolvedFee: unresolvedFeeAmountText
        ? { amountText: unresolvedFeeAmountText }
        : null,
      warnings: [
        ...(candidate.status === "needs_mapping"
          ? ["仍有资产、账户或精度问题，导入前必须解决。"]
          : []),
        ...(candidate.suggestedEventType === "unknown"
          ? [
              connection.provider === "evm_wallet"
                ? "On-chain direction 不会自动等于收入或支出，请明确选择。"
                : "Kraken 类型不会自动映射为收入或支出，请明确选择。",
            ]
          : []),
        ...(evmDetail?.classification === "complex"
          ? ["复杂合约交互不可自动解释；请保留证据并在 Talli 手工记账。"]
          : []),
      ],
    };
  }
}
