import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as coincap from "../src/services/coincap.js";
import { UpstreamError, type AssetsSnapshot, type UpstreamCoin } from "../src/services/coincap.js";
import { prisma } from "../src/lib/prisma.js";
import { runRefreshCycle } from "../src/services/refreshLoop.js";

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

function makeSnapshot(coins: UpstreamCoin[], timestamp: Date = new Date()): AssetsSnapshot {
  return { timestamp, coins };
}

describe("runRefreshCycle", () => {
  beforeEach(() => {
    vi.spyOn(coincap, "fetchAssets");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("success populates Coin, PriceHistory, and a SUCCEEDED FetchLog", async () => {
    const timestamp = new Date();
    const coins = [
      makeCoin({ id: "bitcoin", symbol: "BTC", marketCapRank: 1, currentPrice: "50000.00" }),
      makeCoin({ id: "ethereum", symbol: "ETH", marketCapRank: 2, currentPrice: "3000.00" }),
      makeCoin({ id: "solana", symbol: "SOL", marketCapRank: 3, currentPrice: "150.00" }),
    ];
    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(makeSnapshot(coins, timestamp));

    await runRefreshCycle();

    const coinRows = await prisma.coin.findMany();
    expect(coinRows).toHaveLength(3);

    const btc = coinRows.find((c) => c.id === "bitcoin");
    expect(btc).toBeDefined();
    expect(Number(btc?.currentPrice)).toBe(50000);
    expect(btc?.marketCapRank).toBe(1);

    const historyRows = await prisma.priceHistory.findMany();
    expect(historyRows).toHaveLength(3);
    for (const row of historyRows) {
      expect(row.recordedAt.getTime()).toBe(timestamp.getTime());
      expect(row.deletedAt).toBeNull();
    }

    const logs = await prisma.fetchLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe("SUCCEEDED");
    expect(logs[0]?.coinsUpdated).toBe(3);
  });

  it("failure records a FAILED FetchLog, does not throw, and writes no coin data", async () => {
    vi.mocked(coincap.fetchAssets).mockRejectedValueOnce(
      new UpstreamError("http", "unauthorized", 401),
    );

    await expect(runRefreshCycle()).resolves.toBeUndefined();

    const logs = await prisma.fetchLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe("FAILED");
    expect(logs[0]?.errorMessage).toBeTruthy();

    const coinRows = await prisma.coin.findMany();
    expect(coinRows).toHaveLength(0);
  });

  it("soft-deletes PriceHistory rows older than the retention window", async () => {
    const oldRecordedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);

    await prisma.coin.create({
      data: {
        id: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        currentPrice: "40000.00",
        marketCap: "900000000000.00",
        marketCapRank: 1,
        lastUpdatedUpstream: oldRecordedAt,
      },
    });
    const oldHistory = await prisma.priceHistory.create({
      data: {
        coinId: "bitcoin",
        price: "40000.00",
        recordedAt: oldRecordedAt,
        deletedAt: null,
      },
    });

    const timestamp = new Date();
    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(
      makeSnapshot(
        [makeCoin({ id: "bitcoin", marketCapRank: 1, currentPrice: "51000.00" })],
        timestamp,
      ),
    );

    await runRefreshCycle();

    const oldRow = await prisma.priceHistory.findUniqueOrThrow({ where: { id: oldHistory.id } });
    expect(oldRow.deletedAt).not.toBeNull();

    const freshRows = await prisma.priceHistory.findMany({
      where: { recordedAt: timestamp },
    });
    expect(freshRows).toHaveLength(1);
    expect(freshRows[0]?.deletedAt).toBeNull();
  });

  it("persists priceChangePercentage24h values that would overflow Decimal(10,4)", async () => {
    const timestamp = new Date();
    const coins = [
      makeCoin({
        id: "bitcoin",
        symbol: "BTC",
        marketCapRank: 1,
        priceChangePercentage24h: 2_500_000,
      }),
      makeCoin({
        id: "ethereum",
        symbol: "ETH",
        marketCapRank: 2,
        priceChangePercentage24h: -1_500_000,
      }),
    ];
    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(makeSnapshot(coins, timestamp));

    await runRefreshCycle();

    const logs = await prisma.fetchLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe("SUCCEEDED");

    const btc = await prisma.coin.findUniqueOrThrow({ where: { id: "bitcoin" } });
    expect(Number(btc.priceChangePercentage24h)).toBe(2_500_000);

    const eth = await prisma.coin.findUniqueOrThrow({ where: { id: "ethereum" } });
    expect(Number(eth.priceChangePercentage24h)).toBe(-1_500_000);
  });

  it("upsert idempotency: repeated cycles keep one Coin row updated, append PriceHistory rows", async () => {
    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(
      makeSnapshot([makeCoin({ id: "bitcoin", currentPrice: "50000.00" })], new Date()),
    );
    await runRefreshCycle();

    vi.mocked(coincap.fetchAssets).mockResolvedValueOnce(
      makeSnapshot([makeCoin({ id: "bitcoin", currentPrice: "55000.00" })], new Date()),
    );
    await runRefreshCycle();

    const coinRows = await prisma.coin.findMany({ where: { id: "bitcoin" } });
    expect(coinRows).toHaveLength(1);
    expect(Number(coinRows[0]?.currentPrice)).toBe(55000);

    const historyRows = await prisma.priceHistory.findMany({ where: { coinId: "bitcoin" } });
    expect(historyRows).toHaveLength(2);
  });
});
