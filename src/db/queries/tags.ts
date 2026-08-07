import { and, asc, eq, inArray } from "drizzle-orm";

import type { DatabaseExecutor } from "../connection";
import { tags } from "../schema";

export function findTagById(executor: DatabaseExecutor, id: string) {
  return executor.select().from(tags).where(eq(tags.id, id)).get();
}

export function findTagByName(
  executor: DatabaseExecutor,
  bookId: string,
  name: string,
) {
  return executor
    .select()
    .from(tags)
    .where(and(eq(tags.bookId, bookId), eq(tags.name, name)))
    .get();
}

export function findTagsByIds(
  executor: DatabaseExecutor,
  ids: readonly string[],
) {
  if (ids.length === 0) {
    return [];
  }
  return executor
    .select()
    .from(tags)
    .where(inArray(tags.id, [...ids]))
    .orderBy(asc(tags.id))
    .all();
}

export function listTagsForBook(executor: DatabaseExecutor, bookId: string) {
  return executor
    .select()
    .from(tags)
    .where(eq(tags.bookId, bookId))
    .orderBy(asc(tags.name), asc(tags.id))
    .all();
}

export function insertTag(
  executor: DatabaseExecutor,
  value: typeof tags.$inferInsert,
): void {
  executor.insert(tags).values(value).run();
}

export function updateTag(
  executor: DatabaseExecutor,
  id: string,
  value: Partial<
    Pick<typeof tags.$inferInsert, "name" | "isArchived" | "updatedAt">
  >,
): void {
  executor.update(tags).set(value).where(eq(tags.id, id)).run();
}
