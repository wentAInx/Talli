import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const e2eDirectory = process.env.E2E_SYNC_DATABASE_PATH
  ? null
  : mkdtempSync(join(tmpdir(), "talli-e2e-sync-"));
const e2eDatabasePath =
  process.env.E2E_SYNC_DATABASE_PATH ?? join(e2eDirectory!, "ledger.sqlite");

if (e2eDirectory) {
  process.env.ASSET_LEDGER_E2E_TEMP_DIRECTORY = e2eDirectory;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/sync-flow.spec.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-sync" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "sync-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "sync-mobile",
      dependencies: ["sync-desktop"],
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command:
      "pnpm exec tsx e2e/seed-valuation.ts && pnpm dev --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    env: {
      AUTO_SETUP_DATABASE: "1",
      CI: "true",
      DATABASE_PATH: e2eDatabasePath,
      TALLI_E2E_KRAKEN_FIXTURE: "1",
      TALLI_E2E_EVM_FIXTURE: "1",
    },
  },
});
