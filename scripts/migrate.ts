import { migrateDatabase, openDatabase } from "../src/db";

const context = openDatabase();

try {
  migrateDatabase(context);
  process.stdout.write(`Migrated SQLite database at ${context.path}.\n`);
} finally {
  context.close();
}
