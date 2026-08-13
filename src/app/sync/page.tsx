import type { Metadata } from "next";
import Link from "next/link";

import {
  createEvmWalletAction,
  createKrakenConnectionAction,
  updateExternalMappingAction,
} from "@/app/actions";
import { SettingsActionForm } from "@/components/forms/settings-action-form";
import {
  ReconcileObservationButton,
  SyncRunButton,
} from "@/components/sync/mutation-controls";
import { safeKrakenConfigurationView } from "@/providers/kraken/server-factory";
import { safeAlchemyConfigurationView } from "@/providers/evm/server-factory";
import { evmChainIdentity } from "@/domain/evm";
import { ExternalSyncReadService } from "@/services/external-sync-read-service";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "外部同步" };

const QUEUES = [
  { value: "pending", label: "待审核" },
  { value: "needs_mapping", label: "需映射" },
  { value: "imported", label: "已导入" },
  { value: "ignored", label: "已忽略" },
  { value: "exceptions", label: "异常" },
] as const;

type Queue = (typeof QUEUES)[number]["value"];

function candidateMatchesQueue(status: string, queue: Queue): boolean {
  return queue === "exceptions"
    ? status === "unsupported" || status === "source_changed"
    : status === queue;
}

function statusLabel(status: string): string {
  return (
    {
      pending: "待审核",
      needs_mapping: "需映射",
      imported: "已导入",
      ignored: "已忽略",
      unsupported: "不支持",
      source_changed: "来源已变化",
    }[status] ?? status
  );
}

function eventTypeLabel(value: string): string {
  return (
    {
      exchange: "兑换",
      transfer: "转账",
      income: "收入",
      expense: "支出",
      unknown: "需人工判断",
    }[value] ?? value
  );
}

function compactAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function connectionStatus(connection: {
  state: {
    lastSuccessAt: string | null;
    lastErrorCode: string | null;
    permissions: {
      ok: boolean;
      forbiddenWritePermissions: string[];
    } | null;
  } | null;
  configured: boolean;
}) {
  if (!connection.configured) {
    return { tone: "danger", label: "凭据缺失" };
  }
  if (connection.state?.permissions?.forbiddenWritePermissions.length) {
    return { tone: "danger", label: "权限不安全" };
  }
  if (connection.state?.lastErrorCode === "EVM_TOKEN_BALANCE_PARTIAL") {
    return { tone: "warning", label: "Token 余额部分完成" };
  }
  if (connection.state?.lastErrorCode === "EVM_L2_TRACE_UNAVAILABLE") {
    return { tone: "warning", label: "仅余额可用" };
  }
  if (connection.state?.lastErrorCode) {
    return { tone: "warning", label: "最近同步失败" };
  }
  if (connection.state?.lastSuccessAt) {
    return { tone: "success", label: "只读同步正常" };
  }
  return { tone: "neutral", label: "等待首次同步" };
}

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const query = await searchParams;
  const queue: Queue = QUEUES.some((item) => item.value === query.queue)
    ? (query.queue as Queue)
    : "pending";
  const krakenCredentials = safeKrakenConfigurationView();
  const alchemyCredentials = safeAlchemyConfigurationView();
  const overview = await withDatabase((context) =>
    new ExternalSyncReadService(context).overview(),
  );
  const connections = overview.connections.map((connection) => {
    const credentials =
      connection.provider === "evm_wallet"
        ? alchemyCredentials
        : krakenCredentials;
    return {
      ...connection,
      configured: credentials.configured,
      credentialRef: credentials.credentialRef,
    };
  });
  const hasKraken = connections.some(
    (connection) => connection.provider === "kraken",
  );

  return (
    <div className="page-stack sync-page">
      <header className="page-heading sync-heading">
        <div>
          <p className="eyebrow">External observations · Explicit writes</p>
          <h1>外部同步</h1>
          <p>
            Kraken 与链上数据先进入审核区；任何同步都不会自动修改 Talli 账本。
          </p>
        </div>
        <span className="sync-boundary-seal">External ≠ Ledger</span>
      </header>

      <div className="sync-source-onboarding">
        {!hasKraken ? (
          <section className="empty-state sync-empty-state">
            <span className="empty-mark" aria-hidden="true">
              K
            </span>
            <h2>连接 Kraken</h2>
            <p>
              只保存 <code>env:kraken.primary</code> 引用；API key 与 secret
              只从服务端环境读取。
            </p>
            <SettingsActionForm
              action={createKrakenConnectionAction}
              className="sync-connect-form"
              submitLabel="创建 Kraken 只读连接"
            >
              <span className="sr-only">使用服务端环境凭据</span>
            </SettingsActionForm>
          </section>
        ) : null}

        <section className="content-section evm-add-wallet-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ethereum · Base · Arbitrum</p>
              <h2>添加只读钱包</h2>
            </div>
            <span className="evm-chain-chip">3 个固定主网</span>
          </div>
          <div className="evm-network-rail" aria-label="支持的 EVM 网络">
            <span>
              Ethereum <code>1</code>
            </span>
            <span>
              Base <code>8453</code>
            </span>
            <span>
              Arbitrum <code>42161</code>
            </span>
          </div>
          <p className="sync-safety-copy">
            只接受公共地址。不要输入 private key、mnemonic 或 seed phrase；Talli
            不签名，也不会调用 write RPC。L2 历史活动始终标记为 discovery
            limited。
          </p>
          <SettingsActionForm
            action={createEvmWalletAction}
            className="sync-connect-form evm-wallet-form"
            submitLabel="添加 EVM 只读钱包"
          >
            <label className="field">
              <span>网络</span>
              <select defaultValue="1" name="chainId" required>
                <option value="1">Ethereum Mainnet · chainId 1</option>
                <option value="8453">Base Mainnet · chainId 8453</option>
                <option value="42161">Arbitrum One · chainId 42161</option>
              </select>
            </label>
            <label className="field">
              <span>钱包名称</span>
              <input name="name" placeholder="例如：Main wallet" required />
            </label>
            <label className="field">
              <span>Public EVM address</span>
              <input
                autoComplete="off"
                inputMode="text"
                name="publicAddress"
                pattern="0x[0-9a-fA-F]{40}"
                placeholder="0x…"
                required
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>History start date · UTC</span>
              <input
                defaultValue="2026-01-01"
                name="historyStartDate"
                required
                type="date"
              />
            </label>
          </SettingsActionForm>
        </section>
      </div>

      {connections.map((connection) => {
        const isEvm = connection.provider === "evm_wallet";
        const evmChain = connection.evmWallet
          ? evmChainIdentity(connection.evmWallet.chainId)
          : null;
        const status = connectionStatus(connection);
        const candidates = connection.candidates.filter((candidate) =>
          candidateMatchesQueue(candidate.status, queue),
        );
        const candidateGroups = isEvm
          ? [
              ...new Set(
                candidates.map(
                  (candidate) => candidate.evmDetail?.txHash ?? candidate.id,
                ),
              ),
            ].map((key) => ({
              key,
              label: key.startsWith("0x")
                ? `Tx ${compactAddress(key)}`
                : "Unresolved transaction",
              candidates: candidates.filter(
                (candidate) =>
                  (candidate.evmDetail?.txHash ?? candidate.id) === key,
              ),
            }))
          : candidates.map((candidate) => ({
              key: candidate.id,
              label: null,
              candidates: [candidate],
            }));
        return (
          <div
            className={"sync-workbench " + (isEvm ? "evm-workbench" : "")}
            key={connection.id}
          >
            <section className="content-section sync-connection-card">
              <div className="sync-connection-heading">
                <div>
                  <p className="eyebrow">
                    {evmChain
                      ? `${evmChain.displayName} · Read only`
                      : "Kraken Spot · Read only"}
                  </p>
                  <h2>{connection.name}</h2>
                  {connection.evmWallet ? (
                    <code
                      className="evm-wallet-address"
                      title={connection.evmWallet.addressLower}
                    >
                      ◇ {compactAddress(connection.evmWallet.addressLower)}
                    </code>
                  ) : null}
                  <span className={"sync-status sync-status-" + status.tone}>
                    {status.label}
                  </span>
                </div>
                <SyncRunButton
                  connectionId={connection.id}
                  provider={connection.provider}
                />
              </div>
              <p className="sync-safety-copy">
                {evmChain?.historyCoverage === "discovery_limited"
                  ? "余额读取 latest；历史 activity 只发现 external / ERC-20 tx，再以 exact debug trace 审核 native movement。Bridge 不会自动跨链关联。"
                  : isEvm
                    ? "当前余额读取 latest；transfer、transaction 与 receipt 历史只同步到 finalized block，movement 和 gas 分开审核。"
                    : "此按钮只抓取 Balance、Ledgers 与 Trades History；Import 或 Reconcile 仍需单独确认。"}
              </p>
              <dl className="credential-facts">
                <div>
                  <dt>Credential</dt>
                  <dd>{connection.credentialRef}</dd>
                </div>
                <div>
                  <dt>{isEvm ? "Alchemy key" : "API key"}</dt>
                  <dd>{connection.configured ? "已配置" : "未配置"}</dd>
                </div>
                <div>
                  <dt>最近成功</dt>
                  <dd>{connection.state?.lastSuccessAt ?? "尚未同步"}</dd>
                </div>
                {connection.evmWallet ? (
                  <div>
                    <dt>Finalized history</dt>
                    <dd>
                      {connection.evmWallet.historyStartAt.slice(0, 10)} →{" "}
                      {connection.evmState?.lastFinalizedBlockText ??
                        "等待同步"}
                    </dd>
                  </div>
                ) : null}
                {evmChain ? (
                  <div>
                    <dt>History coverage</dt>
                    <dd>
                      {evmChain.historyCoverage === "discovery_limited"
                        ? `discovery limited${evmChain.chainId === 42161 ? " · activity ≥ block 22,207,815" : ""}`
                        : "complete transfer index"}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {!isEvm ? (
                <div className="permission-checks" aria-label="Kraken 权限状态">
                  {["query-funds", "query-ledger", "query-closed-trades"].map(
                    (permission) => (
                      <span key={permission}>
                        {connection.state?.permissions?.permissions.includes(
                          permission,
                        )
                          ? "✓"
                          : "○"}{" "}
                        {permission}
                      </span>
                    ),
                  )}
                  <span>
                    {connection.state?.permissions?.forbiddenWritePermissions
                      .length
                      ? "! 检测到危险写权限"
                      : "✓ 未检测到危险写权限"}
                  </span>
                </div>
              ) : (
                <div className="permission-checks" aria-label="EVM 安全边界">
                  <span>✓ chainId {evmChain?.chainId}</span>
                  <span>✓ public address only</span>
                  <span>✓ no sign / send / write RPC</span>
                  {evmChain?.requiresDebugForMovement ? (
                    <span>
                      {connection.evmState?.traceCapabilityStatus ===
                      "trace_available"
                        ? "✓ exact activity trace"
                        : connection.evmState?.traceCapabilityStatus ===
                            "trace_unavailable"
                          ? "! balance-only · trace unavailable"
                          : "○ trace capability pending"}
                    </span>
                  ) : null}
                </div>
              )}
              {connection.state?.lastErrorCode ? (
                <p
                  className={
                    connection.state.lastErrorCode ===
                      "EVM_TOKEN_BALANCE_PARTIAL" ||
                    connection.state.lastErrorCode ===
                      "EVM_L2_TRACE_UNAVAILABLE"
                      ? "sync-partial-warning"
                      : "form-error"
                  }
                  role={
                    connection.state.lastErrorCode ===
                      "EVM_TOKEN_BALANCE_PARTIAL" ||
                    connection.state.lastErrorCode ===
                      "EVM_L2_TRACE_UNAVAILABLE"
                      ? "status"
                      : "alert"
                  }
                >
                  {connection.state.lastErrorCode ===
                  "EVM_TOKEN_BALANCE_PARTIAL"
                    ? "本次同步存在 token balance issue；失败 token 未按 0 写入，其他余额与完整 activity 已保存。"
                    : connection.state.lastErrorCode ===
                        "EVM_L2_TRACE_UNAVAILABLE"
                      ? "Alchemy Debug API unavailable for reviewed L2 activity. Balance sync remains available；本次未保存 activity，也未推进 cursor。"
                      : `${connection.state.lastErrorCode} · ${connection.state.lastErrorMessage}`}
                </p>
              ) : null}
            </section>

            <section className="content-section sync-mapping-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Identity before amounts</p>
                  <h2>资产与账户映射</h2>
                </div>
                <span>{connection.mappings.length} 个 raw asset</span>
              </div>
              {connection.mappings.length > 0 ? (
                <div className="sync-table-scroll">
                  <table className="sync-mapping-table">
                    <thead>
                      <tr>
                        <th>{isEvm ? "Chain identity" : "Kraken raw"}</th>
                        <th>{isEvm ? "Metadata" : "Canonical"}</th>
                        <th>Talli asset / account</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connection.mappings.map((mapping) => {
                        const tokenDecimalsUnresolved =
                          isEvm &&
                          mapping.providerMetadata.contractAddress !== null &&
                          mapping.providerMetadata.decimals === null;
                        const action = updateExternalMappingAction.bind(
                          null,
                          connection.id,
                          mapping.providerAssetKey,
                        );
                        return (
                          <tr key={mapping.providerAssetKey}>
                            <td
                              data-label={
                                isEvm ? "Chain identity" : "Kraken raw"
                              }
                            >
                              <code>{mapping.providerAssetKey}</code>
                            </td>
                            <td data-label={isEvm ? "Metadata" : "Canonical"}>
                              <span className="mapping-metadata">
                                <strong>
                                  {mapping.providerDisplayCode ?? "未解析"}
                                </strong>
                                {isEvm ? (
                                  <small>
                                    {tokenDecimalsUnresolved
                                      ? "token decimals unresolved"
                                      : `decimals ${mapping.providerMetadata.decimals}`}
                                    {mapping.providerMetadata.contractAddress
                                      ? ` · ${mapping.providerMetadata.contractAddress}`
                                      : " · native"}
                                  </small>
                                ) : null}
                              </span>
                            </td>
                            <td data-label="Talli mapping">
                              <SettingsActionForm
                                action={action}
                                className="mapping-inline-form"
                                submitLabel="保存映射"
                              >
                                <label className="field compact-field">
                                  <span className="sr-only">映射状态</span>
                                  <select
                                    defaultValue={mapping.mappingStatus}
                                    name="mappingStatus"
                                  >
                                    <option
                                      disabled={tokenDecimalsUnresolved}
                                      value="mapped"
                                    >
                                      {tokenDecimalsUnresolved
                                        ? "映射（等待 decimals）"
                                        : "映射"}
                                    </option>
                                    <option value="unmapped">未映射</option>
                                    <option value="ignored">忽略</option>
                                  </select>
                                </label>
                                <label className="field compact-field">
                                  <span className="sr-only">Talli 资产</span>
                                  <select
                                    defaultValue={mapping.talliAssetId ?? ""}
                                    name="talliAssetId"
                                  >
                                    <option value="">选择资产</option>
                                    {connection.assets.map((asset) => (
                                      <option key={asset.id} value={asset.id}>
                                        {asset.code} · {asset.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field compact-field">
                                  <span className="sr-only">Talli 账户</span>
                                  <select
                                    defaultValue={mapping.talliAccountId ?? ""}
                                    name="talliAccountId"
                                  >
                                    <option value="">选择账户</option>
                                    {connection.accounts.map((account) => (
                                      <option
                                        key={account.id}
                                        value={account.id}
                                      >
                                        {account.name} · {account.assetCode}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </SettingsActionForm>
                            </td>
                            <td data-label="状态">
                              <span
                                className={
                                  "mapping-state mapping-state-" +
                                  mapping.mappingStatus
                                }
                              >
                                {mapping.mappingStatus === "mapped"
                                  ? mapping.talliAssetCode +
                                    " · " +
                                    mapping.talliAccountName
                                  : mapping.mappingStatus === "ignored"
                                    ? "已忽略"
                                    : "待处理"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-inline">
                  首次同步后会显示
                  {isEvm ? "链上 asset identity" : " Kraken raw asset"}。
                </p>
              )}
            </section>

            <section className="content-section sync-observations-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Observed, never auto-posted</p>
                  <h2>余额观测</h2>
                </div>
                <span>{connection.observations.length} 个最新观测</span>
              </div>
              {connection.observations.length > 0 ? (
                <div className="observation-grid">
                  {connection.observations.map((observation) => (
                    <article className="observation-card" key={observation.id}>
                      <header>
                        <div>
                          <strong>
                            {isEvm ? "On-chain" : "Kraken"}{" "}
                            {observation.assetCode}
                          </strong>
                          <small>
                            {observation.accountName ?? "尚未映射账户"}
                          </small>
                        </div>
                        <code>{observation.providerAssetKey}</code>
                      </header>
                      <dl>
                        <div>
                          <dt>外部观测</dt>
                          <dd>{observation.externalDisplay}</dd>
                        </div>
                        <div>
                          <dt>Talli 账本</dt>
                          <dd>{observation.ledgerDisplay ?? "映射后可比较"}</dd>
                        </div>
                        <div>
                          <dt>差异</dt>
                          <dd
                            className={
                              "difference-" +
                              (observation.differenceDirection ?? "unknown")
                            }
                          >
                            {observation.differenceDisplay ??
                              observation.precisionStatus}
                          </dd>
                        </div>
                      </dl>
                      <time dateTime={observation.observedAt}>
                        观察时间 {observation.observedAt}
                        {observation.evmDetail?.syncHeadBlockText
                          ? ` · head ${observation.evmDetail.syncHeadBlockText}`
                          : ""}
                      </time>
                      {observation.decimalsUnresolved &&
                      observation.evmDetail ? (
                        <p className="evm-decimals-warning" role="status">
                          raw atomic amount{" "}
                          {observation.evmDetail.rawAmountAtomicText} · token
                          decimals unresolved
                        </p>
                      ) : null}
                      {observation.accountId &&
                      observation.differenceDisplay ? (
                        <ReconcileObservationButton
                          accountId={observation.accountId}
                          disabled={observation.reconciled}
                          observationId={observation.id}
                          providerName={
                            evmChain
                              ? `${evmChain.displayName} on-chain`
                              : "Kraken"
                          }
                        />
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">
                  同步后才会生成 append-only 余额观测。
                </p>
              )}
            </section>

            <section className="content-section candidate-queue-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Review before ledger</p>
                  <h2>交易候选</h2>
                </div>
                <span>{connection.candidates.length} 个候选</span>
              </div>
              <nav className="candidate-tabs" aria-label="候选状态">
                {QUEUES.map((item) => (
                  <Link
                    aria-current={queue === item.value ? "page" : undefined}
                    href={"/sync?queue=" + item.value}
                    key={item.value}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              {candidateGroups.length > 0 ? (
                <div className="candidate-tx-groups">
                  {candidateGroups.map((group) => (
                    <article className="candidate-tx-group" key={group.key}>
                      {group.label ? (
                        <header>
                          <strong>{group.label}</strong>
                          <code title={group.key}>{group.key}</code>
                        </header>
                      ) : null}
                      <ul className="candidate-list">
                        {group.candidates.map((candidate) => (
                          <li key={candidate.id}>
                            <Link href={"/sync/candidates/" + candidate.id}>
                              <span className="candidate-provider-mark">
                                {evmChain?.chainId === 8453
                                  ? "B"
                                  : evmChain?.chainId === 42161
                                    ? "A"
                                    : isEvm
                                      ? "Ξ"
                                      : "K"}
                              </span>
                              <span className="candidate-copy">
                                <strong>
                                  {candidate.evmDetail?.candidateKind === "gas"
                                    ? "Network fee"
                                    : candidate.evmDetail?.candidateKind ===
                                        "movement"
                                      ? "Movement"
                                      : candidate.title}
                                </strong>
                                <small>
                                  {candidate.legs.length > 0
                                    ? candidate.legs
                                        .map(
                                          (leg) =>
                                            leg.amountText +
                                            " " +
                                            (leg.assetCode ??
                                              leg.providerAssetKey),
                                        )
                                        .join(" · ")
                                    : "没有可导入的标准化 legs"}
                                </small>
                                <code>{candidate.stableKey}</code>
                              </span>
                              <span className="candidate-state">
                                <strong>{statusLabel(candidate.status)}</strong>
                                <small>
                                  {candidate.evmDetail?.classification ??
                                    "建议"}{" "}
                                  ·{" "}
                                  {eventTypeLabel(candidate.suggestedEventType)}
                                  {candidate.evmL2GasFee?.feeStatus ===
                                  "unresolved"
                                    ? " · Fee incomplete"
                                    : ""}
                                </small>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">这个队列目前为空。</p>
              )}
            </section>
          </div>
        );
      })}
    </div>
  );
}
