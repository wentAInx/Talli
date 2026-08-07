import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DatabaseContext } from "../../db/connection";
import { openDatabase } from "../../db/connection";
import { migrateDatabase } from "../../db/migrate";
import type { ServiceRuntime } from "../../services/runtime";

export interface TestDatabase {
  context: DatabaseContext;
  directory: string;
  close(): void;
}

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), "asset-ledger-test-"));
  const context = openDatabase(join(directory, "ledger.sqlite"));
  migrateDatabase(context);

  let closed = false;
  return {
    context,
    directory,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      context.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function deterministicRuntime(
  now = "2026-08-01T00:00:00.000Z",
): ServiceRuntime {
  let sequence = 0;
  return {
    id: () => `test-id-${String(++sequence).padStart(4, "0")}`,
    now: () => now,
  };
}
