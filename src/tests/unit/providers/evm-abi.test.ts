import { describe, expect, it } from "vitest";

import {
  decodeAbiUint256,
  encodeGetL1FeeCall,
  encodeGetOperatorFeeCall,
  keccak256Hex,
} from "../../../providers/evm/abi";

describe("minimal audited GasPriceOracle ABI", () => {
  it("uses Ethereum Keccak-256 selectors", () => {
    expect(keccak256Hex("")).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(keccak256Hex("transfer(address,uint256)").slice(0, 8)).toBe(
      "a9059cbb",
    );
    expect(encodeGetL1FeeCall("0x010203").slice(0, 10)).toBe("0x49948e0e");
    expect(encodeGetOperatorFeeCall(100_000n).slice(0, 10)).toBe("0x275aedd2");
  });

  it("encodes dynamic serialized bytes with ABI offset, length, and padding", () => {
    expect(encodeGetL1FeeCall("0x010203")).toBe(
      "0x49948e0e" +
        "0000000000000000000000000000000000000000000000000000000000000020" +
        "0000000000000000000000000000000000000000000000000000000000000003" +
        "0102030000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("decodes only a canonical ABI uint256 word", () => {
    expect(decodeAbiUint256(`0x${42n.toString(16).padStart(64, "0")}`)).toBe(
      42n,
    );
    expect(() => decodeAbiUint256("0x2a")).toThrow();
  });
});
