import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import type { BetterSQLiteTransaction } from "drizzle-orm/better-sqlite3";
import type { ExtractTablesWithRelations } from "drizzle-orm";

import * as schema from "./schema";

export type LedgerDatabase = BetterSQLite3Database<typeof schema>;
export type LedgerTransaction = BetterSQLiteTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type DatabaseExecutor = LedgerDatabase | LedgerTransaction;

export interface DatabaseContext {
  readonly sqlite: BetterSqlite3.Database;
  readonly db: LedgerDatabase;
  readonly path: string;
  close(): void;
}

function ensureParentDirectory(databasePath: string): void {
  if (databasePath === ":memory:" || databasePath.startsWith("file:")) {
    return;
  }
  mkdirSync(dirname(resolve(databasePath)), { recursive: true });
}

export function resolveDatabasePath(explicitPath?: string): string {
  return explicitPath ?? process.env.DATABASE_PATH ?? "./data/finance.db";
}

export function openDatabase(explicitPath?: string): DatabaseContext {
  const databasePath = resolveDatabasePath(explicitPath);
  ensureParentDirectory(databasePath);

  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma("foreign_keys = ON");
  const journalMode = sqlite.pragma("journal_mode = WAL", { simple: true });

  if (databasePath !== ":memory:" && journalMode !== "wal") {
    sqlite.close();
    throw new Error(`SQLite WAL could not be enabled for ${databasePath}.`);
  }

  const db = drizzle(sqlite, { schema });

  return {
    sqlite,
    db,
    path: databasePath,
    close: () => sqlite.close(),
  };
}
