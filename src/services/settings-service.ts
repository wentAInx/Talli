import type { DatabaseContext } from "../db/connection";
import { findAppSetting, upsertAppSetting } from "../db/queries";
import { assertIanaTimeZone } from "../domain/time";
import { ServiceError } from "./errors";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";

export const APP_TIMEZONE_KEY = "app_timezone";
export const FALLBACK_APP_TIMEZONE = "UTC";

function parseTimeZone(valueJson: string): string {
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    throw new ServiceError(
      "INVALID_APP_SETTING",
      "Stored app timezone is not valid JSON.",
    );
  }
  if (typeof value !== "string") {
    throw new ServiceError(
      "INVALID_APP_SETTING",
      "Stored app timezone must be a JSON string.",
    );
  }
  return assertIanaTimeZone(value);
}

export class SettingsService {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  getTimeZone(): string | null {
    const row = findAppSetting(this.context.db, APP_TIMEZONE_KEY);
    return row ? parseTimeZone(row.valueJson) : null;
  }

  getTimeZoneOrDefault(): string {
    return this.getTimeZone() ?? FALLBACK_APP_TIMEZONE;
  }

  async initializeTimeZone(timeZone: string): Promise<boolean> {
    const normalized = assertIanaTimeZone(timeZone);
    return this.context.db.transaction(
      (transaction) => {
        if (findAppSetting(transaction, APP_TIMEZONE_KEY)) {
          return false;
        }
        upsertAppSetting(transaction, {
          key: APP_TIMEZONE_KEY,
          valueJson: JSON.stringify(normalized),
          updatedAt: runtimeNow(this.runtime),
        });
        return true;
      },
      { behavior: "immediate" },
    );
  }

  async setTimeZone(timeZone: string): Promise<void> {
    const normalized = assertIanaTimeZone(timeZone);
    this.context.db.transaction(
      (transaction) => {
        upsertAppSetting(transaction, {
          key: APP_TIMEZONE_KEY,
          valueJson: JSON.stringify(normalized),
          updatedAt: runtimeNow(this.runtime),
        });
      },
      { behavior: "immediate" },
    );
  }
}
