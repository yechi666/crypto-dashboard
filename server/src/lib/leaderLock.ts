import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// Advisory-lock key identifying the refresh-loop leader; arbitrary but must
// match across all instances.
export const LEADER_LOCK_KEY = 4927;

// A session-level pg_try_advisory_lock lives on the specific connection that
// acquired it, but Prisma's shared pool can hand queries to any pooled
// connection — a recycled connection could silently drop the lock and let a
// second instance believe it's also the leader. To avoid that, the lock is
// taken on a dedicated, single-connection PrismaClient used for nothing else.
const lockUrl = new URL(env.DATABASE_URL);
lockUrl.searchParams.set("connection_limit", "1");

const lockClient = new PrismaClient({ datasources: { db: { url: lockUrl.toString() } } });

let acquired = false;

/**
 * Attempts to become the refresh-loop leader via a session-level Postgres
 * advisory lock. Returns true if this process acquired the lock (leader),
 * false otherwise (follower — another instance already holds it, or the
 * attempt failed). Because the lock is session-scoped to `lockClient`'s
 * single connection, it is automatically released by Postgres if this
 * process dies or that connection closes, letting a follower take over
 * without any heartbeat logic.
 */
export async function tryAcquireLeaderLock(): Promise<boolean> {
  try {
    const rows = await lockClient.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${LEADER_LOCK_KEY}::bigint) AS locked`;
    const locked = rows[0]?.locked === true;
    acquired = locked;
    return locked;
  } catch (error) {
    logger.warn({ err: error }, "failed to acquire leader lock; degrading to follower mode");
    return false;
  }
}

/**
 * Releases the leader lock (if held by this process) and disconnects the
 * dedicated lock client. Safe to call multiple times, and safe to call from
 * a follower instance that never acquired the lock (no-op).
 */
export async function releaseLeaderLock(): Promise<void> {
  if (!acquired) {
    return;
  }

  try {
    await lockClient.$executeRaw`SELECT pg_advisory_unlock(${LEADER_LOCK_KEY}::bigint)`;
    acquired = false;
  } catch (error) {
    logger.warn({ err: error }, "failed to release leader lock cleanly");
  } finally {
    try {
      await lockClient.$disconnect();
    } catch (error) {
      logger.warn({ err: error }, "failed to disconnect leader lock client");
    }
  }
}
