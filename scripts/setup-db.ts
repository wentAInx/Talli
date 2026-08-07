import { setupDatabase } from "../src/db/bootstrap";

const path = setupDatabase();
console.log(`Database setup completed: ${path}`);
