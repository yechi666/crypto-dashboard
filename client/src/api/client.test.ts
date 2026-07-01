import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCoinHistory, fetchCoins } from "./client";
import type { CoinsResponse, CoinHistoryResponse } from "./types";

const sampleCoinsResponse: CoinsResponse = {
  status: "live",
  lastSuccessfulFetchAt: "2026-07-01T12:00:00.000Z",
  coins: [
    {
      id: "bitcoin",
      symbol: "btc",
      name: "Bitcoin",
      currentPrice: "60000.12",
      marketCap: "1200000000000",
      marketCapRank: 1,
      volume24h: "30000000000",
      priceChangePercentage24h: 1.23,
      lastUpdatedUpstream: "2026-07-01T11:59:00.000Z",
      updatedAt: "2026-07-01T12:00:00.000Z",
    },
  ],
};

const sampleHistoryResponse: CoinHistoryResponse = {
  coin: sampleCoinsResponse.coins[0],
  points: [{ price: "60000.12", recordedAt: "2026-07-01T12:00:00.000Z" }],
};

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetchCoins() returns parsed JSON on success and calls /api/coins", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCoins();

    expect(result).toEqual(sampleCoinsResponse);
    expect(fetchMock).toHaveBeenCalledWith("/api/coins", {
      headers: { Accept: "application/json" },
      signal: undefined,
    });
  });

  it("fetchCoins(signal) forwards the AbortSignal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await fetchCoins(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/coins",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("fetchCoins() rejects with an Error including the status on non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCoins()).rejects.toThrow(/500/);
  });

  it("fetchCoinHistory(id, minutes) returns parsed JSON and calls the URL with a query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleHistoryResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCoinHistory("bitcoin", 30);

    expect(result).toEqual(sampleHistoryResponse);
    expect(fetchMock).toHaveBeenCalledWith("/api/coins/bitcoin/history?minutes=30", {
      headers: { Accept: "application/json" },
      signal: undefined,
    });
  });

  it("fetchCoinHistory(id) without minutes calls the URL with no query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleHistoryResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCoinHistory("bitcoin");

    expect(fetchMock).toHaveBeenCalledWith("/api/coins/bitcoin/history", {
      headers: { Accept: "application/json" },
      signal: undefined,
    });
  });
});
