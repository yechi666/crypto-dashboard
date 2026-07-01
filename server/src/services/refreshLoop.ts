import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { runTransaction } from "../lib/prisma.js";
import * as coinRepo from "../repositories/coinRepo.js";
import {
  createProcessingLog,
  recordOutcome,
  type FetchLogOutcome,
} from "../repositories/fetchLogRepo.js";
import * as priceHistoryRepo from "../repositories/priceHistoryRepo.js";
import { toErrorMessage } from "../utils/errors.js";
import { fetchAssets, UpstreamError } from "./coincap.js";
import { getCoinsSnapshot } from "./coinsSnapshot.js";
import { broadcast } from "./sse.js";

let running = false;

/**
 * Runs a single poll cycle: fetch upstream assets, upsert Coin rows, append
 * PriceHistory rows and record the outcome in FetchLog.
 * Never throws — a rejected promise here
 * would otherwise take down the setInterval loop.
 */
export async function runRefreshCycle(): Promise<void> {
  if (running) {
    logger.warn("refresh cycle still running; skipping tick");
    return;
  }
  running = true;

  try {
    const startedAt = new Date();
    const log = await createProcessingLog("coincap", startedAt);

    let outcome: FetchLogOutcome;
    try {
      const snapshot = await fetchAssets();

      await runTransaction([
        ...coinRepo.coinUpsertOps(snapshot.coins, snapshot.timestamp),
        priceHistoryRepo.insertSnapshotOp(snapshot.coins, snapshot.timestamp),
      ]);

      outcome = {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        coinsUpdated: snapshot.coins.length,
      };
    } catch (error) {
      logger.error({ err: error }, "refresh cycle failed");
      const message =
        error instanceof UpstreamError ? `${error.kind}: ${error.message}` : toErrorMessage(error);
      outcome = { status: "FAILED", finishedAt: new Date(), errorMessage: message };
    }

    await recordOutcome(log?.id ?? null, startedAt, outcome);

    try {
      const snapshot = await getCoinsSnapshot();
      broadcast("coins", snapshot);
    } catch (error) {
      logger.error({ err: error }, "failed to broadcast snapshot");
    }
  } finally {
    running = false;
  }
}

/** Starts the shared poll loop: fires immediately, then every POLL_INTERVAL_MS. Returns a stop function. */
export function startRefreshLoop(): () => void {
  void runRefreshCycle();
  const handle = setInterval(() => {
    void runRefreshCycle();
  }, env.POLL_INTERVAL_MS);
  return () => clearInterval(handle);
}
