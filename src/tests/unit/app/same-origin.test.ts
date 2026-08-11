import { describe, expect, it } from "vitest";

import {
  firstHeaderValue,
  isSameOriginRequest,
} from "../../../app/api/same-origin";

describe("same-origin mutation guard", () => {
  it("accepts the canonical host and forwarded proxy origin", () => {
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3106/api/sync/kraken/run", {
          headers: {
            host: "127.0.0.1:3106",
            origin: "http://127.0.0.1:3106",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("http://internal:3000/api/sync/kraken/run", {
          headers: {
            origin: "https://ledger.example",
            "x-forwarded-host": "ledger.example, proxy.internal",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects missing, malformed, and cross-origin requests", () => {
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3106/api/sync/kraken/run", {
          headers: { host: "127.0.0.1:3106" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3106/api/sync/kraken/run", {
          headers: {
            host: "127.0.0.1:3106",
            origin: "https://attacker.invalid",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3106/api/sync/kraken/run", {
          headers: {
            host: "127.0.0.1:3106",
            origin: "not a URL",
          },
        }),
      ),
    ).toBe(false);
  });

  it("uses only the first forwarded header value", () => {
    expect(firstHeaderValue("ledger.example, proxy.internal")).toBe(
      "ledger.example",
    );
    expect(firstHeaderValue("  ")).toBeNull();
  });
});
