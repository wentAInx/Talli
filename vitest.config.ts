import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/domain/**/*.ts", "src/services/**/*.ts", "src/db/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/db/migrations/**"],
    },
  },
});
