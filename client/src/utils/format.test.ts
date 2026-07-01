import { describe, expect, it } from "vitest";

import { changeDirection, formatCompactCurrency, formatCurrency, formatPercent } from "./format";

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
