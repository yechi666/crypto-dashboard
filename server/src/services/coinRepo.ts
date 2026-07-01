import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { UpstreamCoin } from "./coincap.js";

/**
 * Build (but do not execute) prisma.coin.upsert operations for the given
 * coins, suitable for passing into a $transaction([...]) array alongside
 * other operations. Shared by the refresh loop and the startup backfill so
 * both write identical Coin rows.
 */
export function coinUpsertOps(
  coins: UpstreamCoin[],
  timestamp: Date,
): Prisma.PrismaPromise<unknown>[] {
  return coins.map((c) =>
    prisma.coin.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        currentPrice: c.currentPrice,
        marketCap: c.marketCap,
        marketCapRank: c.marketCapRank,
        volume24h: c.volume24h,
        priceChangePercentage24h: c.priceChangePercentage24h,
        lastUpdatedUpstream: timestamp,
      },
      update: {
        symbol: c.symbol,
        name: c.name,
        currentPrice: c.currentPrice,
        marketCap: c.marketCap,
        marketCapRank: c.marketCapRank,
        volume24h: c.volume24h,
        priceChangePercentage24h: c.priceChangePercentage24h,
        lastUpdatedUpstream: timestamp,
      },
    }),
  );
}

/**
 * The top env.COIN_COUNT coins by market cap rank — what /api/coins serves.
 * Reads only from our own database; never calls the upstream provider.
 */
export async function getDisplayCoins() {
  return prisma.coin.findMany({
    orderBy: { marketCapRank: { sort: "asc", nulls: "last" } },
    take: env.COIN_COUNT,
  });
}
