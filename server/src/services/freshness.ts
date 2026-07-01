import { env } from "../config/env.js";
import { latestSuccess } from "../repositories/fetchLogRepo.js";

export type FreshnessStatus = "live" | "stale" | "error";

export interface Freshness {
  status: FreshnessStatus;
  lastSuccessfulFetchAt: Date | null;
}

/**
 * Derive the dashboard's freshness state from the FetchLog, not from Coin
 * rows — a Coin table with no failures looks identical to one that's 10
 * minutes stale unless we track fetch attempts separately (see
 * docs/ARCHITECTURE.md).
 */
export async function computeFreshness(): Promise<Freshness> {
  const lastSuccess = await latestSuccess();

  if (!lastSuccess) {
    return { status: "error", lastSuccessfulFetchAt: null };
  }

  const at = lastSuccess.finishedAt ?? lastSuccess.startedAt;
  const window = env.STALE_AFTER_INTERVALS * env.POLL_INTERVAL_MS;
  const age = Date.now() - at.getTime();

  return {
    status: age <= window ? "live" : "stale",
    lastSuccessfulFetchAt: at,
  };
}
