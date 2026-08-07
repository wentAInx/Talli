"use client";

import { useActionState, useMemo, useState } from "react";

import { INITIAL_ACTION_STATE, type ActionState } from "@/app/action-state";
import { deriveExecutedExchangeRate } from "@/domain/exchange-rate";
import { parseDecimalToAtomic } from "@/domain/money";
import type {
  AccountView,
  CategoryView,
  LedgerEventView,
  TagView,
} from "@/services";

import { SubmitButton } from "./submit-button";

type OperationType =
  "expense" | "income" | "transfer" | "exchange" | "reconcile";

const OPERATION_LABELS: Record<OperationType, string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  exchange: "兑换",
  reconcile: "调整余额",
};

function localInputValue(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}.${milliseconds}`;
}

function entry(initial: LedgerEventView | undefined, role: string) {
  return initial?.entries.find((candidate) => candidate.role === role);
}

function AccountOptions({ accounts }: { accounts: AccountView[] }) {
  return accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} · {account.asset.code}
    </option>
  ));
}

function precisionText(account: AccountView | undefined): string {
  return account
    ? `${account.asset.code} · 最多 ${account.asset.scale} 位小数`
    : "选择后显示单位与精度";
}

function FieldError({ error }: { error: string | null }) {
  return error ? (
    <p className="form-error" role="alert" data-testid="form-error">
      {error}
    </p>
  ) : null;
}

export function TransactionForm({
  action,
  accounts,
  categories,
  tags,
  initial,
  initialType = "expense",
  allowReconcile = true,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  accounts: AccountView[];
  categories: CategoryView[];
  tags: TagView[];
  initial?: LedgerEventView;
  initialType?: OperationType;
  allowReconcile?: boolean;
}) {
  const startingType = initial?.type ?? initialType;
  const [operationType, setOperationType] =
    useState<OperationType>(startingType);
  const initialMain = entry(initial, "main");
  const initialSource = entry(initial, "source");
  const initialDestination = entry(initial, "destination");
  const initialFee = entry(initial, "fee");
  const [accountId, setAccountId] = useState(initialMain?.accountId ?? "");
  const [sourceAccountId, setSourceAccountId] = useState(
    initialSource?.accountId ?? "",
  );
  const [destinationAccountId, setDestinationAccountId] = useState(
    initialDestination?.accountId ?? "",
  );
  const [sourceAmount, setSourceAmount] = useState(
    initialSource?.amountInput ?? "",
  );
  const [destinationAmount, setDestinationAmount] = useState(
    initialDestination?.amountInput ?? "",
  );
  const [hasFee, setHasFee] = useState(Boolean(initialFee));
  const [feeAccountId, setFeeAccountId] = useState(initialFee?.accountId ?? "");
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const occurredAtLocal = useMemo(
    () => localInputValue(initial?.occurredAt),
    [initial?.occurredAt],
  );

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const sourceAccount = accounts.find(
    (account) => account.id === sourceAccountId,
  );
  const destinationAccount = accounts.find(
    (account) => account.id === destinationAccountId,
  );
  const feeAccount = accounts.find((account) => account.id === feeAccountId);

  const destinationAccounts = useMemo(() => {
    if (!sourceAccount) {
      return [];
    }
    return accounts.filter((account) => {
      if (account.id === sourceAccount.id) {
        return false;
      }
      return operationType === "transfer"
        ? account.asset.id === sourceAccount.asset.id
        : account.asset.id !== sourceAccount.asset.id;
    });
  }, [accounts, operationType, sourceAccount]);

  const executedRate = useMemo(() => {
    if (
      operationType !== "exchange" ||
      !sourceAccount ||
      !destinationAccount ||
      !sourceAmount ||
      !destinationAmount
    ) {
      return null;
    }
    try {
      return deriveExecutedExchangeRate({
        sourceAmountAtomic: parseDecimalToAtomic(
          sourceAmount,
          sourceAccount.asset.scale,
        ),
        sourceScale: sourceAccount.asset.scale,
        destinationAmountAtomic: parseDecimalToAtomic(
          destinationAmount,
          destinationAccount.asset.scale,
        ),
        destinationScale: destinationAccount.asset.scale,
        significantDigits: 12,
      });
    } catch {
      return null;
    }
  }, [
    destinationAccount,
    destinationAmount,
    operationType,
    sourceAccount,
    sourceAmount,
  ]);

  function actionWithUtc(formData: FormData) {
    const localValue = formData.get("occurredAtLocal");
    if (typeof localValue === "string" && localValue.length > 0) {
      const date = new Date(localValue);
      if (!Number.isNaN(date.getTime())) {
        formData.set("occurredAt", date.toISOString());
      }
    }
    formAction(formData);
  }

  const visibleTypes = (
    Object.keys(OPERATION_LABELS) as OperationType[]
  ).filter((type) => allowReconcile || type !== "reconcile");

  const dateField = (
    <label className="field" data-testid="occurred-at-field">
      <span>{operationType === "reconcile" ? "调整时间" : "日期与时间"}</span>
      <input
        type="datetime-local"
        step="0.001"
        name="occurredAtLocal"
        required
        defaultValue={occurredAtLocal}
      />
    </label>
  );

  function selectOperation(type: OperationType) {
    setOperationType(type);
    setDestinationAccountId("");
  }

  return (
    <form action={actionWithUtc} className="transaction-form">
      <div className="operation-tabs" role="tablist" aria-label="记账类型">
        {visibleTypes.map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            id={`operation-tab-${type}`}
            aria-controls="operation-panel"
            aria-selected={operationType === type}
            className="operation-tab"
            onClick={() => selectOperation(type)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const currentIndex = visibleTypes.indexOf(type);
              const nextIndex =
                (currentIndex + direction + visibleTypes.length) %
                visibleTypes.length;
              const nextType = visibleTypes[nextIndex];
              selectOperation(nextType);
              event.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(`#operation-tab-${nextType}`)
                ?.focus();
            }}
          >
            {OPERATION_LABELS[type]}
          </button>
        ))}
      </div>
      <input type="hidden" name="eventType" value={operationType} />

      <section
        className="form-panel"
        role="tabpanel"
        id="operation-panel"
        aria-labelledby={`operation-tab-${operationType}`}
        aria-label={OPERATION_LABELS[operationType]}
      >
        {operationType === "expense" || operationType === "income" ? (
          <>
            <label className="field amount-field">
              <span>金额</span>
              <div className="amount-input-wrap">
                <input
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  defaultValue={initialMain?.amountInput ?? ""}
                  placeholder="0.00"
                />
                <span>{selectedAccount?.asset.code ?? "资产"}</span>
              </div>
              <small>{precisionText(selectedAccount)}</small>
            </label>
            <label className="field">
              <span>账户</span>
              <select
                name="accountId"
                required
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="" disabled>
                  选择账户
                </option>
                <AccountOptions accounts={accounts} />
              </select>
            </label>
            <label className="field">
              <span>分类</span>
              <select
                name="categoryId"
                defaultValue={initial?.categoryId ?? ""}
              >
                <option value="">未分类</option>
                {categories
                  .filter(
                    (category) =>
                      category.type === "both" ||
                      category.type === operationType,
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            {dateField}
          </>
        ) : null}

        {operationType === "transfer" || operationType === "exchange" ? (
          <>
            <div className="field-grid field-grid-two">
              <label className="field">
                <span>
                  {operationType === "transfer" ? "转出账户" : "卖出账户"}
                </span>
                <select
                  name="sourceAccountId"
                  required
                  value={sourceAccountId}
                  onChange={(event) => {
                    setSourceAccountId(event.target.value);
                    setDestinationAccountId("");
                  }}
                >
                  <option value="" disabled>
                    选择账户
                  </option>
                  <AccountOptions accounts={accounts} />
                </select>
              </label>
              <label className="field">
                <span>
                  {operationType === "transfer" ? "转入账户" : "买入账户"}
                </span>
                <select
                  name="destinationAccountId"
                  required
                  value={destinationAccountId}
                  onChange={(event) =>
                    setDestinationAccountId(event.target.value)
                  }
                >
                  <option value="" disabled>
                    {sourceAccount ? "选择账户" : "请先选择转出账户"}
                  </option>
                  <AccountOptions accounts={destinationAccounts} />
                </select>
              </label>
            </div>

            {operationType === "transfer" ? (
              <label className="field amount-field">
                <span>金额</span>
                <div className="amount-input-wrap">
                  <input
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    defaultValue={initialSource?.amountInput ?? ""}
                    placeholder="0.00"
                  />
                  <span>{sourceAccount?.asset.code ?? "资产"}</span>
                </div>
                <small>{precisionText(sourceAccount)}</small>
              </label>
            ) : (
              <div className="field-grid field-grid-two">
                <label className="field amount-field">
                  <span>卖出数量</span>
                  <div className="amount-input-wrap">
                    <input
                      name="sourceAmount"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      value={sourceAmount}
                      onChange={(event) => setSourceAmount(event.target.value)}
                      placeholder="0"
                    />
                    <span>{sourceAccount?.asset.code ?? "资产"}</span>
                  </div>
                  <small>{precisionText(sourceAccount)}</small>
                </label>
                <label className="field amount-field">
                  <span>买入数量</span>
                  <div className="amount-input-wrap">
                    <input
                      name="destinationAmount"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      value={destinationAmount}
                      onChange={(event) =>
                        setDestinationAmount(event.target.value)
                      }
                      placeholder="0"
                    />
                    <span>{destinationAccount?.asset.code ?? "资产"}</span>
                  </div>
                  <small>{precisionText(destinationAccount)}</small>
                </label>
              </div>
            )}

            {executedRate && sourceAccount && destinationAccount ? (
              <p className="executed-rate" aria-live="polite">
                <span>实际成交</span>
                <strong>
                  1 {sourceAccount.asset.code} = {executedRate}{" "}
                  {destinationAccount.asset.code}
                </strong>
              </p>
            ) : null}

            {dateField}

            <label className="checkbox-row" data-testid="fee-toggle">
              <input
                type="checkbox"
                name="hasFee"
                checked={hasFee}
                onChange={(event) => setHasFee(event.target.checked)}
              />
              <span>这笔操作另有手续费</span>
            </label>
            {hasFee ? (
              <div className="fee-panel field-grid field-grid-two">
                <label className="field">
                  <span>手续费账户</span>
                  <select
                    name="feeAccountId"
                    required
                    value={feeAccountId}
                    onChange={(event) => setFeeAccountId(event.target.value)}
                  >
                    <option value="" disabled>
                      选择账户（可为其他资产）
                    </option>
                    <AccountOptions accounts={accounts} />
                  </select>
                </label>
                <label className="field amount-field">
                  <span>手续费金额</span>
                  <div className="amount-input-wrap">
                    <input
                      name="feeAmount"
                      inputMode="decimal"
                      required
                      defaultValue={initialFee?.amountInput ?? ""}
                    />
                    <span>{feeAccount?.asset.code ?? "资产"}</span>
                  </div>
                  <small>{precisionText(feeAccount)}</small>
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {operationType === "reconcile" ? (
          <>
            <label className="field">
              <span>账户</span>
              <select
                name="accountId"
                required
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="" disabled>
                  选择账户
                </option>
                <AccountOptions accounts={accounts} />
              </select>
            </label>
            <p className="balance-context">
              当前 App 余额
              <strong>{selectedAccount?.balanceDisplay ?? "请选择账户"}</strong>
            </p>
            <label className="field amount-field">
              <span>实际余额</span>
              <div className="amount-input-wrap">
                <input
                  name="actualBalance"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  placeholder="可输入负数"
                />
                <span>{selectedAccount?.asset.code ?? "资产"}</span>
              </div>
              <small>{precisionText(selectedAccount)}</small>
            </label>
            {dateField}
            <p className="anchor-warning">
              该余额将成为此时间点的新锚点；更早日期后来补记的流水不会改变该锚点之后的余额。
            </p>
          </>
        ) : null}

        {operationType === "expense" || operationType === "income" ? (
          <label className="field">
            <span>对象（可选）</span>
            <input
              name="payee"
              autoComplete="off"
              defaultValue={initial?.payee ?? ""}
              placeholder={
                operationType === "expense" ? "例如：便利店" : "例如：公司"
              }
            />
          </label>
        ) : null}

        {operationType === "transfer" || operationType === "exchange" ? (
          <label className="field">
            <span>备注（可选）</span>
            <textarea name="note" rows={3} defaultValue={initial?.note ?? ""} />
          </label>
        ) : null}

        {operationType !== "reconcile" && tags.length > 0 ? (
          <fieldset className="tag-fieldset">
            <legend>标签（可选）</legend>
            <div className="tag-options">
              {tags.map((tag) => (
                <label key={tag.id} className="tag-option">
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={initial?.tagIds.includes(tag.id)}
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {operationType === "expense" ||
        operationType === "income" ||
        operationType === "reconcile" ? (
          <label className="field">
            <span>备注（可选）</span>
            <textarea name="note" rows={3} defaultValue={initial?.note ?? ""} />
          </label>
        ) : null}
        <FieldError error={state.error} />
        <div className="form-actions sticky-form-action">
          <SubmitButton>保存{OPERATION_LABELS[operationType]}</SubmitButton>
        </div>
      </section>
    </form>
  );
}
