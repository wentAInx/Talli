"use client";

import { useActionState, useState } from "react";

import { INITIAL_ACTION_STATE, type ActionState } from "@/app/action-state";
import type { AccountView, AssetView } from "@/services";

import { SubmitButton } from "./submit-button";

const ACCOUNT_TYPES = [
  ["cash", "现金"],
  ["bank", "银行"],
  ["ewallet", "电子钱包"],
  ["exchange", "交易所"],
  ["crypto_wallet", "Crypto 钱包"],
  ["credit", "信用账户"],
  ["loan", "借贷"],
  ["other", "其他"],
] as const;

export function AccountForm({
  action,
  assets,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  assets: AssetView[];
  initial?: AccountView;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [assetId, setAssetId] = useState(initial?.asset.id ?? "");
  const selectedAsset = assets.find((asset) => asset.id === assetId);

  return (
    <form action={formAction} autoComplete="off" className="form-stack">
      <div className="field-grid field-grid-two">
        <label className="field">
          <span>账户名称</span>
          <input
            name="name"
            autoComplete="off"
            required
            defaultValue={initial?.name ?? ""}
            placeholder="例如：支付宝"
          />
        </label>
        <label className="field">
          <span>账户类型</span>
          <select
            name="accountType"
            required
            defaultValue={initial?.type ?? ""}
          >
            <option value="" disabled>
              选择类型
            </option>
            {ACCOUNT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {initial && !initial.canChangeAsset ? (
        <div className="field read-only-field">
          <input type="hidden" name="assetId" value={initial.asset.id} />
          <span>资产</span>
          <strong>
            {initial.asset.code} · {initial.asset.name}
          </strong>
          <small>
            账户已有流水或余额锚点；更改资产会改变历史金额解释，因此保持只读。
          </small>
        </div>
      ) : (
        <label className="field">
          <span>资产</span>
          <select
            name="assetId"
            required
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
          >
            <option value="" disabled>
              选择原生资产
            </option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.code} · {asset.name} · 最多 {asset.scale} 位小数
              </option>
            ))}
          </select>
          {initial ? (
            <small>该账户没有任何历史记录，可以更改资产。</small>
          ) : null}
        </label>
      )}

      <label className="field">
        <span>机构 / 分组（可选）</span>
        <input
          name="institutionName"
          autoComplete="organization"
          defaultValue={initial?.institutionName ?? ""}
          placeholder="例如：招商银行、Kraken"
        />
      </label>

      {!initial ? (
        <label className="field">
          <span>初始余额（可选）</span>
          <input
            name="initialBalance"
            inputMode="decimal"
            autoComplete="off"
            placeholder="可输入负数；留空则不创建余额锚点"
          />
          <small data-testid="initial-balance-precision">
            {selectedAsset
              ? `${selectedAsset.code} · 最多 ${selectedAsset.scale} 位小数。`
              : "请先选择上方选项以确认金额单位与精度。"}
            初始余额会保存为账户创建时刻的余额锚点，不会记为收入。
          </small>
        </label>
      ) : null}

      <label className="field">
        <span>备注（可选）</span>
        <textarea name="note" rows={3} defaultValue={initial?.note ?? ""} />
      </label>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="form-actions">
        <SubmitButton>{initial ? "保存账户" : "创建账户"}</SubmitButton>
      </div>
    </form>
  );
}
