import "dotenv/config";
import { defineConfig } from "vitest/config";
import { getTestDatabaseUrl } from "./tests/testDbUrl.js";

// Point every test worker at the isolated test database BEFORE any test
// module (and therefore the shared PrismaClient singleton) is imported.
// Setting it via `test.env` guarantees the override lands before module
// evaluation, avoiding fragile import-ordering assumptions in setupFiles.
const testDatabaseUrl = getTestDatabaseUrl();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl,
    },
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // All test files share a single Postgres test database and the per-test
    // afterEach TRUNCATE ... CASCADE. Running files in parallel would let one
    // worker's cleanup wipe another's rows mid-test, so pin execution to a
    // single worker (files run serially; tests within a file already do).
    fileParallelism: false,
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
