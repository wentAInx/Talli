import { join } from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

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
  migrate(context.db, { migrationsFolder: folder });
}
