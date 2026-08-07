import { openDatabase, type DatabaseContext } from "@/db/connection";

export async function withDatabase<T>(
  operation: (context: DatabaseContext) => T | Promise<T>,
): Promise<T> {
  const context = openDatabase();
  try {
    return await operation(context);
  } finally {
    context.close();
  }
}
