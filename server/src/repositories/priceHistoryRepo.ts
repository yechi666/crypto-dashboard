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

/**
 * Build (but do not execute) the soft-delete op that marks PriceHistory rows
 * older than `cutoff` as pruned, suitable for passing into a
 * $transaction([...]) array.
 */
export function softDeletePrunedOp(cutoff: Date): Prisma.PrismaPromise<unknown> {
  return prisma.priceHistory.updateMany({
    where: { recordedAt: { lt: cutoff }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

/** Insert already-fetched history rows (e.g. from the startup backfill). */
export async function insertMany(
  rows: { coinId: string; price: string; recordedAt: Date }[],
): Promise<void> {
  await prisma.priceHistory.createMany({ data: rows });
}

/** Count live (non-pruned) history rows for a coin — backs backfill idempotency. */
export async function countLiveByCoin(coinId: string): Promise<number> {
  return prisma.priceHistory.count({ where: { coinId, deletedAt: null } });
}

/**
 * Ascending-time price history for a coin since `since`, excluding
 * soft-deleted (pruned) rows. Backs the per-coin history detail view.
 */
export async function findByCoinSince(coinId: string, since: Date) {
  return prisma.priceHistory.findMany({
    where: { coinId, deletedAt: null, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
  });
}
