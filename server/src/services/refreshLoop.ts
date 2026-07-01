import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { toErrorMessage } from "../utils/errors.js";
import { fetchAssets, UpstreamError } from "./coincap.js";
import { coinUpsertOps } from "./coinRepo.js";
import { getCoinsSnapshot } from "./coinsSnapshot.js";
import { createProcessingLog, recordOutcome, type FetchLogOutcome } from "./fetchLog.js";
import { broadcast } from "./sse.js";

let running = false;

/**
 * Runs a single poll cycle: fetch upstream assets, upsert Coin rows, append
 * PriceHistory rows, soft-delete history past the retention window, and
 * record the outcome in FetchLog. Never throws — a rejected promise here
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
      const cutoff = new Date(Date.now() - env.HISTORY_RETENTION_HOURS * 60 * 60 * 1000);

      await prisma.$transaction([
        ...coinUpsertOps(snapshot.coins, snapshot.timestamp),
        prisma.priceHistory.createMany({
          data: snapshot.coins.map((c) => ({
            coinId: c.id,
            price: c.currentPrice,
            volume24h: c.volume24h,
            recordedAt: snapshot.timestamp,
          })),
        }),
        prisma.priceHistory.updateMany({
          where: { recordedAt: { lt: cutoff }, deletedAt: null },
          data: { deletedAt: new Date() },
        }),
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
