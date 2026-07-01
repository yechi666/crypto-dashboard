import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

interface SeedCoinOverrides {
  id?: string;
  marketCapRank?: number;
}

function seedCoinData(overrides: SeedCoinOverrides = {}) {
  const rank = overrides.marketCapRank ?? 1;
  const id = overrides.id ?? `coin-${rank}`;
  return {
    id,
    symbol: `C${rank}`,
    name: `Coin ${rank}`,
    currentPrice: "100.1234567890",
    marketCap: "1000000.00",
    marketCapRank: rank,
    volume24h: "50000.00",
    priceChangePercentage24h: 1.5,
    lastUpdatedUpstream: new Date(),
  };
}

async function seedCoins(count: number) {
  await prisma.coin.createMany({
    data: Array.from({ length: count }, (_, i) => seedCoinData({ marketCapRank: i + 1 })),
  });
}

describe("GET /api/coins", () => {
  it("returns the top COIN_COUNT coins in rank order, and reports live when recently succeeded", async () => {
    await seedCoins(25);
    await prisma.fetchLog.create({
      data: {
        source: "coincap",
        status: "SUCCEEDED",
        finishedAt: new Date(),
      },
    });

    const res = await request(createApp()).get("/api/coins");

    expect(res.status).toBe(200);
    expect(res.body.coins).toHaveLength(env.COIN_COUNT);
    expect(res.body.coins.map((c: { marketCapRank: number }) => c.marketCapRank)).toEqual(
      Array.from({ length: env.COIN_COUNT }, (_, i) => i + 1),
    );
    expect(res.body.status).toBe("live");
    expect(typeof res.body.lastSuccessfulFetchAt).toBe("string");
    expect(res.body.lastSuccessfulFetchAt).not.toBeNull();

    const first = res.body.coins[0];
    expect(typeof first.currentPrice).toBe("string");
    expect(typeof first.marketCap).toBe("string");
    expect(
      typeof first.priceChangePercentage24h === "number" || first.priceChangePercentage24h === null,
    ).toBe(true);
    expect(Number.isNaN(Date.parse(first.lastUpdatedUpstream))).toBe(false);
  });

  it("reports stale when the last successful fetch is older than the freshness window", async () => {
    await seedCoins(5);
    const staleAt = new Date(
      Date.now() - (env.STALE_AFTER_INTERVALS * env.POLL_INTERVAL_MS + 60_000),
    );
    await prisma.fetchLog.create({
      data: {
        source: "coincap",
        status: "SUCCEEDED",
        finishedAt: staleAt,
      },
    });

    const res = await request(createApp()).get("/api/coins");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("stale");
  });

  it("reports error and null lastSuccessfulFetchAt when there is no successful fetch, but still returns last-known-good coins", async () => {
    await seedCoins(5);
    await prisma.fetchLog.create({
      data: {
        source: "coincap",
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: "boom",
      },
    });

    const res = await request(createApp()).get("/api/coins");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("error");
    expect(res.body.lastSuccessfulFetchAt).toBeNull();
    expect(res.body.coins).toHaveLength(5);
  });
});
