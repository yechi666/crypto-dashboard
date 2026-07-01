import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToCoins } from "./coinsStream";
import type { CoinsResponse } from "./types";

// Mirrors the POLL_MS interval in coinsStream.ts; kept local since the
// constant isn't (and shouldn't need to be) exported from the module.
const POLL_MS = 15000;

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
    const onConnectionChange = vi.fn();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });

    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/events");
    es.emitCoins(JSON.stringify(sampleCoinsResponse));

    expect(onSnapshot).toHaveBeenCalledWith(sampleCoinsResponse);
    expect(onError).not.toHaveBeenCalled();
    expect(onConnectionChange).toHaveBeenCalledWith("connecting");

    unsubscribe();
  });

  it("malformed coins frame is ignored (no throw, no onSnapshot call)", () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
    const es = FakeEventSource.instances[0];

    expect(() => es.emitCoins("not valid json")).not.toThrow();
    expect(onSnapshot).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    unsubscribe();
  });

  it("SSE error falls back to REST polling and delivers the polled snapshot", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
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
    expect(onConnectionChange).toHaveBeenCalledWith("polling");

    unsubscribe();
  });

  it("es.onopen marks connected but does NOT stop polling by itself", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
    const es = FakeEventSource.instances[0];

    expect(onConnectionChange).toHaveBeenCalledWith("connecting");

    es.emitError();
    await vi.advanceTimersByTimeAsync(0); // flush immediate pollOnce
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onConnectionChange).toHaveBeenCalledWith("polling");

    es.emitOpen(); // socket reports healthy, but no coins payload yet
    expect(onConnectionChange).toHaveBeenCalledWith("connected");

    // Polling must keep going: onopen alone never stops it.
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("a coins event stops polling that was started by a prior error", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
    const es = FakeEventSource.instances[0];

    es.emitError();
    await vi.advanceTimersByTimeAsync(0); // flush immediate pollOnce
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onConnectionChange).toHaveBeenCalledWith("polling");

    onSnapshot.mockClear();
    es.emitOpen(); // socket flaps back open, but polling should keep running
    es.emitCoins(JSON.stringify(sampleCoinsResponse)); // real SSE delivery resumes
    expect(onSnapshot).toHaveBeenCalledWith(sampleCoinsResponse);
    expect(onConnectionChange).toHaveBeenCalledWith("connected");

    const callsAfterCoinsEvent = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterCoinsEvent); // no further polls

    unsubscribe();
  });

  it("flapping onerror/onopen without a coins event never storms requests", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
    const es = FakeEventSource.instances[0];

    // Simulate a rapidly flapping socket: error/open repeatedly, no coins ever.
    for (let i = 0; i < 5; i++) {
      es.emitError();
      es.emitOpen();
    }
    await vi.advanceTimersByTimeAsync(0); // flush any immediate pollOnce from ensurePolling

    // Only the single guarded ensurePolling() immediate fetch should have fired,
    // not one per flap cycle.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("dedupes onConnectionChange('polling') across repeated onerror calls", () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
    const es = FakeEventSource.instances[0];

    es.emitError();
    es.emitError();
    es.emitError();

    const pollingCalls = onConnectionChange.mock.calls.filter(([state]) => state === "polling");
    expect(pollingCalls).toHaveLength(1);

    unsubscribe();
  });

  it("unsubscribe closes the EventSource, ignores further coins events, and clears pending polling", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });
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

  it("watchdog falls back to polling if no snapshot arrives within STALE_AFTER_MS, even without onerror", async () => {
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleCoinsResponse,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onError, onConnectionChange });

    // No `coins` event and no onerror ever fires — simulates a socket that
    // stays "open" through a dev proxy while the upstream server is dead.
    await vi.advanceTimersByTimeAsync(66000); // past STALE_AFTER_MS (60000) + a watchdog tick

    expect(onConnectionChange).toHaveBeenCalledWith("polling");
    expect(fetchMock).toHaveBeenCalled();

    unsubscribe();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchMock).not.toHaveBeenCalled(); // watchdog interval cleared on unsubscribe
  });
});
