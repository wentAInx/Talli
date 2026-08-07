"use client";

import { useActionState, useEffect, useRef } from "react";

import { INITIAL_ACTION_STATE, type ActionState } from "@/app/action-state";

import { SubmitButton } from "./submit-button";

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

export function ReconciliationForm({
  action,
  assetCode,
  currentBalance,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  assetCode: string;
  currentBalance: string;
  initial?: { actualBalance: string; asOf: string; note: string | null };
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dateRef.current) {
      dateRef.current.value = localInputValue(initial?.asOf);
    }
  }, [initial?.asOf]);

  function actionWithUtc(formData: FormData) {
    const localValue = formData.get("asOfLocal");
    if (typeof localValue === "string" && localValue.length > 0) {
      formData.set("asOf", new Date(localValue).toISOString());
    }
    formAction(formData);
  }

  return (
    <form
      action={actionWithUtc}
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
          ref={dateRef}
          type="datetime-local"
          step="0.001"
          name="asOfLocal"
          required
        />
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
