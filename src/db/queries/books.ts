import { eq } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { books } from "../schema";

export function findBookById(executor: DatabaseExecutor, id: string) {
  return executor.select().from(books).where(eq(books.id, id)).get();
}

export function listDefaultBooks(executor: DatabaseExecutor) {
  return executor.select().from(books).where(eq(books.isDefault, true)).all();
}

export function insertBook(
  executor: DatabaseExecutor,
  value: typeof books.$inferInsert,
): void {
  executor.insert(books).values(value).run();
}
