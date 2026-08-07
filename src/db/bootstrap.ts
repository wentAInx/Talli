import { openDatabase } from "./connection";
import { migrateDatabase } from "./migrate";
import { seedDatabase } from "./seed";

export function setupDatabase(explicitPath?: string): string {
  const context = openDatabase(explicitPath);
  try {
    migrateDatabase(context);
    seedDatabase(context);
    return context.path;
  } finally {
    context.close();
  }
}
