import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import {
  LEADER_LOCK_KEY,
  releaseLeaderLock,
  tryAcquireLeaderLock,
} from "../src/lib/leaderLock.js";

// A second, independent PrismaClient representing "another instance" trying
// to acquire the same advisory lock. Advisory locks are cluster-wide (scoped
// to the database, not to a particular client), so both this client and the
// one inside leaderLock.ts observe the same lock state on the test DB.
let externalClient: PrismaClient;

beforeEach(() => {
  externalClient = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
});

afterEach(async () => {
  // Belt-and-braces: release from the external side too, in case a test
  // failed mid-way and left the lock held on that connection.
  await externalClient.$executeRaw`SELECT pg_advisory_unlock(${LEADER_LOCK_KEY}::bigint)`;
  await externalClient.$disconnect();
  await releaseLeaderLock();
});

describe("leaderLock", () => {
  it("elects this process as leader, blocks a second instance, then releases on demand", async () => {
    const isLeader = await tryAcquireLeaderLock();
    expect(isLeader).toBe(true);

    const contendingRows = await externalClient.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${LEADER_LOCK_KEY}::bigint) AS locked`;
    expect(contendingRows[0]?.locked).toBe(false);

    await releaseLeaderLock();

    const afterReleaseRows = await externalClient.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${LEADER_LOCK_KEY}::bigint) AS locked`;
    expect(afterReleaseRows[0]?.locked).toBe(true);
  });
});
