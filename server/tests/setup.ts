import "dotenv/config";
import { afterAll, afterEach } from "vitest";
import { getTestDatabaseUrl } from "./testDbUrl.js";
import { prisma } from "../src/lib/prisma.js";

// DATABASE_URL is already overridden to the test DB by vitest.config.ts's
// `test.env` (applied before any module loads, so the prisma singleton
// connects to the test DB). Re-assert it here as a defensive belt-and-braces
// in case this setup file is ever run in isolation.
process.env.DATABASE_URL = getTestDatabaseUrl();

afterEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Coin","PriceHistory","FetchLog" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
