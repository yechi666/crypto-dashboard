import { describe, expect, it } from "vitest";
import { resolveHistorySince } from "../src/utils/history.js";

describe("resolveHistorySince", () => {
  const now = 1_000_000_000_000;
  const maxMinutes = 1440; // 24 hours

  it("defaults to 60 minutes when no value is given", () => {
    const result = resolveHistorySince(undefined, maxMinutes, now);
    const expected = new Date(now - 60 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("defaults to 60 minutes when value is null", () => {
    const result = resolveHistorySince(null, maxMinutes, now);
    const expected = new Date(now - 60 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("uses the provided value when valid", () => {
    const result = resolveHistorySince("30", maxMinutes, now);
    const expected = new Date(now - 30 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("clamps excessive minutes to maxMinutes", () => {
    const result = resolveHistorySince("99999", maxMinutes, now);
    const expected = new Date(now - maxMinutes * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("defaults to 60 minutes when value is not a valid number", () => {
    const result = resolveHistorySince("abc", maxMinutes, now);
    const expected = new Date(now - 60 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("defaults to 60 minutes when value is zero", () => {
    const result = resolveHistorySince("0", maxMinutes, now);
    const expected = new Date(now - 60 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("defaults to 60 minutes when value is negative", () => {
    const result = resolveHistorySince("-5", maxMinutes, now);
    const expected = new Date(now - 60 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("floors fractional minute values", () => {
    const result = resolveHistorySince("30.9", maxMinutes, now);
    const expected = new Date(now - 30 * 60_000);
    expect(result.getTime()).toBe(expected.getTime());
  });
});
