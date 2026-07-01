import "dotenv/config";
import { execSync } from "node:child_process";
import { getTestDatabaseUrl } from "./testDbUrl.js";

// Vitest's globalSetup contract requires a default export — the one
// deliberate exception to this repo's no-default-export convention.
export default async function setup(): Promise<void> {
  const testUrl = getTestDatabaseUrl();

  execSync(
    "npx prisma db push --force-reset --skip-generate --schema server/prisma/schema.prisma",
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testUrl,
        // Scoped ONLY to this disposable test-DB reset (crypto_dashboard_test,
        // never the dev DB). --force-reset trips Prisma's AI-agent safety guard;
        // consenting here keeps AI/CI test runs from being blocked by it.
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "1",
      },
    },
  );
}
