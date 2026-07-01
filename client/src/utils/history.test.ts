import { describe, expect, it } from "vitest";

import { buildSparklinePath, historyStats } from "./history";
import type { HistoryPointDto } from "../api/types";

function point(price: string, recordedAt: string): HistoryPointDto {
  return { price, recordedAt };
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
