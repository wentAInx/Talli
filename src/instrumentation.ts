export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.AUTO_SETUP_DATABASE !== "1"
  ) {
    return;
  }

  const { setupDatabase } = await import("./db/bootstrap");
  setupDatabase();
}
