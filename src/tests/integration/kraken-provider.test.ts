import { afterEach, describe, expect, it } from "vitest";

import {
  findExternalConnectionState,
  insertExternalConnection,
} from "../../db/queries";
import { books } from "../../db/schema";
import { KrakenReadOnlyClient } from "../../providers/kraken/client";
import { KrakenNonceService } from "../../providers/kraken/nonce";
import type {
  KrakenHttpTransport,
  KrakenNonceSource,
} from "../../providers/kraken/types";
import { createTestDatabase, type TestDatabase } from "./test-database";

class OnePageTransport implements KrakenHttpTransport {
  constructor(private readonly assertOutsideTransaction: () => void) {}

  async request(input: { method: "GET" | "POST"; url: URL }) {
    this.assertOutsideTransaction();
    let result: unknown;
    switch (input.url.pathname) {
      case "/0/private/GetApiKeyInfo":
        result = {
          permissions: ["query-funds", "query-ledger", "query-closed-trades"],
        };
        break;
      case "/0/public/Assets":
        result = {
          BTC: { altname: "XBT", decimals: 10, display_decimals: 8 },
        };
        break;
      case "/0/public/AssetPairs":
        result = {};
        break;
      case "/0/private/Balance":
        result = { XXBT: "0.50200000" };
        break;
      case "/0/private/Ledgers":
        result = { ledger: {}, count: 0 };
        break;
      case "/0/private/TradesHistory":
        result = { trades: {}, count: 0 };
        break;
      default:
        throw new Error(`Unexpected endpoint ${input.url.pathname}`);
    }
    return {
      status: 200,
      headers: new Headers(),
      text: JSON.stringify({ error: [], result }),
    };
  }
}

class IncrementingNonce implements KrakenNonceSource {
  private value = 1_786_440_000_000n;

  next(): string {
    this.value += 1n;
    return this.value.toString();
  }
}

describe("Kraken provider persistence boundaries", () => {
  let database: TestDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  function insertConnection(): void {
    const timestamp = "2026-08-11T12:00:00.000Z";
    database!.context.db
      .insert(books)
      .values({
        id: "book-kraken",
        name: "Kraken test",
        isDefault: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    insertExternalConnection(database!.context.db, {
      id: "connection-kraken",
      bookId: "book-kraken",
      provider: "kraken",
      name: "Kraken",
      credentialRef: "env:kraken.primary",
      isEnabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  it("persists 100 strictly increasing nonces across service rebuilds", () => {
    database = createTestDatabase();
    insertConnection();
    const runtime = {
      id: () => "unused",
      now: () => "2026-08-11T12:00:00.000Z",
    };
    const firstService = new KrakenNonceService(database.context, runtime);
    const values = Array.from({ length: 100 }, () =>
      BigInt(firstService.next("connection-kraken")),
    );
    expect(
      values.every((value, index) => index === 0 || value > values[index - 1]!),
    ).toBe(true);

    const rebuiltService = new KrakenNonceService(database.context, runtime);
    const rebuiltValue = BigInt(rebuiltService.next("connection-kraken"));
    expect(rebuiltValue).toBeGreaterThan(values.at(-1)!);
    expect(
      findExternalConnectionState(database.context.db, "connection-kraken")
        ?.lastNonceText,
    ).toBe(rebuiltValue.toString());
  });

  it("never performs provider HTTP while SQLite is in a transaction", async () => {
    database = createTestDatabase();
    const provider = new KrakenReadOnlyClient(
      new OnePageTransport(() => {
        expect(database!.context.sqlite.inTransaction).toBe(false);
      }),
      new IncrementingNonce(),
      {
        connectionId: "connection-kraken",
        apiKey: "test-key",
        apiSecret: "c2VjcmV0LWJ5dGVz",
      },
      {
        id: () => "unused",
        now: () => "2026-08-11T12:00:00.000Z",
      },
    );

    await expect(provider.fetchSnapshot()).resolves.toMatchObject({
      balances: [{ providerAssetKey: "XXBT", amountText: "0.50200000" }],
    });
  });
});
