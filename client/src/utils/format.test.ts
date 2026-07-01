import { describe, expect, it } from "vitest";

import {
  changeDirection,
  effectiveFreshness,
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  formatRelativeTime,
} from "./format";

describe("formatCurrency", () => {
  it("formats a normal price with 2 fraction digits", () => {
    expect(formatCurrency("58683.10")).toBe("$58,683.10");
  });

  it("formats a sub-1 price with extra fraction digits", () => {
    expect(formatCurrency("0.00012345")).toBe("$0.000123");
  });

  it("accepts a number as well as a string", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("returns a dash for NaN input", () => {
    expect(formatCurrency("not-a-number")).toBe("—");
  });
});

describe("formatCompactCurrency", () => {
  it("formats a trillions value compactly", () => {
    expect(formatCompactCurrency("1180000000000")).toBe("$1.18T");
  });

  it("formats a billions value compactly", () => {
    expect(formatCompactCurrency("25500000000")).toBe("$25.5B");
  });

  it("returns a dash for null", () => {
    expect(formatCompactCurrency(null)).toBe("—");
  });

  it("returns a dash for NaN", () => {
    expect(formatCompactCurrency("not-a-number")).toBe("—");
  });
});

describe("formatPercent", () => {
  it("formats a positive value with a leading plus sign", () => {
    expect(formatPercent(1.37)).toBe("+1.37%");
  });

  it("formats a negative value with a leading minus sign", () => {
    expect(formatPercent(-1.37)).toBe("-1.37%");
  });

  it("returns a dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("returns a dash for NaN", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("changeDirection", () => {
  it("returns 'up' for positive values", () => {
    expect(changeDirection(1.37)).toBe("up");
    expect(changeDirection(0.01)).toBe("up");
  });

  it("returns 'down' for negative values", () => {
    expect(changeDirection(-1.37)).toBe("down");
    expect(changeDirection(-0.01)).toBe("down");
  });

  it("returns 'neutral' for zero", () => {
    expect(changeDirection(0)).toBe("neutral");
  });

  it("returns 'neutral' for null", () => {
    expect(changeDirection(null)).toBe("neutral");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-01T12:00:00.000Z").getTime();

  it("returns 'just now' for less than 5 seconds ago", () => {
    expect(formatRelativeTime(new Date(now - 3000).toISOString(), now)).toBe("just now");
  });

  it("returns seconds ago for under a minute", () => {
    expect(formatRelativeTime(new Date(now - 30000).toISOString(), now)).toBe("30s ago");
  });

  it("returns minutes ago for under an hour", () => {
    expect(formatRelativeTime(new Date(now - 90000).toISOString(), now)).toBe("1m ago");
  });

  it("returns hours ago for an hour or more", () => {
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now)).toBe(
      "2h ago",
    );
  });

  it("returns 'never' for null", () => {
    expect(formatRelativeTime(null, now)).toBe("never");
  });

  it("returns a dash for an invalid iso string", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("—");
  });
});

describe("effectiveFreshness", () => {
  it("returns 'live' when status is live and age is under the threshold", () => {
    expect(effectiveFreshness("live", 1000, 60000)).toBe("live");
  });

  it("returns 'stale' when status is live but age exceeds the threshold", () => {
    expect(effectiveFreshness("live", 60001, 60000)).toBe("stale");
  });

  it("returns 'error' regardless of age", () => {
    expect(effectiveFreshness("error", 0, 60000)).toBe("error");
    expect(effectiveFreshness("error", 999999, 60000)).toBe("error");
  });

  it("returns 'stale' when status is already stale", () => {
    expect(effectiveFreshness("stale", 0, 60000)).toBe("stale");
  });

  it("stays as status at the exact threshold boundary (not stale, since it's strictly greater-than)", () => {
    expect(effectiveFreshness("live", 60000, 60000)).toBe("live");
  });
});
