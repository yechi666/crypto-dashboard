import { describe, expect, it } from "vitest";

import { buildSparklinePath, historyStats, mergeLivePoint } from "./history";
import type { CoinDto, CoinHistoryResponse, HistoryPointDto } from "../api/types";

function point(price: string, recordedAt: string): HistoryPointDto {
  return { price, recordedAt };
}

function coin(overrides: Partial<CoinDto> = {}): CoinDto {
  return {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    currentPrice: "100",
    marketCap: "1000000",
    marketCapRank: 1,
    volume24h: "500000",
    priceChangePercentage24h: 1.5,
    lastUpdatedUpstream: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("historyStats", () => {
  it("computes latest/high/low/changePct from a few points", () => {
    const points = [
      point("100", "2026-07-01T10:00:00.000Z"),
      point("120", "2026-07-01T10:10:00.000Z"),
      point("90", "2026-07-01T10:20:00.000Z"),
      point("110", "2026-07-01T10:30:00.000Z"),
    ];

    const stats = historyStats(points);

    expect(stats.latest).toBe(110);
    expect(stats.high).toBe(120);
    expect(stats.low).toBe(90);
    expect(stats.changePct).toBeCloseTo(10, 5);
  });

  it("returns all nulls for an empty list", () => {
    expect(historyStats([])).toEqual({
      latest: null,
      high: null,
      low: null,
      changePct: null,
    });
  });

  it("returns null changePct when the first price is 0", () => {
    const points = [
      point("0", "2026-07-01T10:00:00.000Z"),
      point("50", "2026-07-01T10:10:00.000Z"),
    ];

    const stats = historyStats(points);

    expect(stats.changePct).toBeNull();
    expect(stats.latest).toBe(50);
    expect(stats.high).toBe(50);
    expect(stats.low).toBe(0);
  });
});

describe("buildSparklinePath", () => {
  it("returns an empty string for 0 values", () => {
    expect(buildSparklinePath([], 100, 50)).toBe("");
  });

  it("returns an empty string for 1 value", () => {
    expect(buildSparklinePath([42], 100, 50)).toBe("");
  });

  it("builds the correct number of pairs, with first x=0 and last x=width", () => {
    const width = 100;
    const height = 50;
    const values = [1, 5, 3, 8];

    const path = buildSparklinePath(values, width, height);
    const pairs = path.split(" ");

    expect(pairs).toHaveLength(values.length);

    const parsed = pairs.map((pair) => pair.split(",").map(Number));

    expect(parsed[0][0]).toBe(0);
    expect(parsed[parsed.length - 1][0]).toBe(width);

    for (const [, y] of parsed) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
      expect(Number.isNaN(y)).toBe(false);
    }
  });

  it("produces a valid flat line (no NaN) when all values are equal", () => {
    const width = 100;
    const height = 50;
    const values = [7, 7, 7];

    const path = buildSparklinePath(values, width, height);
    const pairs = path.split(" ").map((pair) => pair.split(",").map(Number));

    expect(pairs).toHaveLength(3);
    for (const [x, y] of pairs) {
      expect(Number.isNaN(x)).toBe(false);
      expect(Number.isNaN(y)).toBe(false);
      expect(y).toBe(height / 2);
    }
  });
});

describe("mergeLivePoint", () => {
  it("appends a new point when the timestamp is newer than the last cached point", () => {
    const prev: CoinHistoryResponse = {
      coin: coin({ currentPrice: "100" }),
      points: [point("100", "2026-07-01T10:00:00.000Z")],
    };
    const liveCoin = coin({ currentPrice: "105" });

    const result = mergeLivePoint(prev, liveCoin, "2026-07-01T10:00:30.000Z");

    expect(result).not.toBe(prev);
    expect(result.points).toEqual([
      point("100", "2026-07-01T10:00:00.000Z"),
      point("105", "2026-07-01T10:00:30.000Z"),
    ]);
    expect(result.coin).toBe(liveCoin);
  });

  it("returns the same reference (no-op) when the timestamp equals the last cached point", () => {
    const prev: CoinHistoryResponse = {
      coin: coin(),
      points: [point("100", "2026-07-01T10:00:00.000Z")],
    };

    const result = mergeLivePoint(prev, coin({ currentPrice: "999" }), "2026-07-01T10:00:00.000Z");

    expect(result).toBe(prev);
  });

  it("returns the same reference (no-op) when the timestamp is older than the last cached point", () => {
    const prev: CoinHistoryResponse = {
      coin: coin(),
      points: [point("100", "2026-07-01T10:00:00.000Z")],
    };

    const result = mergeLivePoint(prev, coin({ currentPrice: "999" }), "2026-07-01T09:59:00.000Z");

    expect(result).toBe(prev);
  });

  it("trims points older than the rolling 1h window relative to the newest timestamp", () => {
    const prev: CoinHistoryResponse = {
      coin: coin(),
      points: [
        point("90", "2026-07-01T09:00:00.000Z"), // exactly 1h before the new point -> kept (>=)
        point("95", "2026-07-01T08:59:59.000Z"), // 1h + 1s before -> dropped
        point("98", "2026-07-01T09:30:00.000Z"),
      ],
    };
    const liveCoin = coin({ currentPrice: "110" });

    const result = mergeLivePoint(prev, liveCoin, "2026-07-01T10:00:00.000Z");

    expect(result.points).toEqual([
      point("90", "2026-07-01T09:00:00.000Z"),
      point("98", "2026-07-01T09:30:00.000Z"),
      point("110", "2026-07-01T10:00:00.000Z"),
    ]);
  });
});
