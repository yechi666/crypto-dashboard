import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { UpstreamCoin } from "../services/coincap.js";

/**
 * Build (but do not execute) the PriceHistory createMany op for a snapshot of
 * upstream coins, suitable for passing into a $transaction([...]) array
 * alongside the Coin upserts.
 */
export function insertSnapshotOp(
  coins: UpstreamCoin[],
  timestamp: Date,
): Prisma.PrismaPromise<unknown> {
  return prisma.priceHistory.createMany({
    data: coins.map((c) => ({
      coinId: c.id,
      price: c.currentPrice,
      volume24h: c.volume24h,
      recordedAt: timestamp,
    })),
  });
}

/** Insert already-fetched history rows (e.g. from the startup backfill). */
export async function insertMany(
  rows: { coinId: string; price: string; recordedAt: Date }[],
): Promise<void> {
  await prisma.priceHistory.createMany({ data: rows });
}

/** Count history rows for a coin — backs backfill idempotency. */
export async function countByCoin(coinId: string): Promise<number> {
  return prisma.priceHistory.count({ where: { coinId } });
}

/**
 * Ascending-time price history for a coin since `since` (a recordedAt window).
 * The history route clamps the window to <= HISTORY_MAX_LOOKBACK_HOURS. Backs the
 * per-coin history detail view.
 */
export async function findByCoinSince(coinId: string, since: Date) {
  return prisma.priceHistory.findMany({
    where: { coinId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
  });
}
