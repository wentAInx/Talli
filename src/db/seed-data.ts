import type { AssetRow, CategoryRow } from "./schema";

export const SEED_SCHEMA_VERSION = 2;
export const SEED_TIMESTAMP = "2026-08-07T00:00:00.000Z";
export const SEED_BOOK_ID = "seed-book-default";
export const SEED_DEFAULT_HOME_ASSET_CODE = "CNY";

type SeedAsset = Pick<
  AssetRow,
  "id" | "code" | "name" | "symbol" | "assetType" | "scale" | "sortOrder"
>;

type SeedCategory = Pick<
  CategoryRow,
  "id" | "name" | "categoryType" | "sortOrder"
>;

export const SEED_ASSETS = [
  {
    id: "seed-asset-cny",
    code: "CNY",
    name: "Chinese Yuan",
    symbol: "¥",
    assetType: "fiat",
    scale: 2,
    sortOrder: 10,
  },
  {
    id: "seed-asset-usd",
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    assetType: "fiat",
    scale: 2,
    sortOrder: 20,
  },
  {
    id: "seed-asset-eur",
    code: "EUR",
    name: "Euro",
    symbol: "€",
    assetType: "fiat",
    scale: 2,
    sortOrder: 30,
  },
  {
    id: "seed-asset-hkd",
    code: "HKD",
    name: "Hong Kong Dollar",
    symbol: "HK$",
    assetType: "fiat",
    scale: 2,
    sortOrder: 40,
  },
  {
    id: "seed-asset-usdt",
    code: "USDT",
    name: "Tether",
    symbol: "USDT",
    assetType: "crypto",
    scale: 6,
    sortOrder: 100,
  },
  {
    id: "seed-asset-usdc",
    code: "USDC",
    name: "USD Coin",
    symbol: "USDC",
    assetType: "crypto",
    scale: 6,
    sortOrder: 110,
  },
  {
    id: "seed-asset-btc",
    code: "BTC",
    name: "Bitcoin",
    symbol: "BTC",
    assetType: "crypto",
    scale: 8,
    sortOrder: 120,
  },
  {
    id: "seed-asset-eth",
    code: "ETH",
    name: "Ethereum",
    symbol: "ETH",
    assetType: "crypto",
    scale: 18,
    sortOrder: 130,
  },
  {
    id: "seed-asset-sol",
    code: "SOL",
    name: "Solana",
    symbol: "SOL",
    assetType: "crypto",
    scale: 9,
    sortOrder: 140,
  },
] as const satisfies readonly SeedAsset[];

export const SEED_CATEGORIES = [
  {
    id: "seed-category-expense-food",
    name: "餐饮",
    categoryType: "expense",
    sortOrder: 10,
  },
  {
    id: "seed-category-expense-transport",
    name: "交通",
    categoryType: "expense",
    sortOrder: 20,
  },
  {
    id: "seed-category-expense-shopping",
    name: "购物",
    categoryType: "expense",
    sortOrder: 30,
  },
  {
    id: "seed-category-expense-housing",
    name: "住房",
    categoryType: "expense",
    sortOrder: 40,
  },
  {
    id: "seed-category-expense-subscriptions",
    name: "订阅",
    categoryType: "expense",
    sortOrder: 50,
  },
  {
    id: "seed-category-expense-servers",
    name: "服务器",
    categoryType: "expense",
    sortOrder: 60,
  },
  {
    id: "seed-category-expense-learning",
    name: "学习",
    categoryType: "expense",
    sortOrder: 70,
  },
  {
    id: "seed-category-expense-entertainment",
    name: "娱乐",
    categoryType: "expense",
    sortOrder: 80,
  },
  {
    id: "seed-category-expense-healthcare",
    name: "医疗",
    categoryType: "expense",
    sortOrder: 90,
  },
  {
    id: "seed-category-expense-travel",
    name: "旅行",
    categoryType: "expense",
    sortOrder: 100,
  },
  {
    id: "seed-category-income-salary",
    name: "工资/收入",
    categoryType: "income",
    sortOrder: 110,
  },
  {
    id: "seed-category-income-refund",
    name: "退款",
    categoryType: "income",
    sortOrder: 120,
  },
  {
    id: "seed-category-both-other",
    name: "其他",
    categoryType: "both",
    sortOrder: 130,
  },
] as const satisfies readonly SeedCategory[];

export const SEED_PROVIDER_MAPPINGS = [
  {
    assetCode: "CNY",
    expectedAssetType: "fiat",
    provider: "ecb",
    providerAssetKey: "CNY",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "USD",
    expectedAssetType: "fiat",
    provider: "ecb",
    providerAssetKey: "USD",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "EUR",
    expectedAssetType: "fiat",
    provider: "ecb",
    providerAssetKey: "EUR",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "HKD",
    expectedAssetType: "fiat",
    provider: "ecb",
    providerAssetKey: "HKD",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "USDT",
    expectedAssetType: "crypto",
    provider: "coingecko",
    providerAssetKey: "tether",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "USDC",
    expectedAssetType: "crypto",
    provider: "coingecko",
    providerAssetKey: "usd-coin",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "BTC",
    expectedAssetType: "crypto",
    provider: "coingecko",
    providerAssetKey: "bitcoin",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "ETH",
    expectedAssetType: "crypto",
    provider: "coingecko",
    providerAssetKey: "ethereum",
    priority: 100,
    isEnabled: true,
  },
  {
    assetCode: "SOL",
    expectedAssetType: "crypto",
    provider: "coingecko",
    providerAssetKey: "solana",
    priority: 100,
    isEnabled: true,
  },
] as const;

export function seedAssetId(code: string): string {
  const definition = SEED_ASSETS.find((asset) => asset.code === code);
  if (!definition) {
    throw new Error(`Unknown canonical seed asset: ${code}.`);
  }
  return definition.id;
}
