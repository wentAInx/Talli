import { createHash } from "node:crypto";

import type {
  ExternalCandidateDraft,
  ExternalCandidateLegDraft,
} from "../../domain/external-sync";
import {
  externalStableKey,
  validatedExternalDecimalText,
} from "../../domain/external-sync";
import { KrakenProviderError } from "./errors";
import { resolveKrakenPair } from "./normalize";
import type { KrakenReferenceData, KrakenSourceObject } from "./types";

interface KrakenTradePayload {
  ordertxid: string;
  pair: string;
  type: string;
  cost: string;
  fee: string;
  vol: string;
  ledgers: string[];
}

interface KrakenLedgerPayload {
  refid: string;
  type: string;
  asset: string;
  amount: string;
  fee: string;
}

function parseObject(payloadJson: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson);
  } catch {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Sanitized Kraken source JSON is invalid.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      "Sanitized Kraken source JSON is invalid.",
    );
  }
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      `Sanitized Kraken ${field} is invalid.`,
    );
  }
  return candidate;
}

function tradePayload(
  source: Pick<KrakenSourceObject, "payloadJson">,
): KrakenTradePayload {
  const value = parseObject(source.payloadJson);
  return {
    ordertxid: stringField(value, "ordertxid"),
    pair: stringField(value, "pair"),
    type: stringField(value, "type"),
    cost: stringField(value, "cost"),
    fee: stringField(value, "fee"),
    vol: stringField(value, "vol"),
    ledgers: Array.isArray(value.ledgers)
      ? value.ledgers.filter(
          (candidate): candidate is string => typeof candidate === "string",
        )
      : [],
  };
}

function ledgerPayload(source: KrakenSourceObject): KrakenLedgerPayload {
  const value = parseObject(source.payloadJson);
  return {
    refid: stringField(value, "refid"),
    type: stringField(value, "type"),
    asset: stringField(value, "asset"),
    amount: stringField(value, "amount"),
    fee: stringField(value, "fee"),
  };
}

function positiveMagnitude(value: string, label: string): string {
  const normalized = validatedExternalDecimalText(value);
  if (normalized.startsWith("-") || /^\+?0+(?:\.0+)?$/.test(normalized)) {
    throw new KrakenProviderError(
      "UPSTREAM_PAYLOAD_INVALID",
      `Kraken ${label} must be positive.`,
    );
  }
  return normalized.startsWith("+") ? normalized.slice(1) : normalized;
}

function nonzeroMagnitude(value: string): string | null {
  const normalized = validatedExternalDecimalText(value);
  const magnitude = normalized.replace(/^[+-]/, "");
  return /^0+(?:\.0+)?$/.test(magnitude) ? null : magnitude;
}

export function krakenReportedNonzeroTradeFee(
  source: Pick<KrakenSourceObject, "objectType" | "payloadJson">,
): string | null {
  if (source.objectType !== "kraken_trade") return null;
  return nonzeroMagnitude(tradePayload(source).fee);
}

function fingerprint(sources: readonly KrakenSourceObject[]): string {
  return createHash("sha256")
    .update(
      sources
        .map(
          (source) =>
            `${source.objectType}:${source.externalId}:${source.payloadHash}`,
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");
}

function linkedLedgers(
  trade: KrakenSourceObject,
  payload: KrakenTradePayload,
  ledgers: readonly KrakenSourceObject[],
): KrakenSourceObject[] {
  const explicitIds = new Set(payload.ledgers);
  return ledgers.filter((ledger) => {
    if (explicitIds.has(ledger.externalId)) return true;
    return ledgerPayload(ledger).refid === trade.externalId;
  });
}

function explicitFeeLeg(
  linked: readonly KrakenSourceObject[],
): ExternalCandidateLegDraft | null {
  const evidence = linked
    .map((source) => ({ source, payload: ledgerPayload(source) }))
    .filter(({ payload }) => nonzeroMagnitude(payload.fee) !== null);
  if (evidence.length !== 1) return null;
  const payload = evidence[0]!.payload;
  return {
    role: "fee",
    providerAssetKey: payload.asset,
    amountText: `-${nonzeroMagnitude(payload.fee)!}`,
    note: `Fee evidence: Kraken ledger ${evidence[0]!.source.externalId}`,
  };
}

export function normalizeKrakenTradeCandidate(input: {
  trade: KrakenSourceObject;
  ledgers: readonly KrakenSourceObject[];
  referenceData: KrakenReferenceData;
  rawAssetKeyByDisplay: Readonly<Record<string, string>>;
}): ExternalCandidateDraft {
  const payload = tradePayload(input.trade);
  const pair = resolveKrakenPair(payload.pair, input.referenceData.assetPairs);
  if (!pair || (payload.type !== "buy" && payload.type !== "sell")) {
    return {
      stableKey: externalStableKey("kraken_trade", input.trade.externalId),
      suggestedEventType: "unknown",
      initialStatus: "unsupported",
      occurredAt: input.trade.occurredAt,
      title: `Kraken trade ${payload.pair}`,
      normalizationVersion: 1,
      sourceFingerprint: fingerprint([input.trade]),
      primarySourceExternalIds: [input.trade.externalId],
      crossCheckSourceExternalIds: [],
      legs: [],
      warnings: ["Trade pair or side is unsupported."],
    };
  }

  const baseKey = input.rawAssetKeyByDisplay[pair.base] ?? pair.base;
  const quoteKey = input.rawAssetKeyByDisplay[pair.quote] ?? pair.quote;
  const cost = positiveMagnitude(payload.cost, "trade cost");
  const volume = positiveMagnitude(payload.vol, "trade volume");
  const linked = linkedLedgers(input.trade, payload, input.ledgers);
  const fee = explicitFeeLeg(linked);
  const legs: ExternalCandidateLegDraft[] =
    payload.type === "buy"
      ? [
          {
            role: "source",
            providerAssetKey: quoteKey,
            amountText: `-${cost}`,
          },
          {
            role: "destination",
            providerAssetKey: baseKey,
            amountText: volume,
          },
        ]
      : [
          {
            role: "source",
            providerAssetKey: baseKey,
            amountText: `-${volume}`,
          },
          {
            role: "destination",
            providerAssetKey: quoteKey,
            amountText: cost,
          },
        ];
  if (fee) legs.push(fee);

  const feeMagnitude = krakenReportedNonzeroTradeFee(input.trade);
  return {
    stableKey: externalStableKey("kraken_trade", input.trade.externalId),
    suggestedEventType: "exchange",
    initialStatus: "pending",
    occurredAt: input.trade.occurredAt,
    title: `Kraken trade ${pair.displayPair}`,
    normalizationVersion: 1,
    sourceFingerprint: fingerprint([input.trade, ...linked]),
    primarySourceExternalIds: [input.trade.externalId],
    crossCheckSourceExternalIds: linked.map((source) => source.externalId),
    legs,
    warnings:
      feeMagnitude && !fee
        ? ["Trade fee amount is present, but its asset is unresolved."]
        : [],
  };
}

export function normalizeKrakenLedgerCandidate(
  source: KrakenSourceObject,
): ExternalCandidateDraft | null {
  const payload = ledgerPayload(source);
  if (payload.type === "trade") return null;
  const amount = validatedExternalDecimalText(payload.amount);
  const isOut = amount.startsWith("-");
  const legs: ExternalCandidateLegDraft[] = [
    {
      role: isOut ? "external_out" : "external_in",
      providerAssetKey: payload.asset,
      amountText: amount,
    },
  ];
  const fee = nonzeroMagnitude(payload.fee);
  if (fee) {
    legs.push({
      role: "fee",
      providerAssetKey: payload.asset,
      amountText: `-${fee}`,
      note: `Fee evidence: Kraken ledger ${source.externalId}`,
    });
  }
  return {
    stableKey: externalStableKey("kraken_ledger", source.externalId),
    suggestedEventType: "unknown",
    initialStatus: "pending",
    occurredAt: source.occurredAt,
    title: `Kraken ${payload.type}`,
    normalizationVersion: 1,
    sourceFingerprint: fingerprint([source]),
    primarySourceExternalIds: [source.externalId],
    crossCheckSourceExternalIds: [],
    legs,
    warnings: [
      `${payload.type} requires an explicit event type and account choice.`,
    ],
  };
}

export function normalizeKrakenCandidates(input: {
  trades: readonly KrakenSourceObject[];
  ledgers: readonly KrakenSourceObject[];
  referenceData: KrakenReferenceData;
  rawAssetKeyByDisplay: Readonly<Record<string, string>>;
}): ExternalCandidateDraft[] {
  const trades = input.trades.map((trade) =>
    normalizeKrakenTradeCandidate({
      trade,
      ledgers: input.ledgers,
      referenceData: input.referenceData,
      rawAssetKeyByDisplay: input.rawAssetKeyByDisplay,
    }),
  );
  const ledgers = input.ledgers
    .map(normalizeKrakenLedgerCandidate)
    .filter(
      (candidate): candidate is ExternalCandidateDraft => candidate !== null,
    );
  return [...trades, ...ledgers].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.stableKey.localeCompare(right.stableKey),
  );
}
