import { join } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";

import type { DatabaseContext } from "./connection";

export function migrationsFolder(): string {
  return (
    process.env.MIGRATIONS_FOLDER ?? join(process.cwd(), "src/db/migrations")
  );
}

export function migrateDatabase(
  context: DatabaseContext,
  folder = migrationsFolder(),
): void {
  if (context.sqlite.inTransaction) {
    throw new Error("Database migrations cannot start inside a transaction.");
  }

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const lastMigration = context.sqlite
    .prepare(
      'SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1',
    )
    .get() as { hash: string; created_at: number } | undefined;
  const pending = readMigrationFiles({ migrationsFolder: folder }).filter(
    (migration) =>
      lastMigration === undefined ||
      Number(lastMigration.created_at) < migration.folderMillis,
  );

  if (pending.length === 0) {
    assertForeignKeysEnabled(context);
    assertForeignKeyIntegrity(context);
    return;
  }

  context.sqlite.pragma("foreign_keys = OFF");
  if (foreignKeysSetting(context) !== 0) {
    throw new Error(
      "SQLite foreign keys could not be disabled outside the migration transaction.",
    );
  }

  try {
    context.sqlite.exec("BEGIN IMMEDIATE");
    const recordMigration = context.sqlite.prepare(
      'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
    );
    for (const migration of pending) {
      for (const statement of migration.sql) {
        if (statement.trim() !== "") {
          context.sqlite.exec(statement);
        }
      }
      recordMigration.run(migration.hash, migration.folderMillis);
    }
    context.sqlite.exec("COMMIT");
  } catch (error) {
    if (context.sqlite.inTransaction) {
      context.sqlite.exec("ROLLBACK");
    }
    throw error;
  } finally {
    context.sqlite.pragma("foreign_keys = ON");
  }

  assertForeignKeysEnabled(context);
  assertForeignKeyIntegrity(context);
}

function foreignKeysSetting(context: DatabaseContext): number {
  return Number(context.sqlite.pragma("foreign_keys", { simple: true }));
}

function assertForeignKeysEnabled(context: DatabaseContext): void {
  if (foreignKeysSetting(context) !== 1) {
    throw new Error("SQLite foreign keys are not enabled after migration.");
  }
}

function assertForeignKeyIntegrity(context: DatabaseContext): void {
  const violations = context.sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(
      `SQLite foreign key check failed after migration (${violations.length} violation(s)).`,
    );
  }
}
