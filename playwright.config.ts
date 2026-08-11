import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const e2eDirectory = process.env.E2E_DATABASE_PATH
  ? null
  : mkdtempSync(join(tmpdir(), "talli-e2e-"));
const e2eDatabasePath =
  process.env.E2E_DATABASE_PATH ?? join(e2eDirectory!, "ledger.sqlite");

if (e2eDirectory) {
  process.env.ASSET_LEDGER_E2E_TEMP_DIRECTORY = e2eDirectory;
}

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Tests share one deterministic SQLite fixture, so retries would reuse mutated state.
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3106",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command:
      "pnpm exec tsx e2e/seed-valuation.ts && pnpm dev --hostname 127.0.0.1 --port 3106",
    url: "http://127.0.0.1:3106",
    reuseExistingServer: false,
    env: {
      AUTO_SETUP_DATABASE: "1",
      DATABASE_PATH: e2eDatabasePath,
    },
  },
});
