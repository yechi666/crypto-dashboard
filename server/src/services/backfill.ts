import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { toErrorMessage } from "../utils/errors.js";
import { fetchAssets, fetchHistory } from "./coincap.js";
import { coinUpsertOps } from "./coinRepo.js";

export interface BackfillSummary {
  seeded: Array<{ id: string; points: number }>;
  skipped: string[];
  empty: string[];
  failed: string[];
}

/**
 * One-time startup backfill: seeds ~the last hour of PriceHistory for the
 * top `COIN_COUNT` display coins so the detail/history view isn't empty on a
 * fresh boot. Idempotent (skips coins that already have history) and never
 * throws — a failure here must not block or crash server startup.
 */
export async function runStartupBackfill(): Promise<BackfillSummary> {
  try {
    const snapshot = await fetchAssets();
    const displayCoins = snapshot.coins.slice(0, env.COIN_COUNT);

    await prisma.$transaction(coinUpsertOps(displayCoins, snapshot.timestamp));

    const end = Date.now();
    const start = end - 60 * 60 * 1000;

    const seeded: Array<{ id: string; points: number }> = [];
    const skipped: string[] = [];
    const empty: string[] = [];
    const failed: string[] = [];

    for (const coin of displayCoins) {
      const existing = await prisma.priceHistory.count({
        where: { coinId: coin.id, deletedAt: null },
      });

      if (existing > 0) {
        skipped.push(coin.id);
        continue;
      }

      try {
        const points = await fetchHistory(coin.id, start, end);
        if (points.length === 0) {
          empty.push(coin.id);
          continue;
        }
        await prisma.priceHistory.createMany({
          data: points.map((p) => ({
            coinId: coin.id,
            price: p.price,
            recordedAt: p.recordedAt,
          })),
        });
        seeded.push({ id: coin.id, points: points.length });
        logger.debug({ coinId: coin.id, points: points.length }, "backfilled coin history");
      } catch (error) {
        failed.push(coin.id);
        logger.error({ err: error, coinId: coin.id }, "backfill failed for coin; continuing");
      }
    }

    logger.info(
      { total: displayCoins.length, seeded, skipped, empty, failed },
      "startup backfill complete",
    );
    return { seeded, skipped, empty, failed };
  } catch (error) {
    logger.error({ err: error, message: toErrorMessage(error) }, "startup backfill failed");
    return { seeded: [], skipped: [], empty: [], failed: [] };
  }
}
