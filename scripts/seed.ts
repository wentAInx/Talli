import { openDatabase } from "../src/db/connection";
import { seedDatabase } from "../src/db/seed";

const context = openDatabase();

try {
  seedDatabase(context);
  console.log(`Seed completed: ${context.path}`);
} finally {
  context.close();
}
