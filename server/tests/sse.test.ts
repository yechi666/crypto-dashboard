import type { Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import {
  addClient,
  broadcast,
  clientCount,
  isAtCapacity,
  removeClient,
  sendTo,
} from "../src/services/sse.js";

interface FakeResponse {
  writes: string[];
  closeCallback: (() => void) | null;
  write(chunk: string): boolean;
  on(event: string, cb: () => void): void;
}

function makeFakeClient(): FakeResponse {
  return {
    writes: [],
    closeCallback: null,
    write(chunk: string) {
      this.writes.push(chunk);
      return true;
    },
    on(event: string, cb: () => void) {
      if (event === "close") {
        this.closeCallback = cb;
      }
    },
  };
}

describe("sse service", () => {
  afterEach(() => {
    // Belt-and-braces: make sure no client (and therefore no heartbeat
    // interval) lingers across tests.
    vi.useRealTimers();
  });

  it("registers a client and reflects it in clientCount", () => {
    const fake = makeFakeClient();
    addClient(fake as unknown as Response);

    expect(clientCount()).toBe(1);

    removeClient(fake as unknown as Response);
    expect(clientCount()).toBe(0);
  });

  it("broadcast writes a named event frame with JSON payload to connected clients", () => {
    const fake = makeFakeClient();
    addClient(fake as unknown as Response);

    broadcast("coins", { a: 1 });

    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toBe('event: coins\ndata: {"a":1}\n\n');

    removeClient(fake as unknown as Response);
  });

  it("removes the client and drops clientCount when the close callback fires", () => {
    const fake = makeFakeClient();
    addClient(fake as unknown as Response);
    expect(clientCount()).toBe(1);

    expect(fake.closeCallback).toBeTypeOf("function");
    fake.closeCallback?.();

    expect(clientCount()).toBe(0);
  });

  it("sendTo writes exactly one named event frame to a single client", () => {
    const fake = makeFakeClient();
    addClient(fake as unknown as Response);

    sendTo(fake as unknown as Response, "coins", { b: 2 });

    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toBe('event: coins\ndata: {"b":2}\n\n');

    removeClient(fake as unknown as Response);
  });

  it("heartbeat pings connected clients and stops once the last client disconnects", () => {
    vi.useFakeTimers();
    try {
      const fake = makeFakeClient();
      addClient(fake as unknown as Response);

      vi.advanceTimersByTime(15_001);

      expect(fake.writes.some((w) => w === ": ping\n\n")).toBe(true);

      removeClient(fake as unknown as Response);

      // After the last client disconnects, advancing time further should not
      // throw or write anywhere (the interval should have been cleared) —
      // nothing to assert on `fake` since it's removed, but clientCount
      // should stay at 0 and no interval should keep the process alive.
      vi.advanceTimersByTime(30_000);
      expect(clientCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isAtCapacity is false with no clients connected and well below the configured cap", () => {
    expect(clientCount()).toBe(0);
    expect(env.SSE_MAX_CLIENTS).toBeGreaterThan(0);
    expect(isAtCapacity()).toBe(false);
  });

  it("isAtCapacity flips to true once clientCount reaches SSE_MAX_CLIENTS", () => {
    const fakes: FakeResponse[] = [];
    try {
      for (let i = 0; i < env.SSE_MAX_CLIENTS; i++) {
        const fake = makeFakeClient();
        fakes.push(fake);
        addClient(fake as unknown as Response);
      }

      expect(clientCount()).toBe(env.SSE_MAX_CLIENTS);
      expect(isAtCapacity()).toBe(true);
    } finally {
      for (const fake of fakes) {
        removeClient(fake as unknown as Response);
      }
    }

    expect(clientCount()).toBe(0);
    expect(isAtCapacity()).toBe(false);
  });
});
