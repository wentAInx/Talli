"use client";

import { useState } from "react";

import type {
  AllocationSlice,
  HistoricalAllocationResult,
} from "@/domain/historical-quote-types";

const tabs = [
  { key: "asset", label: "按资产" },
  { key: "class", label: "按资产类别" },
  { key: "fiat", label: "法币币种" },
] as const;

function rows(
  result: HistoricalAllocationResult,
  tab: (typeof tabs)[number]["key"],
): AllocationSlice[] {
  if (tab === "class") return result.byAssetClass;
  if (tab === "fiat") return result.byFiatCurrency;
  return result.byAsset;
}

export function AllocationPanel({
  result,
  homeCode,
}: {
  result: HistoricalAllocationResult;
  homeCode: string;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("asset");
  const slices = rows(result, tab);
  const activeTab = tabs.find((item) => item.key === tab)!;
  return (
    <>
      <div aria-label="资产配置维度" className="analytics-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            aria-controls={`allocation-panel-${item.key}`}
            aria-selected={tab === item.key}
            className={tab === item.key ? "is-active" : undefined}
            id={`allocation-tab-${item.key}`}
            key={item.key}
            onKeyDown={(event) => {
              const index = tabs.findIndex(
                (candidate) => candidate.key === item.key,
              );
              const nextIndex =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const next = tabs[nextIndex]!;
              setTab(next.key);
              event.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(
                  `#allocation-tab-${next.key}`,
                )
                ?.focus();
            }}
            onClick={() => setTab(item.key)}
            role="tab"
            tabIndex={tab === item.key ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`allocation-tab-${activeTab.key}`}
        id={`allocation-panel-${activeTab.key}`}
        role="tabpanel"
        tabIndex={0}
      >
        {slices.length === 0 ? (
          <p className="analytics-muted">该维度暂无正资产配置。</p>
        ) : (
          <div className="allocation-list">
            {slices.map((slice) => {
              const share =
                slice.shareText === null ? null : Number(slice.shareText);
              const width =
                share !== null && Number.isFinite(share)
                  ? `${Math.max(0, Math.min(100, share * 100))}%`
                  : "0%";
              return (
                <div className="allocation-row" key={slice.key}>
                  <div>
                    <strong>{slice.label}</strong>
                    <span>{`${slice.valueText} ${homeCode}`}</span>
                  </div>
                  <div className="allocation-track" aria-hidden="true">
                    <span style={{ width }} />
                  </div>
                  <small>
                    {slice.shareText === null
                      ? "占比待完整报价"
                      : `${slice.shareText} × gross assets`}
                  </small>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
