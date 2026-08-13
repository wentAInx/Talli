import { describe, expect, it } from "vitest";

import { EvmProviderError } from "../../../providers/evm/errors";
import { parseAlchemyCallTrace } from "../../../providers/evm/trace";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

describe("Alchemy call trace projection", () => {
  it("projects direct and wrapped callTracer responses", () => {
    const direct = { type: "CALL", from: A, to: B, value: "0x2a" };
    expect(parseAlchemyCallTrace(direct).frames).toEqual([
      {
        path: "0",
        type: "CALL",
        fromAddressLower: A,
        toAddressLower: B,
        rawAmountAtomicText: "42",
        reverted: false,
      },
    ]);
    expect(
      parseAlchemyCallTrace([{ name: "transaction trace", value: direct }]),
    ).toEqual(parseAlchemyCallTrace(direct));
  });

  it("normalizes SUICIDE and preserves deterministic nested paths", () => {
    const projected = parseAlchemyCallTrace({
      type: "CALL",
      from: A,
      to: B,
      value: "0x0",
      calls: [
        { type: "CREATE2", from: B, to: C, value: "0x5" },
        { type: "SUICIDE", from: C, to: A, value: "0x7" },
      ],
    });
    expect(projected.frames.map(({ path, type }) => ({ path, type }))).toEqual([
      { path: "0", type: "CALL" },
      { path: "0.0", type: "CREATE2" },
      { path: "0.1", type: "SELFDESTRUCT" },
    ]);
  });

  it("does not count non-movement call kinds but still traverses descendants", () => {
    const projected = parseAlchemyCallTrace({
      type: "DELEGATECALL",
      from: A,
      to: B,
      value: "0x99",
      calls: [{ type: "CALL", from: B, to: C, value: "0x1" }],
    });
    expect(projected.frames).toHaveLength(1);
    expect(projected.frames[0]).toMatchObject({ path: "0.0", type: "CALL" });
  });

  it("propagates ancestor reverts to every descendant", () => {
    const projected = parseAlchemyCallTrace({
      type: "CALL",
      from: A,
      to: B,
      value: "0x1",
      error: "execution reverted",
      calls: [{ type: "CALL", from: B, to: C, value: "0x2" }],
    });
    expect(projected.frames.every((frame) => frame.reverted)).toBe(true);
  });

  it.each([
    null,
    [],
    [{ name: "something else", value: {} }],
    { type: "UNKNOWN", from: A, to: B, value: "0x0" },
    { type: "CALL", from: "bad", to: B, value: "0x0" },
    { type: "CALL", from: A, to: B, value: "12" },
    { type: "CALL", from: A, to: B, value: "0x0", calls: {} },
  ])("fails closed for unsupported or malformed trace payload %#", (value) => {
    expect(() => parseAlchemyCallTrace(value)).toThrowError(EvmProviderError);
  });
});
