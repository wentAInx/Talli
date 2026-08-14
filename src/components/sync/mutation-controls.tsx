"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface MutationResponse {
  ok?: boolean;
  error?: string;
  result?: { ledgerEventId?: string };
}

async function postJson(
  path: string,
  body: unknown,
): Promise<MutationResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as MutationResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "操作未完成。");
  }
  return payload;
}

export function SyncRunButton({
  connectionId,
  provider = "kraken",
}: {
  connectionId: string;
  provider?: "kraken" | "evm_wallet";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await postJson(
        provider === "evm_wallet"
          ? "/api/sync/evm/run"
          : "/api/sync/kraken/run",
        { connectionId },
      );
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "同步未完成。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sync-mutation-control">
      <button
        className="primary-button"
        disabled={pending}
        onClick={() => void run()}
        type="button"
      >
        {pending ? "正在只读同步…" : "立即同步"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ReconcileObservationButton({
  observationId,
  accountId,
  disabled = false,
  providerName = "Kraken",
}: {
  observationId: string;
  accountId: string;
  disabled?: boolean;
  providerName?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reconcile(): Promise<void> {
    if (
      !window.confirm(
        `这会创建余额快照，把该观察时间的 Talli 余额调整为 ${providerName} 外部余额；不会创建收入或支出。确认继续？`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await postJson(`/api/sync/observations/${observationId}/reconcile`, {
        accountId,
        confirmed: true,
      });
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "调整未完成。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sync-mutation-control">
      <button
        className="secondary-button"
        disabled={disabled || pending}
        onClick={() => void reconcile()}
        type="button"
      >
        {disabled
          ? "已创建余额快照"
          : pending
            ? "正在创建快照…"
            : "调整账本为外部余额"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface CandidateAccountOption {
  id: string;
  name: string;
  assetCode: string;
}

export interface CandidateLegOption {
  role:
    | "source"
    | "destination"
    | "fee"
    | "external_in"
    | "external_out"
    | "unknown";
  providerAssetKey: string;
  amountText: string;
  mappedAccountId: string | null;
}

function AccountSelect({
  label,
  name,
  accounts,
  defaultValue,
  optional = false,
  emptyLabel,
}: {
  label: string;
  name: string;
  accounts: CandidateAccountOption[];
  defaultValue?: string | null;
  optional?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        defaultValue={defaultValue ?? ""}
        name={name}
        required={!optional}
      >
        <option value="">
          {emptyLabel ?? (optional ? "不导入手续费" : "请选择账户")}
        </option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} · {account.assetCode}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyAccountField({
  accounts,
  accountId,
  label,
  name,
}: {
  accounts: CandidateAccountOption[];
  accountId: string;
  label: string;
  name: "mainAccountId" | "sourceAccountId" | "destinationAccountId";
}) {
  return (
    <div className="read-only-field">
      <span>{label}</span>
      <strong>
        {accounts.find((account) => account.id === accountId)?.name ??
          accountId}
      </strong>
      <input name={name} type="hidden" value={accountId} />
      <small>Bound by the explicit file import profile.</small>
    </div>
  );
}

export function CandidateReviewForm({
  candidateId,
  suggestedEventType,
  accounts,
  legs,
  unresolvedFee,
  providerName = "Kraken",
  allowedEventTypes,
  returnPath = "/sync",
  lockedMainAccountId,
}: {
  candidateId: string;
  suggestedEventType:
    "exchange" | "transfer" | "income" | "expense" | "unknown";
  accounts: CandidateAccountOption[];
  legs: CandidateLegOption[];
  unresolvedFee: { amountText: string } | null;
  providerName?: string;
  allowedEventTypes?: Array<"exchange" | "transfer" | "income" | "expense">;
  returnPath?: string;
  lockedMainAccountId?: string;
}) {
  const router = useRouter();
  const eventTypes =
    allowedEventTypes ??
    (["exchange", "transfer", "income", "expense"] as const);
  const proposedDefault =
    suggestedEventType === "unknown" ? "transfer" : suggestedEventType;
  const defaultEventType = eventTypes.includes(proposedDefault)
    ? proposedDefault
    : eventTypes[0]!;
  const [eventType, setEventType] = useState<
    "exchange" | "transfer" | "income" | "expense"
  >(defaultEventType);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = legs.find((leg) => leg.role === "source");
  const destination = legs.find((leg) => leg.role === "destination");
  const external = legs.find(
    (leg) => leg.role === "external_in" || leg.role === "external_out",
  );
  const fee = legs.find((leg) => leg.role === "fee");
  const main = external ?? source ?? destination;

  async function importCandidate(formData: FormData): Promise<void> {
    if (
      !window.confirm(
        "Import 会通过 Talli 现有记账规则创建真实 Ledger event。确认按当前类型、账户与金额导入？",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const text = (name: string): string | null => {
      const value = formData.get(name);
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    try {
      const response = await postJson(
        `/api/sync/candidates/${candidateId}/import`,
        {
          chosenEventType: eventType,
          sourceAccountId: text("sourceAccountId"),
          destinationAccountId: text("destinationAccountId"),
          mainAccountId: text("mainAccountId"),
          feeAccountId: text("feeAccountId"),
          ignoreUnresolvedFee: formData.get("ignoreUnresolvedFee") === "on",
          note: text("note"),
          confirmed: true,
        },
      );
      const ledgerEventId = response.result?.ledgerEventId;
      router.push(
        ledgerEventId ? `/transactions/${ledgerEventId}` : returnPath,
      );
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "导入未完成。",
      );
    } finally {
      setPending(false);
    }
  }

  async function ignoreCandidate(): Promise<void> {
    if (
      !window.confirm(
        `忽略后会保留 ${providerName} source 与审计记录。确认忽略？`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await postJson(`/api/sync/candidates/${candidateId}/ignore`, {
        confirmed: true,
      });
      router.push(`${returnPath}?queue=ignored`);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "忽略未完成。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={importCandidate} className="candidate-import-form">
      <label className="field">
        <span>导入为</span>
        <select
          name="chosenEventType"
          onChange={(event) =>
            setEventType(
              event.target.value as
                "exchange" | "transfer" | "income" | "expense",
            )
          }
          value={eventType}
        >
          {eventTypes.map((value) => (
            <option key={value} value={value}>
              {
                {
                  exchange: "兑换",
                  transfer: "转账",
                  income: "收入",
                  expense: "支出",
                }[value]
              }
            </option>
          ))}
        </select>
        <small>
          建议：
          {suggestedEventType === "unknown" ? "需人工判断" : suggestedEventType}
        </small>
      </label>

      {eventType === "exchange" ? (
        <div className="field-grid field-grid-two">
          <AccountSelect
            accounts={accounts}
            defaultValue={source?.mappedAccountId}
            label="卖出账户"
            name="sourceAccountId"
          />
          <AccountSelect
            accounts={accounts}
            defaultValue={destination?.mappedAccountId}
            label="买入账户"
            name="destinationAccountId"
          />
        </div>
      ) : eventType === "transfer" ? (
        <div className="field-grid field-grid-two">
          {lockedMainAccountId && external?.role === "external_out" ? (
            <ReadOnlyAccountField
              accountId={lockedMainAccountId}
              accounts={accounts}
              label="转出账户"
              name="sourceAccountId"
            />
          ) : (
            <AccountSelect
              accounts={accounts}
              defaultValue={
                external?.role === "external_out"
                  ? external.mappedAccountId
                  : null
              }
              label="转出账户"
              name="sourceAccountId"
            />
          )}
          {lockedMainAccountId && external?.role === "external_in" ? (
            <ReadOnlyAccountField
              accountId={lockedMainAccountId}
              accounts={accounts}
              label="转入账户"
              name="destinationAccountId"
            />
          ) : (
            <AccountSelect
              accounts={accounts}
              defaultValue={
                external?.role === "external_in"
                  ? external.mappedAccountId
                  : null
              }
              label="转入账户"
              name="destinationAccountId"
            />
          )}
        </div>
      ) : lockedMainAccountId ? (
        <ReadOnlyAccountField
          accountId={lockedMainAccountId}
          accounts={accounts}
          label={eventType === "income" ? "收入账户" : "支出账户"}
          name="mainAccountId"
        />
      ) : (
        <AccountSelect
          accounts={accounts}
          defaultValue={main?.mappedAccountId}
          label={eventType === "income" ? "收入账户" : "支出账户"}
          name="mainAccountId"
        />
      )}

      {fee ? (
        <AccountSelect
          accounts={accounts}
          defaultValue={fee.mappedAccountId}
          label={`手续费账户 · ${fee.amountText} ${fee.providerAssetKey}`}
          name="feeAccountId"
        />
      ) : null}

      {unresolvedFee ? (
        <div className="fee-panel candidate-unresolved-fee">
          <p>
            <strong>Kraken reported fee: {unresolvedFee.amountText}</strong>
          </p>
          <p>Fee asset unresolved</p>
          <AccountSelect
            accounts={accounts}
            emptyLabel="请选择手续费账户 / 资产"
            label="手续费 Talli 账户 / 资产"
            name="feeAccountId"
            optional
          />
          <label className="checkbox-row">
            <input name="ignoreUnresolvedFee" type="checkbox" />
            <span>我确认本次不导入 Kraken 报告的手续费</span>
          </label>
        </div>
      ) : null}

      <label className="field">
        <span>备注（可选）</span>
        <textarea name="note" placeholder="说明本次人工判断依据" />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="candidate-review-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "正在导入…" : "导入到 Talli"}
        </button>
        <button
          className="secondary-button"
          disabled={pending}
          onClick={() => void ignoreCandidate()}
          type="button"
        >
          忽略
        </button>
      </div>
    </form>
  );
}
