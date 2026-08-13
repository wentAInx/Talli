import { EvmProviderError } from "./errors";

const MASK_64 = (1n << 64n) - 1n;
const RATE_BYTES = 136;
const ROTATIONS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
] as const;
const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
] as const;

function rotateLeft64(value: bigint, offset: number): bigint {
  if (offset === 0) return value & MASK_64;
  const shift = BigInt(offset);
  return ((value << shift) | (value >> (64n - shift))) & MASK_64;
}

function keccakPermutation(state: bigint[]): void {
  for (const roundConstant of ROUND_CONSTANTS) {
    const column = Array<bigint>(5);
    const delta = Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      column[x] =
        state[x]! ^
        state[x + 5]! ^
        state[x + 10]! ^
        state[x + 15]! ^
        state[x + 20]!;
    }
    for (let x = 0; x < 5; x += 1) {
      delta[x] = column[(x + 4) % 5]! ^ rotateLeft64(column[(x + 1) % 5]!, 1);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] ^= delta[x]!;
    }

    const rotated = Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        rotated[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft64(
          state[x + 5 * y]!,
          ROTATIONS[x + 5 * y]!,
        );
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] =
          rotated[x + 5 * y]! ^
          (~rotated[((x + 1) % 5) + 5 * y]! &
            MASK_64 &
            rotated[((x + 2) % 5) + 5 * y]!);
      }
    }
    state[0] ^= roundConstant;
  }
}

function absorbBlock(state: bigint[], block: Uint8Array): void {
  for (let index = 0; index < RATE_BYTES; index += 1) {
    const lane = Math.floor(index / 8);
    const shift = BigInt((index % 8) * 8);
    state[lane] ^= BigInt(block[index]!) << shift;
  }
  keccakPermutation(state);
}

export function keccak256Hex(value: Uint8Array | string): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const state = Array<bigint>(25).fill(0n);
  let offset = 0;
  while (offset + RATE_BYTES <= bytes.length) {
    absorbBlock(state, bytes.slice(offset, offset + RATE_BYTES));
    offset += RATE_BYTES;
  }
  const finalBlock = new Uint8Array(RATE_BYTES);
  finalBlock.set(bytes.slice(offset));
  finalBlock[bytes.length - offset] ^= 0x01;
  finalBlock[RATE_BYTES - 1] ^= 0x80;
  absorbBlock(state, finalBlock);

  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(
      (state[Math.floor(index / 8)]! >> BigInt((index % 8) * 8)) & 0xffn,
    );
  }
  return [...output].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function selector(signature: string): string {
  return keccak256Hex(signature).slice(0, 8);
}

function uint256Word(value: bigint): string {
  if (value < 0n || value >= 1n << 256n) {
    throw new EvmProviderError(
      "INVALID_PAYLOAD",
      "ABI uint256 value is invalid.",
    );
  }
  return value.toString(16).padStart(64, "0");
}

function hexBytes(value: string): string {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new EvmProviderError(
      "INVALID_PAYLOAD",
      "Serialized transaction bytes are invalid.",
    );
  }
  return value.slice(2).toLowerCase();
}

export function encodeGetL1FeeCall(rawTransactionHex: string): string {
  const bytes = hexBytes(rawTransactionHex);
  const byteLength = BigInt(bytes.length / 2);
  const paddedBytes = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return `0x${selector("getL1Fee(bytes)")}${uint256Word(32n)}${uint256Word(byteLength)}${paddedBytes}`;
}

export function encodeGetOperatorFeeCall(gasUsed: bigint): string {
  return `0x${selector("getOperatorFee(uint256)")}${uint256Word(gasUsed)}`;
}

export function decodeAbiUint256(resultHex: string): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(resultHex)) {
    throw new EvmProviderError(
      "INVALID_PAYLOAD",
      "ABI uint256 result is invalid.",
    );
  }
  return BigInt(resultHex);
}
