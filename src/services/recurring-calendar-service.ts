import type { DatabaseContext } from "../db/connection";
import { utcInstantToLocalDate } from "../domain/time";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "./runtime";
import { SettingsService } from "./settings-service";

export class RecurringCalendarService {
  private readonly timeZone: string;

  constructor(
    context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {
    this.timeZone = new SettingsService(
      context,
      this.runtime,
    ).getTimeZoneOrDefault();
  }

  getTimeZone(): string {
    return this.timeZone;
  }

  currentLocalDate(): string {
    return this.localDateForInstant(runtimeNow(this.runtime));
  }

  localDateForInstant(instant: string): string {
    return utcInstantToLocalDate(instant, this.getTimeZone());
  }
}
