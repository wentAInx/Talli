import { createHash } from "node:crypto";

import {
  canonicalExternalJson,
  type CanonicalJsonValue,
  validatedExternalDecimalText,
} from "../../domain/external-sync";
import { KrakenProviderError } from "./errors";
import type {
  KrakenAssetMetadata,
  KrakenBalanceRecord,
  KrakenPairMetadata,
  KrakenPermissionCheck,
  KrakenReferenceData,
  KrakenSourceObject,
} from "./types";

const REQUIRED_PERMISSIONS = [
  "query-funds",
  "query-ledger",
  "query-closed-trades",
] as const;
const FORBIDDEN_WRITE_PERMISSIONS = [
  "add-funds",
  "withdraw-funds",
  "earn-funds",
  "modify-trades",
  "close-trades",
  "add-withdraw-address",
  "update-withdraw-address",
] as const;
const KNOWN_READ_ONLY_PERMISSIONS = new Set([
  ...REQUIRED_PERMISSIONS,
  "query-open-trades",
  "export-data",
  "create-ws-token",
]);

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      `Kraken ${label} payload is invalid.`,
    );
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      `Kraken ${field} is invalid.`,
    );
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function requiredDecimal(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      `Kraken ${field} is invalid.`,
    );
  }
  try {
    return validatedExternalDecimalText(String(value));
  } catch {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      `Kraken ${field} is invalid.`,
    );
  }
}

export function krakenUnixTimeToIso(value: unknown): string {
  const text = requiredDecimal(value, "time");
  if (text.startsWith("-") || text.startsWith("+")) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken time is invalid.",
    );
  }
  const [secondsText, fraction = ""] = text.split(".");
  const seconds = BigInt(secondsText!);
  const milliseconds = BigInt((fraction + "000").slice(0, 3));
  const epochMilliseconds = seconds * 1000n + milliseconds;
  const numeric = Number(epochMilliseconds);
  if (!Number.isSafeInteger(numeric)) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken time is outside the supported range.",
    );
  }
  const instant = new Date(numeric);
  if (Number.isNaN(instant.getTime())) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken time is invalid.",
    );
  }
  return instant.toISOString();
}

export function evaluateKrakenPermissions(
  permissions: readonly string[],
): KrakenPermissionCheck {
  const unique = [...new Set(permissions.map((value) => value.trim()))]
    .filter(Boolean)
    .sort();
  const missingRequired = REQUIRED_PERMISSIONS.filter(
    (permission) => !unique.includes(permission),
  );
  const forbiddenWritePermissions = FORBIDDEN_WRITE_PERMISSIONS.filter(
    (permission) => unique.includes(permission),
  );
  const extraReadOnlyPermissions = unique.filter(
    (permission) =>
      !REQUIRED_PERMISSIONS.includes(
        permission as (typeof REQUIRED_PERMISSIONS)[number],
      ) &&
      !forbiddenWritePermissions.includes(
        permission as (typeof FORBIDDEN_WRITE_PERMISSIONS)[number],
      ) &&
      KNOWN_READ_ONLY_PERMISSIONS.has(permission),
  );
  return {
    ok: missingRequired.length === 0 && forbiddenWritePermissions.length === 0,
    permissions: unique,
    missingRequired,
    forbiddenWritePermissions,
    extraReadOnlyPermissions,
  };
}

export function parseKrakenPermissionPayload(
  result: unknown,
): KrakenPermissionCheck {
  const value = record(result, "API key info");
  if (!Array.isArray(value.permissions)) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Kraken API key permissions are invalid.",
    );
  }
  const permissions = value.permissions.map((permission) =>
    requiredString(permission, "permission"),
  );
  return evaluateKrakenPermissions(permissions);
}

export function parseKrakenAssets(
  result: unknown,
): KrakenReferenceData["assets"] {
  const rows = record(result, "assets");
  return Object.fromEntries(
    Object.entries(rows)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([displayCode, raw]) => {
        const value = record(raw, `asset ${displayCode}`);
        const metadata: KrakenAssetMetadata = {
          displayCode,
          altname: optionalString(value.altname),
          decimals: optionalInteger(value.decimals),
          displayDecimals: optionalInteger(value.display_decimals),
          status: optionalString(value.status),
        };
        return [displayCode, metadata];
      }),
  );
}

export function parseKrakenAssetPairs(
  result: unknown,
): KrakenReferenceData["assetPairs"] {
  const rows = record(result, "asset pairs");
  return Object.fromEntries(
    Object.entries(rows)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([displayPair, raw]) => {
        const value = record(raw, `asset pair ${displayPair}`);
        const metadata: KrakenPairMetadata = {
          displayPair,
          altname: optionalString(value.altname),
          wsname: optionalString(value.wsname),
          base: requiredString(value.base, "pair base"),
          quote: requiredString(value.quote, "pair quote"),
          feeVolumeCurrency: optionalString(value.fee_volume_currency),
          pairDecimals: optionalInteger(value.pair_decimals),
          lotDecimals: optionalInteger(value.lot_decimals),
        };
        return [displayPair, metadata];
      }),
  );
}

export function resolveKrakenAssetDisplayCode(
  providerAssetKey: string,
  assets: KrakenReferenceData["assets"],
): string | null {
  if (assets[providerAssetKey]) return providerAssetKey;
  if (/\.[BFMST]$/.test(providerAssetKey)) return providerAssetKey;

  const exactAliases = Object.values(assets).filter(
    (asset) => asset.altname === providerAssetKey,
  );
  if (exactAliases.length === 1) return exactAliases[0]!.displayCode;

  const metadataMatches = Object.values(assets).filter((asset) => {
    const altname = asset.altname;
    return (
      altname !== null &&
      providerAssetKey.endsWith(altname) &&
      providerAssetKey.length === altname.length + 1
    );
  });
  return metadataMatches.length === 1 ? metadataMatches[0]!.displayCode : null;
}

export function resolveKrakenPair(
  providerPair: string,
  pairs: KrakenReferenceData["assetPairs"],
): KrakenPairMetadata | null {
  if (pairs[providerPair]) return pairs[providerPair];
  const normalized = providerPair.replace("/", "");
  const matches = Object.values(pairs).filter(
    (pair) =>
      pair.altname === providerPair ||
      pair.altname === normalized ||
      pair.wsname === providerPair ||
      pair.displayPair.replace("/", "") === normalized,
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function parseKrakenBalances(result: unknown): KrakenBalanceRecord[] {
  const rows = record(result, "balances");
  return Object.entries(rows)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerAssetKey, amount]) => ({
      providerAssetKey,
      amountText: requiredDecimal(amount, `balance ${providerAssetKey}`),
    }));
}

function sourceObject(input: {
  objectType: "kraken_ledger" | "kraken_trade";
  externalId: string;
  occurredAt: string;
  payload: CanonicalJsonValue;
}): KrakenSourceObject {
  const payloadJson = canonicalExternalJson(input.payload);
  return {
    objectType: input.objectType,
    externalId: input.externalId,
    occurredAt: input.occurredAt,
    payloadJson,
    payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
  };
}

export function parseKrakenLedgers(result: unknown): KrakenSourceObject[] {
  const value = record(result, "ledgers result");
  const rows = record(value.ledger, "ledgers");
  return Object.entries(rows)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([externalId, raw]) => {
      const row = record(raw, `ledger ${externalId}`);
      const payload = {
        refid: optionalString(row.refid) ?? "",
        time: requiredDecimal(row.time, "ledger time"),
        type: requiredString(row.type, "ledger type"),
        subtype: typeof row.subtype === "string" ? row.subtype : "",
        asset: requiredString(row.asset, "ledger asset"),
        amount: requiredDecimal(row.amount, "ledger amount"),
        fee: requiredDecimal(row.fee, "ledger fee"),
        balance: requiredDecimal(row.balance, "ledger balance"),
      };
      return sourceObject({
        objectType: "kraken_ledger",
        externalId,
        occurredAt: krakenUnixTimeToIso(payload.time),
        payload,
      });
    });
}

export function parseKrakenTrades(result: unknown): KrakenSourceObject[] {
  const value = record(result, "trades result");
  const rows = record(value.trades, "trades");
  return Object.entries(rows)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([externalId, raw]) => {
      const row = record(raw, `trade ${externalId}`);
      const ledgers = Array.isArray(row.ledgers)
        ? row.ledgers.map((item) => requiredString(item, "trade ledger ID"))
        : [];
      const payload = {
        ordertxid: requiredString(row.ordertxid, "trade order ID"),
        postxid: optionalString(row.postxid) ?? "",
        pair: requiredString(row.pair, "trade pair"),
        time: requiredDecimal(row.time, "trade time"),
        type: requiredString(row.type, "trade type"),
        price: requiredDecimal(row.price, "trade price"),
        cost: requiredDecimal(row.cost, "trade cost"),
        fee: requiredDecimal(row.fee, "trade fee"),
        vol: requiredDecimal(row.vol, "trade volume"),
        ledgers,
      };
      return sourceObject({
        objectType: "kraken_trade",
        externalId,
        occurredAt: krakenUnixTimeToIso(payload.time),
        payload,
      });
    });
}

export function krakenResultCount(result: unknown): number | null {
  const value = record(result, "paginated result");
  return typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0
    ? value.count
    : null;
}
