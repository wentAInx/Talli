import { randomUUID } from "node:crypto";

import { canonicalUtcInstantValue } from "../domain/time";

export interface ServiceRuntime {
  id(): string;
  now(): string;
}

export const defaultServiceRuntime: ServiceRuntime = {
  id: () => randomUUID(),
  now: () => new Date().toISOString(),
};

export function runtimeNow(runtime: ServiceRuntime): string {
  const value = runtime.now();
  canonicalUtcInstantValue(value);
  return value;
}
