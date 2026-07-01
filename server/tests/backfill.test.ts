import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as coincap from "../src/services/coincap.js";
import type { AssetsSnapshot, HistoryPoint, UpstreamCoin } from "../src/services/coincap.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { runStartupBackfill } from "../src/services/backfill.js";

function makeCoin(overrides: Partial<UpstreamCoin> = {}): UpstreamCoin {
  return {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    currentPrice: "50000.1234567890",
    marketCap: "1000000000000.00",
    volume24h: "50000000000.00",
    vwapUsd24h: "49500.00",
    priceChangePercentage24h: 1.5,
    marketCapRank: 1,
    ...overrides,
  };
}

function makeCoins(count: number): UpstreamCoin[] {
  return Array.from({ length: count }, (_, i) =>
    makeCoin({
      id: `coin-${i + 1}`,
      symbol: `C${i + 1}`,
      name: `Coin ${i + 1}`,
      marketCapRank: i + 1,
    }),
  );
}

function makeSnapshot(coins: UpstreamCoin[], timestamp: Date = new Date()): AssetsSnapshot {
  return { timestamp, coins };
}

function makeHistoryPoints(count: number): HistoryPoint[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    price: `100${i}.00`,
    recordedAt: new Date(now - (count - i) * 60_000),
  }));
}

describe("runStartupBackfill", () => {
  beforeEach(() => {
    vi.spyOn(coincap, "fetchAssets");
    vi.spyOn(coincap, "fetchHistory");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first boot seeds history for exactly the top COIN_COUNT coins", async () => {
    const coins = makeCoins(env.COIN_COUNT + 2);
    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(makeSnapshot(coins));
    vi.mocked(coincap.fetchHistory).mockResolvedValue(makeHistoryPoints(3));

    const summary = await runStartupBackfill();

    const coinRows = await prisma.coin.findMany();
    expect(coinRows).toHaveLength(env.COIN_COUNT);

    const historyRows = await prisma.priceHistory.findMany();
    expect(historyRows).toHaveLength(env.COIN_COUNT * 3);

    expect(coincap.fetchHistory).toHaveBeenCalledTimes(env.COIN_COUNT);
    // Only the display slice, not the extra coins beyond COIN_COUNT.
    const calledIds = vi.mocked(coincap.fetchHistory).mock.calls.map(([id]) => id);
    expect(calledIds).not.toContain(`coin-${env.COIN_COUNT + 1}`);
    expect(calledIds).not.toContain(`coin-${env.COIN_COUNT + 2}`);

    // Assert on the returned BackfillSummary
    expect(summary.seeded).toHaveLength(env.COIN_COUNT);
    expect(summary.seeded.every((s) => s.points === 3)).toBe(true);
    const seededIds = summary.seeded.map((s) => s.id);
    expect(seededIds).toEqual(coins.slice(0, env.COIN_COUNT).map((c) => c.id));
    expect(summary.skipped).toHaveLength(0);
    expect(summary.empty).toHaveLength(0);
    expect(summary.failed).toHaveLength(0);
  });

  it("is idempotent: a second run does not refetch or duplicate history", async () => {
    const coins = makeCoins(env.COIN_COUNT);
    vi.mocked(coincap.fetchAssets).mockResolvedValue(makeSnapshot(coins));
    vi.mocked(coincap.fetchHistory).mockResolvedValue(makeHistoryPoints(3));

    await runStartupBackfill();
    const countAfterFirst = await prisma.priceHistory.count();
    expect(countAfterFirst).toBe(env.COIN_COUNT * 3);
    expect(coincap.fetchHistory).toHaveBeenCalledTimes(env.COIN_COUNT);

    vi.mocked(coincap.fetchHistory).mockClear();

    const secondSummary = await runStartupBackfill();
    const countAfterSecond = await prisma.priceHistory.count();
    expect(countAfterSecond).toBe(countAfterFirst);
    expect(coincap.fetchHistory).not.toHaveBeenCalled();

    // Assert that the second run's summary shows all coins as skipped
    expect(secondSummary.skipped).toHaveLength(env.COIN_COUNT);
    expect(secondSummary.seeded).toHaveLength(0);
    expect(secondSummary.empty).toHaveLength(0);
    expect(secondSummary.failed).toHaveLength(0);
  });

  it("isolates a per-coin fetchHistory failure without aborting the rest", async () => {
    const coins = makeCoins(3);
    const failingId = "coin-2";
    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(makeSnapshot(coins));
    vi.mocked(coincap.fetchHistory).mockImplementation(async (id) => {
      if (id === failingId) {
        throw new coincap.UpstreamError("http", "boom", 500);
      }
      return makeHistoryPoints(2);
    });

    const summary = await runStartupBackfill();

    const coinRows = await prisma.coin.findMany();
    expect(coinRows).toHaveLength(3);

    const failingHistory = await prisma.priceHistory.findMany({
      where: { coinId: failingId },
    });
    expect(failingHistory).toHaveLength(0);

    const okHistory1 = await prisma.priceHistory.findMany({ where: { coinId: "coin-1" } });
    const okHistory3 = await prisma.priceHistory.findMany({ where: { coinId: "coin-3" } });
    expect(okHistory1).toHaveLength(2);
    expect(okHistory3).toHaveLength(2);

    // Assert on the returned BackfillSummary
    expect(summary.failed).toContain(failingId);
    expect(summary.seeded.map((s) => s.id)).toEqual(["coin-1", "coin-3"]);
    expect(summary.skipped).toHaveLength(0);
    expect(summary.empty).toHaveLength(0);
  });
});
