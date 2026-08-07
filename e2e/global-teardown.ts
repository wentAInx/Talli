import { rmSync } from "node:fs";
import { basename } from "node:path";

export default function globalTeardown(): void {
  const directory = process.env.ASSET_LEDGER_E2E_TEMP_DIRECTORY;
  if (!directory || !basename(directory).startsWith("asset-ledger-e2e-")) {
    return;
  }
  rmSync(directory, { recursive: true, force: true });
}
