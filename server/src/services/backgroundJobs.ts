import { logger } from "../lib/logger.js";
import { tryAcquireLeaderLock, releaseLeaderLock } from "../lib/leaderLock.js";
import { runStartupBackfill } from "./backfill.js";
import { startRefreshLoop } from "./refreshLoop.js";

let stopLoop: (() => void) | null = null;

/**
 * Entry point for the background jobs (startup backfill + refresh loop).
 * Only the instance that wins the Postgres advisory-lock leader election
 * actually runs them; every other instance stays a follower serving API
 * reads only. See `../lib/leaderLock.ts` for how mutual exclusion is
 * guaranteed across replicas.
 */
export async function startBackgroundJobs(): Promise<void> {
  const isLeader = await tryAcquireLeaderLock();
  if (!isLeader) {
    logger.info("another instance holds the refresh leader lock; follower mode (API reads only)");
    return;
  }
  logger.info("acquired refresh leader lock; running startup backfill + refresh loop");
  await runStartupBackfill();
  stopLoop = startRefreshLoop();
}

/** Stops the refresh loop (if running here) and releases the leader lock. */
export async function stopBackgroundJobs(): Promise<void> {
  if (stopLoop) {
    stopLoop();
    stopLoop = null;
  }
  await releaseLeaderLock();
}
