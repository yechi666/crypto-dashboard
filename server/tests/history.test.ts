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

async function seedCoin(overrides: SeedCoinOverrides = {}) {
  return prisma.coin.create({ data: seedCoinData(overrides) });
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

describe("GET /api/coins/:id/history", () => {
  it("returns points in ascending time order within the window, plus the coin", async () => {
    const coin = await seedCoin({ id: "bitcoin" });
    await prisma.priceHistory.createMany({
      data: [
        { coinId: coin.id, price: "100.00", recordedAt: minutesAgo(50) },
        { coinId: coin.id, price: "101.00", recordedAt: minutesAgo(30) },
        { coinId: coin.id, price: "102.00", recordedAt: minutesAgo(10) },
      ],
    });

    const res = await request(createApp()).get(`/api/coins/${coin.id}/history`);

    expect(res.status).toBe(200);
    expect(res.body.coin.id).toBe(coin.id);
    expect(typeof res.body.coin.currentPrice).toBe("string");
    expect(res.body.points).toHaveLength(3);

    const recordedTimes = res.body.points.map((p: { recordedAt: string }) =>
      Date.parse(p.recordedAt),
    );
    expect(recordedTimes).toEqual([...recordedTimes].sort((a, b) => a - b));

    for (const point of res.body.points) {
      expect(typeof point.price).toBe("string");
      expect(Number.isNaN(Date.parse(point.recordedAt))).toBe(false);
    }
  });

  it("returns 404 for an unknown coin id", async () => {
    const res = await request(createApp()).get("/api/coins/does-not-exist/history");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 with an empty points array when the coin has no history", async () => {
    const coin = await seedCoin({ id: "ethereum" });

    const res = await request(createApp()).get(`/api/coins/${coin.id}/history`);

    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
    expect(res.body.coin).toBeDefined();
    expect(res.body.coin.id).toBe(coin.id);
  });

  describe("window filtering and clamping", () => {
    it("defaults to the last 60 minutes when no query param is given", async () => {
      const coin = await seedCoin({ id: "cardano" });
      await prisma.priceHistory.createMany({
        data: [
          { coinId: coin.id, price: "1.00", recordedAt: minutesAgo(90) },
          { coinId: coin.id, price: "2.00", recordedAt: minutesAgo(10) },
        ],
      });

      const res = await request(createApp()).get(`/api/coins/${coin.id}/history`);

      expect(res.status).toBe(200);
      expect(res.body.points).toHaveLength(1);
      expect(res.body.points[0].price).toBe("2");
    });

    it("honors ?minutes=120 to include rows outside the default window", async () => {
      const coin = await seedCoin({ id: "polkadot" });
      await prisma.priceHistory.createMany({
        data: [
          { coinId: coin.id, price: "1.00", recordedAt: minutesAgo(90) },
          { coinId: coin.id, price: "2.00", recordedAt: minutesAgo(10) },
        ],
      });

      const res = await request(createApp()).get(`/api/coins/${coin.id}/history?minutes=120`);

      expect(res.status).toBe(200);
      expect(res.body.points).toHaveLength(2);
    });

    it("falls back to the default of 60 minutes when minutes is not a valid number", async () => {
      const coin = await seedCoin({ id: "litecoin" });
      await prisma.priceHistory.createMany({
        data: [
          { coinId: coin.id, price: "1.00", recordedAt: minutesAgo(90) },
          { coinId: coin.id, price: "2.00", recordedAt: minutesAgo(10) },
        ],
      });

      const res = await request(createApp()).get(`/api/coins/${coin.id}/history?minutes=abc`);

      expect(res.status).toBe(200);
      expect(res.body.points).toHaveLength(1);
      expect(res.body.points[0].price).toBe("2");
    });

    it("clamps an excessive minutes value to the retention window instead of erroring", async () => {
      const coin = await seedCoin({ id: "dogecoin" });
      await prisma.priceHistory.createMany({
        data: [
          { coinId: coin.id, price: "1.00", recordedAt: minutesAgo(90) },
          { coinId: coin.id, price: "2.00", recordedAt: minutesAgo(10) },
        ],
      });

      const res = await request(createApp()).get(`/api/coins/${coin.id}/history?minutes=999999`);

      expect(res.status).toBe(200);
      expect(res.body.points).toHaveLength(2);
      // sanity: retention window is finite and configured via env
      expect(env.HISTORY_RETENTION_HOURS).toBeGreaterThan(0);
    });
  });
});
