"use client";

import { useActionState } from "react";

import { INITIAL_ACTION_STATE, type ActionState } from "@/app/action-state";
import { utcInstantToLocalDateTime } from "@/domain/time";

import { SubmitButton } from "./submit-button";

export function ReconciliationForm({
  action,
  assetCode,
  currentBalance,
  initial,
  timeZone,
  defaultAsOf,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  assetCode: string;
  currentBalance: string;
  initial?: { actualBalance: string; asOf: string; note: string | null };
  timeZone: string;
  defaultAsOf: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const localAsOf = utcInstantToLocalDateTime(
    initial?.asOf ?? defaultAsOf,
    timeZone,
  );

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="form-stack compact-form"
      onSubmit={(event) => {
        if (
          initial &&
          !window.confirm(
            "编辑该余额锚点后，将重新计算此时间点之后的余额。确认保存？",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <p className="balance-context">
        当前 App 余额
        <strong>{currentBalance}</strong>
      </p>
      <label className="field">
        <span>实际余额</span>
        <div className="amount-input-wrap">
          <input
            name="actualBalance"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={initial?.actualBalance ?? ""}
          />
          <span>{assetCode}</span>
        </div>
      </label>
      <label className="field">
        <span>调整时间</span>
        <input
          type="datetime-local"
          step="0.001"
          name="asOfLocal"
          required
          defaultValue={localAsOf}
        />
        <small>按 App 时区 {timeZone} 保存</small>
      </label>
      <label className="field">
        <span>备注（可选）</span>
        <input name="note" defaultValue={initial?.note ?? ""} />
      </label>
      <p className="anchor-warning">
        该余额将成为此时间点的新锚点；更早日期后来补记的流水不会改变该锚点之后的余额。
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton>{initial ? "保存锚点" : "调整余额"}</SubmitButton>
    </form>
  );
}
