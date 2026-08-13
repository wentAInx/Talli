import { normalizeEvmAddress, parseEvmHexQuantity } from "../../domain/evm";
import { EvmProviderError } from "./errors";
import type {
  EvmNativeTrace,
  EvmNativeTraceFrame,
  EvmNativeTraceFrameType,
} from "./types";

const MOVEMENT_FRAME_TYPES = new Set([
  "CALL",
  "CREATE",
  "CREATE2",
  "SELFDESTRUCT",
]);
const NON_MOVEMENT_FRAME_TYPES = new Set([
  "DELEGATECALL",
  "STATICCALL",
  "CALLCODE",
]);

function payloadError(message: string): EvmProviderError {
  return new EvmProviderError("INVALID_PAYLOAD", message);
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw payloadError(`${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function traceRoot(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) {
    return objectRecord(value, "Alchemy call trace");
  }
  if (value.length !== 1) {
    throw payloadError("Alchemy wrapped call trace is invalid.");
  }
  const wrapper = objectRecord(value[0], "Alchemy call trace wrapper");
  if (wrapper.name !== "transaction trace" || !("value" in wrapper)) {
    throw payloadError("Alchemy wrapped call trace is unsupported.");
  }
  return objectRecord(wrapper.value, "Alchemy wrapped call trace value");
}

function normalizedAddress(
  value: unknown,
  label: string,
  nullable: boolean,
): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string") throw payloadError(`${label} is invalid.`);
  try {
    return normalizeEvmAddress(value);
  } catch {
    throw payloadError(`${label} is invalid.`);
  }
}

function atomicValue(value: unknown): string {
  if (value === undefined || value === null) return "0";
  if (typeof value !== "string") {
    throw payloadError("Alchemy call trace value is invalid.");
  }
  try {
    return parseEvmHexQuantity(value, "Trace value").toString();
  } catch {
    throw payloadError("Alchemy call trace value is invalid.");
  }
}

function normalizedType(value: unknown): string {
  if (typeof value !== "string") {
    throw payloadError("Alchemy call trace type is invalid.");
  }
  const type =
    value.toUpperCase() === "SUICIDE" ? "SELFDESTRUCT" : value.toUpperCase();
  if (!MOVEMENT_FRAME_TYPES.has(type) && !NON_MOVEMENT_FRAME_TYPES.has(type)) {
    throw payloadError("Alchemy call trace type is unsupported.");
  }
  return type;
}

function projectFrame(input: {
  frame: Record<string, unknown>;
  path: string;
  ancestorReverted: boolean;
  output: EvmNativeTraceFrame[];
}): void {
  const { frame, path, output } = input;
  const type = normalizedType(frame.type);
  const reverted =
    input.ancestorReverted ||
    (typeof frame.error === "string" && frame.error.length > 0) ||
    (typeof frame.revertReason === "string" && frame.revertReason.length > 0);

  if (MOVEMENT_FRAME_TYPES.has(type)) {
    output.push({
      path,
      type: type as EvmNativeTraceFrameType,
      fromAddressLower: normalizedAddress(
        frame.from,
        "Alchemy call trace from",
        false,
      )!,
      toAddressLower: normalizedAddress(
        frame.to,
        "Alchemy call trace to",
        true,
      ),
      rawAmountAtomicText: atomicValue(frame.value),
      reverted,
    });
  }

  if (frame.calls !== undefined && !Array.isArray(frame.calls)) {
    throw payloadError("Alchemy nested call trace rows are invalid.");
  }
  const calls = (frame.calls ?? []) as unknown[];
  calls.forEach((call, index) => {
    projectFrame({
      frame: objectRecord(call, "Alchemy nested call trace"),
      path: `${path}.${index}`,
      ancestorReverted: reverted,
      output,
    });
  });
}

export function parseAlchemyCallTrace(value: unknown): EvmNativeTrace {
  const frames: EvmNativeTraceFrame[] = [];
  projectFrame({
    frame: traceRoot(value),
    path: "0",
    ancestorReverted: false,
    output: frames,
  });
  return { status: "exact", frames };
}
