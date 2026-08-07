import { and, asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { categories } from "../schema";

export function findCategoryById(executor: DatabaseExecutor, id: string) {
  return executor.select().from(categories).where(eq(categories.id, id)).get();
}

export function findCategoryByDefinition(
  executor: DatabaseExecutor,
  input: {
    bookId: string;
    name: string;
    categoryType: "expense" | "income" | "both";
  },
) {
  return executor
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.bookId, input.bookId),
        eq(categories.name, input.name),
        eq(categories.categoryType, input.categoryType),
      ),
    )
    .get();
}

export function listCategoriesForBook(
  executor: DatabaseExecutor,
  bookId: string,
) {
  return executor
    .select()
    .from(categories)
    .where(eq(categories.bookId, bookId))
    .orderBy(
      asc(categories.sortOrder),
      asc(categories.name),
      asc(categories.id),
    )
    .all();
}

export function insertCategory(
  executor: DatabaseExecutor,
  value: typeof categories.$inferInsert,
): void {
  executor.insert(categories).values(value).run();
}

export function updateCategory(
  executor: DatabaseExecutor,
  id: string,
  value: Partial<
    Pick<
      typeof categories.$inferInsert,
      | "parentId"
      | "name"
      | "categoryType"
      | "isArchived"
      | "sortOrder"
      | "updatedAt"
    >
  >,
): void {
  executor.update(categories).set(value).where(eq(categories.id, id)).run();
}
