import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToCoins } from "./coinsStream";
import type { CoinsResponse } from "./types";

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

type CoinsListener = (event: { data: string }) => void;

class FakeEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  private listeners: Record<string, CoinsListener[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: CoinsListener) {
    (this.listeners[type] ??= []).push(cb);
  }

  emitCoins(dataString: string) {
    for (const cb of this.listeners.coins ?? []) {
      cb({ data: dataString });
    }
  }

  emitError() {
    this.onerror?.();
  }

  emitOpen() {
    this.onopen?.();
  }

  static instances: FakeEventSource[] = [];
}

describe("subscribeToCoins", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("coins event calls onSnapshot with the parsed payload", () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError });

    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/events");
    es.emitCoins(JSON.stringify(sampleCoinsResponse));

    expect(onSnapshot).toHaveBeenCalledWith(sampleCoinsResponse);
    expect(onError).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("malformed coins frame is ignored (no throw, no onSnapshot call)", () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const unsubscribe = subscribeToCoins({ onSnapshot, onError });
    const es = FakeEventSource.instances[0];

    expect(() => es.emitCoins("not valid json")).not.toThrow();
    expect(onSnapshot).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    unsubscribe();
  });

  it("SSE error falls back to REST polling and delivers the polled snapshot", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = subscribeToCoins({ onSnapshot, onError });
    const es = FakeEventSource.instances[0];

    es.emitError();

    // allow the immediate pollOnce() promise chain (fetch -> json -> onSnapshot) to resolve
    await vi.waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledWith(sampleCoinsResponse);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/coins",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );

    unsubscribe();
  });

  it("SSE reopen stops polling", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError });
    const es = FakeEventSource.instances[0];

    es.emitError();
    await vi.advanceTimersByTimeAsync(0); // flush immediate pollOnce
    expect(fetchMock).toHaveBeenCalledTimes(1);

    es.emitOpen(); // SSE healthy again; stop polling
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no further polling calls

    unsubscribe();
  });

  it("unsubscribe closes the EventSource, ignores further coins events, and clears pending polling", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError });
    const es = FakeEventSource.instances[0];

    es.emitError();
    await vi.advanceTimersByTimeAsync(0); // immediate pollOnce fires and resolves
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(es.close).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0] as [string, { signal: AbortSignal }];
    expect(options.signal.aborted).toBe(true);

    onSnapshot.mockClear();
    es.emitCoins(JSON.stringify(sampleCoinsResponse));
    expect(onSnapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // interval was cleared, no further fetches
  });
});
