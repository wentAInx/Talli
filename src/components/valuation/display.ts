import type { QuoteResolution } from "@/domain/quote-types";

function groupedDecimal(text: string): string {
  const sign = text.startsWith("-") ? "-" : "";
  const unsigned = sign ? text.slice(1) : text;
  const [whole, fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function homeValueDisplay(
  valueText: string,
  home: { code: string; symbol: string | null },
): string {
  return `${home.symbol ?? ""}${groupedDecimal(valueText)} ${home.code}`;
}

export function quoteStatusLabel(resolution: QuoteResolution): string {
  if (resolution.ok) {
    return {
      identity: "原生币种",
      manual: "手动价格",
      fresh: "价格新鲜",
      stale: "价格已过期",
    }[resolution.status];
  }
  return {
    missing_mapping: "缺少映射",
    missing_quote: "价格不可用",
    provider_error: "价格源错误",
    unsupported: "暂不支持",
  }[resolution.status];
}

export function quoteFailureMessage(resolution: QuoteResolution): string {
  if (resolution.ok) return "";
  return {
    missing_mapping: "尚未启用所需的价格源映射。",
    missing_quote: "当前没有可用的缓存价格。",
    provider_error: "价格源暂时不可用，旧缓存也已超过可用期限。",
    unsupported: "当前资产组合暂不支持估值。",
  }[resolution.status];
}
