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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("subscribing immediately reports connecting", () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });

    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/events");
    expect(onConnectionChange).toHaveBeenCalledWith("connecting");

    unsubscribe();
  });

  it("coins event calls onSnapshot with the parsed payload and marks connected", () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });

    const es = FakeEventSource.instances[0];
    es.emitCoins(JSON.stringify(sampleCoinsResponse));

    expect(onSnapshot).toHaveBeenCalledWith(sampleCoinsResponse);
    expect(onConnectionChange).toHaveBeenCalledWith("connected");

    unsubscribe();
  });

  it("malformed coins frame is ignored (no throw, no onSnapshot call)", () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });
    const es = FakeEventSource.instances[0];

    expect(() => es.emitCoins("not valid json")).not.toThrow();
    expect(onSnapshot).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    unsubscribe();
  });

  it("es.onerror marks the connection as polling", () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });
    const es = FakeEventSource.instances[0];

    es.emitError();

    expect(onConnectionChange).toHaveBeenCalledWith("polling");

    unsubscribe();
  });

  it("dedupes onConnectionChange('polling') across repeated onerror calls", () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });
    const es = FakeEventSource.instances[0];

    es.emitError();
    es.emitError();
    es.emitError();

    const pollingCalls = onConnectionChange.mock.calls.filter(([state]) => state === "polling");
    expect(pollingCalls).toHaveLength(1);

    unsubscribe();
  });

  it("watchdog falls back to polling if no snapshot arrives within STALE_AFTER_MS, even without onerror", async () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });

    // No `coins` event and no onerror ever fires — simulates a socket that
    // stays "open" through a dev proxy while the upstream server is dead.
    await vi.advanceTimersByTimeAsync(66000); // past STALE_AFTER_MS (60000) + a watchdog tick

    expect(onConnectionChange).toHaveBeenCalledWith("polling");

    unsubscribe();
  });

  it("unsubscribe closes the EventSource and clears the watchdog (no further connection changes)", async () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();
    vi.useFakeTimers();

    const unsubscribe = subscribeToCoins({ onSnapshot, onConnectionChange });
    const es = FakeEventSource.instances[0];

    unsubscribe();
    expect(es.close).toHaveBeenCalledTimes(1);

    onConnectionChange.mockClear();

    // Real EventSource stops delivering events once closed, so the watchdog
    // clearing is what we're really verifying here: no further ticks fire.
    await vi.advanceTimersByTimeAsync(120000);
    expect(onConnectionChange).not.toHaveBeenCalled(); // watchdog interval cleared, no further ticks
  });
});
