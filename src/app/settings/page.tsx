import type { Metadata } from "next";

import {
  createAssetSettingsAction,
  createCategorySettingsAction,
  createTagSettingsAction,
  setAssetArchivedSettingsAction,
  setCategoryArchivedSettingsAction,
  setTagArchivedSettingsAction,
  updateAssetSettingsAction,
  updateCategorySettingsAction,
  updateTagSettingsAction,
  updateTimeZoneSettingsAction,
} from "@/app/actions";
import { ConfirmActionForm } from "@/components/forms/confirm-action-form";
import { SettingsActionForm } from "@/components/forms/settings-action-form";
import { RestorePanel } from "@/components/settings/restore-panel";
import { ReferenceDataService, SettingsService } from "@/services";

import { withDatabase } from "../server-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "设置" };

const ASSET_TYPE_LABELS = {
  fiat: "法币",
  crypto: "加密资产",
  custom: "自定义",
} as const;

const CATEGORY_TYPE_LABELS = {
  expense: "支出",
  income: "收入",
  both: "收支通用",
} as const;

function ArchiveControl({
  action,
  archived,
  disabled = false,
  disabledReason,
  label,
}: {
  action: () => Promise<void>;
  archived: boolean;
  disabled?: boolean;
  disabledReason?: string;
  label: string;
}) {
  if (disabled) {
    return (
      <div className="archive-disabled">
        <button className="danger-button" disabled type="button">
          归档
        </button>
        <small>{disabledReason}</small>
      </div>
    );
  }
  return (
    <ConfirmActionForm
      action={action}
      message={`确认${archived ? "取消归档" : "归档"}${label}？历史记录会保留。`}
    >
      {archived ? "取消归档" : "归档"}
    </ConfirmActionForm>
  );
}

export default async function SettingsPage() {
  const data = await withDatabase((context) => {
    const references = new ReferenceDataService(context).getSettingsData();
    return {
      ...references,
      timeZone: new SettingsService(context).getTimeZoneOrDefault(),
    };
  });

  return (
    <div className="page-stack settings-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Reference data and self-hosting</p>
          <h1>设置</h1>
          <p>维护记账基础资料、App 时区与本机数据备份。</p>
        </div>
      </header>

      <nav className="settings-jump" aria-label="设置分区">
        <a href="#assets">资产</a>
        <a href="#categories">分类</a>
        <a href="#tags">标签</a>
        <a href="#preferences">偏好</a>
        <a href="#data">数据</a>
        <a href="#about">关于</a>
      </nav>

      <section className="content-section" id="assets">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Native asset definitions</p>
            <h2>资产</h2>
          </div>
          <span>{data.assets.length} 种</span>
        </div>
        <SettingsActionForm
          action={createAssetSettingsAction}
          submitLabel="新增资产"
        >
          <div className="settings-form-grid">
            <label className="field">
              <span>代码</span>
              <input maxLength={30} name="code" placeholder="JPY" required />
            </label>
            <label className="field">
              <span>名称</span>
              <input name="name" placeholder="Japanese Yen" required />
            </label>
            <label className="field">
              <span>符号</span>
              <input name="symbol" placeholder="¥" />
            </label>
            <label className="field">
              <span>类型</span>
              <select defaultValue="fiat" name="assetType">
                {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>小数精度</span>
              <input
                defaultValue="2"
                max="30"
                min="0"
                name="scale"
                type="number"
              />
            </label>
            <label className="field">
              <span>排序</span>
              <input defaultValue="0" name="sortOrder" type="number" />
            </label>
          </div>
        </SettingsActionForm>
        <div className="settings-records">
          {data.assets.map((asset) => {
            const update = updateAssetSettingsAction.bind(null, asset.id);
            const archive = setAssetArchivedSettingsAction.bind(
              null,
              asset.id,
              !asset.isArchived,
            );
            return (
              <details key={asset.id} className="settings-record">
                <summary>
                  <span>
                    <strong>{asset.code}</strong> · {asset.name}
                  </span>
                  <small>
                    {asset.isArchived
                      ? "已归档"
                      : ASSET_TYPE_LABELS[asset.assetType]}
                  </small>
                </summary>
                <SettingsActionForm action={update} submitLabel="保存资产">
                  <div className="settings-form-grid">
                    <label className="field">
                      <span>代码</span>
                      <input defaultValue={asset.code} name="code" required />
                    </label>
                    <label className="field">
                      <span>名称</span>
                      <input defaultValue={asset.name} name="name" required />
                    </label>
                    <label className="field">
                      <span>符号</span>
                      <input defaultValue={asset.symbol ?? ""} name="symbol" />
                    </label>
                    <label className="field">
                      <span>类型</span>
                      {asset.factsLocked ? (
                        <input
                          name="assetType"
                          type="hidden"
                          value={asset.assetType}
                        />
                      ) : null}
                      <select
                        defaultValue={asset.assetType}
                        disabled={asset.factsLocked}
                        name={asset.factsLocked ? undefined : "assetType"}
                      >
                        {Object.entries(ASSET_TYPE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="field">
                      <span>小数精度</span>
                      <input
                        defaultValue={asset.scale}
                        max="30"
                        min="0"
                        name="scale"
                        readOnly={asset.factsLocked}
                        type="number"
                      />
                    </label>
                    <label className="field">
                      <span>排序</span>
                      <input
                        defaultValue={asset.sortOrder}
                        name="sortOrder"
                        type="number"
                      />
                    </label>
                  </div>
                  <small className="settings-hint">
                    已有账户引用后，类型与小数精度会锁定。
                  </small>
                </SettingsActionForm>
                <ArchiveControl
                  action={archive}
                  archived={asset.isArchived}
                  disabled={!asset.isArchived && asset.hasActiveAccounts}
                  disabledReason="请先归档该资产下的所有活跃账户。"
                  label={`资产 ${asset.code}`}
                />
              </details>
            );
          })}
        </div>
      </section>

      <section className="content-section" id="categories">
        <div className="section-heading">
          <h2>分类</h2>
          <span>{data.categories.length} 个</span>
        </div>
        <SettingsActionForm
          action={createCategorySettingsAction}
          submitLabel="新增分类"
        >
          <div className="settings-form-grid">
            <label className="field">
              <span>名称</span>
              <input name="name" required />
            </label>
            <label className="field">
              <span>类型</span>
              <select defaultValue="expense" name="categoryType">
                {Object.entries(CATEGORY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>父级</span>
              <select defaultValue="" name="parentId">
                <option value="">无父级</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>排序</span>
              <input defaultValue="0" name="sortOrder" type="number" />
            </label>
          </div>
        </SettingsActionForm>
        <div className="settings-records">
          {data.categories.map((category) => {
            const update = updateCategorySettingsAction.bind(null, category.id);
            const archive = setCategoryArchivedSettingsAction.bind(
              null,
              category.id,
              !category.isArchived,
            );
            return (
              <details key={category.id} className="settings-record">
                <summary>
                  <span>{category.name}</span>
                  <small>
                    {category.isArchived ? "已归档 · " : ""}
                    {CATEGORY_TYPE_LABELS[category.categoryType]}
                  </small>
                </summary>
                <SettingsActionForm action={update} submitLabel="保存分类">
                  <div className="settings-form-grid">
                    <label className="field">
                      <span>名称</span>
                      <input
                        defaultValue={category.name}
                        name="name"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>类型</span>
                      <select
                        defaultValue={category.categoryType}
                        name="categoryType"
                      >
                        {Object.entries(CATEGORY_TYPE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="field">
                      <span>父级</span>
                      <select
                        defaultValue={category.parentId ?? ""}
                        name="parentId"
                      >
                        <option value="">无父级</option>
                        {data.categories
                          .filter((candidate) => candidate.id !== category.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>排序</span>
                      <input
                        defaultValue={category.sortOrder}
                        name="sortOrder"
                        type="number"
                      />
                    </label>
                  </div>
                </SettingsActionForm>
                <ArchiveControl
                  action={archive}
                  archived={category.isArchived}
                  label={`分类 ${category.name}`}
                />
              </details>
            );
          })}
        </div>
      </section>

      <section className="content-section" id="tags">
        <div className="section-heading">
          <h2>标签</h2>
          <span>{data.tags.length} 个</span>
        </div>
        <SettingsActionForm
          action={createTagSettingsAction}
          submitLabel="新增标签"
        >
          <label className="field">
            <span>标签名称</span>
            <input name="name" required />
          </label>
        </SettingsActionForm>
        <div className="settings-records compact-records">
          {data.tags.map((tag) => {
            const update = updateTagSettingsAction.bind(null, tag.id);
            const archive = setTagArchivedSettingsAction.bind(
              null,
              tag.id,
              !tag.isArchived,
            );
            return (
              <div className="settings-record tag-record" key={tag.id}>
                <SettingsActionForm action={update} submitLabel="保存标签">
                  <label className="field">
                    <span>{tag.isArchived ? "已归档标签" : "标签"}</span>
                    <input defaultValue={tag.name} name="name" required />
                  </label>
                </SettingsActionForm>
                <ArchiveControl
                  action={archive}
                  archived={tag.isArchived}
                  label={`标签 ${tag.name}`}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="content-section" id="preferences">
        <div className="section-heading">
          <h2>日期与时区</h2>
        </div>
        <p className="settings-copy">
          交易输入、流水显示与月报边界统一使用该 IANA 时区；数据库仍保存 UTC。
        </p>
        <SettingsActionForm
          action={updateTimeZoneSettingsAction}
          submitLabel="保存时区"
        >
          <label className="field">
            <span>App 时区</span>
            <input
              defaultValue={data.timeZone}
              list="common-timezones"
              name="timeZone"
              required
            />
          </label>
          <datalist id="common-timezones">
            <option value="Asia/Shanghai" />
            <option value="Asia/Hong_Kong" />
            <option value="Asia/Tokyo" />
            <option value="Europe/London" />
            <option value="America/New_York" />
            <option value="UTC" />
          </datalist>
        </SettingsActionForm>
      </section>

      <section className="content-section" id="data">
        <div className="section-heading">
          <h2>备份、导出与恢复</h2>
        </div>
        <div className="data-downloads">
          <a className="primary-button" href="/api/data/backup">
            下载无损 JSON 备份
          </a>
          <a className="secondary-button" href="/api/data/export.csv">
            下载流水 CSV
          </a>
        </div>
        <p className="settings-copy">
          JSON 保留所有 ID、UTC 时间和 atomic integer string；CSV
          用于人工查看，不代替备份。
        </p>
        <RestorePanel />
      </section>

      <section className="content-section" id="about">
        <div className="section-heading">
          <h2>关于 Asset Ledger V1</h2>
        </div>
        <p className="settings-copy">
          单用户、自托管、多资产原生数量账本。V1 不接行情、不把 USDT 当作
          USD，也不提供跨资产总估值。
        </p>
      </section>
    </div>
  );
}
