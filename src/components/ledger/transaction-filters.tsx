import Link from "next/link";

import type { LedgerFilterReferenceView } from "@/services";

export interface TransactionFilterValues {
  from?: string;
  to?: string;
  type?: string;
  account?: string;
  asset?: string;
  category?: string;
  tag?: string;
  q?: string;
}

function optionLabel(label: string, isArchived: boolean): string {
  return isArchived ? `${label}（已归档）` : label;
}

export function TransactionFilters({
  values,
  references,
}: {
  values: TransactionFilterValues;
  references: LedgerFilterReferenceView;
}) {
  return (
    <form autoComplete="off" className="transaction-filters" method="get">
      <div className="filter-grid">
        <label className="field filter-search">
          <span>搜索</span>
          <input
            defaultValue={values.q}
            maxLength={100}
            name="q"
            placeholder="商户、备注、账户、资产、分类或标签"
            type="search"
          />
        </label>
        <label className="field">
          <span>类型</span>
          <select defaultValue={values.type ?? ""} name="type">
            <option value="">全部类型</option>
            <option value="expense">支出</option>
            <option value="income">收入</option>
            <option value="transfer">转账</option>
            <option value="exchange">兑换</option>
          </select>
        </label>
        <label className="field">
          <span>账户</span>
          <select defaultValue={values.account ?? ""} name="account">
            <option value="">全部账户</option>
            {references.accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option.label, option.isArchived)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>资产</span>
          <select defaultValue={values.asset ?? ""} name="asset">
            <option value="">全部资产</option>
            {references.assets.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option.label, option.isArchived)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>分类</span>
          <select defaultValue={values.category ?? ""} name="category">
            <option value="">全部分类</option>
            {references.categories.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option.label, option.isArchived)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>标签</span>
          <select defaultValue={values.tag ?? ""} name="tag">
            <option value="">全部标签</option>
            {references.tags.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option.label, option.isArchived)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>开始日期</span>
          <input defaultValue={values.from} name="from" type="date" />
        </label>
        <label className="field">
          <span>结束日期</span>
          <input defaultValue={values.to} name="to" type="date" />
        </label>
      </div>
      <div className="filter-actions">
        <button className="primary-button" type="submit">
          应用筛选
        </button>
        <Link className="secondary-button" href="/transactions">
          清空
        </Link>
      </div>
    </form>
  );
}
