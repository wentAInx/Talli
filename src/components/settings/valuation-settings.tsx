import {
  createManualPriceSettingsAction,
  deactivateManualPriceSettingsAction,
  updateHomeAssetSettingsAction,
  updateProviderMappingSettingsAction,
} from "@/app/actions";
import { utcInstantToLocalDateTime } from "@/domain/time";
import type { SafeProviderConfigurationView } from "@/providers/types";
import type { readValuationConfiguration } from "@/services";

import { ConfirmActionForm } from "../forms/confirm-action-form";
import { SettingsActionForm } from "../forms/settings-action-form";

type Configuration = ReturnType<typeof readValuationConfiguration>;

function displayInstant(value: string | null, timeZone: string): string {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function ValuationSettings({
  bookId,
  configuration,
  providerConfiguration,
  timeZone,
  now,
}: {
  bookId: string;
  configuration: Configuration;
  providerConfiguration: SafeProviderConfigurationView[];
  timeZone: string;
  now: string;
}) {
  const home = configuration.settings.find(
    (setting) => setting.bookId === bookId,
  );
  const activeFiat = configuration.assets.filter(
    (asset) => asset.assetType === "fiat" && !asset.isArchived,
  );
  const activeAssets = configuration.assets.filter(
    (asset) => !asset.isArchived,
  );
  const assetById = new Map(
    configuration.assets.map((asset) => [asset.id, asset]),
  );
  const latestEcbObservation = configuration.latestQuotes
    .filter((quote) => quote.provider === "ecb")
    .flatMap((quote) =>
      quote.providerObservationDate ? [quote.providerObservationDate] : [],
    )
    .sort()
    .at(-1);
  const localNow = utcInstantToLocalDateTime(now, timeZone).slice(0, 16);

  return (
    <section className="content-section valuation-settings" id="valuation">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Current prices · approximate display</p>
          <h2>估值与价格</h2>
        </div>
        <span>V2.0</span>
      </div>
      <p className="settings-copy">
        估值只增加近似显示层，不修改账户原生数量、流水或余额锚点。
      </p>

      <div className="valuation-settings-grid">
        <article className="valuation-settings-card">
          <h3>Home Asset</h3>
          <p>仅可选择未归档法币；修改后不会删除已有价格缓存。</p>
          <SettingsActionForm
            action={updateHomeAssetSettingsAction}
            submitLabel="保存 Home Asset"
          >
            <label className="field">
              <span>估值币种</span>
              <select
                defaultValue={home?.homeAssetId ?? ""}
                name="homeAssetId"
                required
              >
                <option disabled value="">
                  请选择
                </option>
                {activeFiat.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                  </option>
                ))}
              </select>
            </label>
          </SettingsActionForm>
        </article>

        <article className="valuation-settings-card">
          <h3>价格源状态</h3>
          <div className="provider-status-list">
            {providerConfiguration.map((provider) => {
              const state = configuration.providerStates.find(
                (candidate) => candidate.provider === provider.provider,
              );
              return (
                <div
                  key={provider.provider}
                  data-testid={`provider-${provider.provider}`}
                >
                  <strong>
                    {provider.provider === "coingecko"
                      ? "CoinGecko market"
                      : "ECB reference rates"}
                  </strong>
                  <small>
                    {provider.provider === "coingecko"
                      ? provider.mode === "keyless"
                        ? "Keyless 模式 · 不发送 API key"
                        : provider.mode === "demo"
                          ? `Demo key：${provider.configured ? "已配置" : "未配置"}`
                          : "配置错误：COINGECKO_MODE 必须为 demo 或 keyless"
                      : "公开参考汇率 · 无需 API key"}
                  </small>
                  <small>
                    最近成功：
                    {displayInstant(state?.lastSuccessAt ?? null, timeZone)}
                  </small>
                  {provider.provider === "ecb" ? (
                    <small>
                      最新 observation：{latestEcbObservation ?? "暂无"}
                    </small>
                  ) : null}
                  {state?.lastErrorCode ? (
                    <small>最近错误：{state.lastErrorCode}</small>
                  ) : null}
                  {state?.cooldownUntil ? (
                    <small>
                      Cooldown 至：
                      {displayInstant(state.cooldownUntil, timeZone)}
                    </small>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <div className="valuation-subsection">
        <h3>资产映射</h3>
        <p className="settings-copy">
          映射使用明确的 provider key，不按 symbol 或名称自动猜测。
        </p>
        <div className="settings-records compact-records">
          {configuration.mappings.map((mapping) => {
            const asset = assetById.get(mapping.assetId);
            const action = updateProviderMappingSettingsAction.bind(
              null,
              mapping.assetId,
              mapping.provider,
            );
            return (
              <details
                className="settings-record"
                data-testid={`mapping-${asset?.code ?? mapping.assetId}-${mapping.provider}`}
                key={`${mapping.assetId}-${mapping.provider}`}
              >
                <summary>
                  <span>
                    <strong>{asset?.code ?? mapping.assetId}</strong> ·{" "}
                    {mapping.provider}
                  </span>
                  <small>
                    {mapping.providerAssetKey} ·{" "}
                    {mapping.isEnabled ? "已启用" : "已停用"}
                  </small>
                </summary>
                <SettingsActionForm action={action} submitLabel="保存映射">
                  <div className="settings-form-grid">
                    <label className="field">
                      <span>Provider key</span>
                      <input
                        defaultValue={mapping.providerAssetKey}
                        maxLength={128}
                        name="providerAssetKey"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>优先级</span>
                      <input
                        defaultValue={mapping.priority}
                        name="priority"
                        type="number"
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        defaultChecked={mapping.isEnabled}
                        name="isEnabled"
                        type="checkbox"
                      />
                      <span>启用该映射</span>
                    </label>
                  </div>
                </SettingsActionForm>
              </details>
            );
          })}
        </div>
      </div>

      <div className="valuation-subsection">
        <h3>手动 exact-pair 价格</h3>
        <p className="settings-copy">
          Active 手动价格会覆盖相同 base → quote 的自动价格路径。
        </p>
        <SettingsActionForm
          action={createManualPriceSettingsAction}
          submitLabel="保存并启用"
        >
          <div className="settings-form-grid">
            <label className="field">
              <span>基础资产</span>
              <select name="baseAssetId" required>
                {activeAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>报价资产</span>
              <select
                defaultValue={home?.homeAssetId ?? ""}
                name="quoteAssetId"
                required
              >
                {activeAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>价格（1 BASE = ? QUOTE）</span>
              <input inputMode="decimal" name="rateText" required />
            </label>
            <label className="field">
              <span>观察时间</span>
              <input
                defaultValue={localNow}
                name="observedAtLocal"
                type="datetime-local"
                required
              />
            </label>
            <label className="field settings-wide-field">
              <span>备注（可选）</span>
              <input maxLength={1000} name="note" />
            </label>
          </div>
        </SettingsActionForm>

        <div className="manual-quote-list">
          {configuration.manualQuotes.length === 0 ? (
            <p className="settings-copy">尚无手动价格。</p>
          ) : (
            configuration.manualQuotes.map((quote) => {
              const base = assetById.get(quote.baseAssetId);
              const target = assetById.get(quote.quoteAssetId);
              return (
                <article className="manual-quote-row" key={quote.id}>
                  <div>
                    <strong>
                      1 {base?.code ?? quote.baseAssetId} = {quote.rateText}{" "}
                      {target?.code ?? quote.quoteAssetId}
                    </strong>
                    <small>
                      {quote.isActive ? "Active · 覆盖自动路径" : "已停用"} ·{" "}
                      {displayInstant(quote.observedAt, timeZone)}
                    </small>
                  </div>
                  {quote.isActive ? (
                    <ConfirmActionForm
                      action={deactivateManualPriceSettingsAction.bind(
                        null,
                        quote.id,
                      )}
                      message="确认停用这条手动价格？系统将恢复自动价格路径。"
                    >
                      停用
                    </ConfirmActionForm>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>

      <p className="provider-attribution">
        Crypto market data provided by{" "}
        <a href="https://www.coingecko.com/" rel="noreferrer" target="_blank">
          CoinGecko
        </a>
        . ECB 数据为参考汇率，并非实时成交报价。
      </p>
    </section>
  );
}
