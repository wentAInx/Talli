import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findAppSetting } from "../../db/queries";
import { SettingsService } from "../../services/settings-service";
import type { TestDatabase } from "./test-database";
import { createTestDatabase, deterministicRuntime } from "./test-database";

describe("app settings", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it("persists the first browser timezone without overwriting a preference", async () => {
    const service = new SettingsService(
      database.context,
      deterministicRuntime("2026-08-07T10:00:00.000Z"),
    );

    await expect(service.initializeTimeZone("Asia/Shanghai")).resolves.toBe(
      true,
    );
    await expect(service.initializeTimeZone("Europe/London")).resolves.toBe(
      false,
    );
    expect(service.getTimeZone()).toBe("Asia/Shanghai");
    expect(findAppSetting(database.context.db, "app_timezone")).toMatchObject({
      valueJson: '"Asia/Shanghai"',
      updatedAt: "2026-08-07T10:00:00.000Z",
    });
  });

  it("updates the explicit timezone and rejects invalid zones", async () => {
    const service = new SettingsService(database.context);
    await service.setTimeZone("America/New_York");
    expect(service.getTimeZoneOrDefault()).toBe("America/New_York");

    await expect(service.setTimeZone("Mars/Olympus_Mons")).rejects.toThrow(
      "App timezone is not valid",
    );
    expect(service.getTimeZone()).toBe("America/New_York");
  });

  it("uses UTC only as the explicit pre-bootstrap fallback", () => {
    expect(new SettingsService(database.context).getTimeZone()).toBeNull();
    expect(new SettingsService(database.context).getTimeZoneOrDefault()).toBe(
      "UTC",
    );
  });
});
