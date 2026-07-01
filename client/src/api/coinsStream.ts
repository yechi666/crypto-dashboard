import { fetchCoins } from "./client";
import type { CoinsResponse } from "./types";
import { STALE_AFTER_MS } from "../config";
import { toErrorMessage } from "../utils/errors";

const POLL_MS = 15000;
const WATCHDOG_CHECK_MS = 5000;

export type ConnectionState = "connecting" | "connected" | "polling";

export interface CoinsStreamHandlers {
  onSnapshot: (data: CoinsResponse) => void;
  onError: (message: string) => void;
  onConnectionChange: (state: ConnectionState) => void;
}

/**
 * Subscribe to live coin snapshots: Server-Sent Events primary, REST polling
 * fallback if the SSE connection drops. Returns an unsubscribe function that
 * closes the stream and stops any polling. Framework-agnostic (no React).
 */
export function subscribeToCoins({
  onSnapshot,
  onError,
  onConnectionChange,
}: CoinsStreamHandlers): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let lastReceivedAt = Date.now();
  // No real ConnectionState value here on purpose: it guarantees the first
  // setConnection("connecting") call below always fires onConnectionChange,
  // even though "connecting" is also the first real state.
  let connection: ConnectionState | null = null;

  // Dedupe: only notify + update state when it actually changes. This is
  // what makes a flapping socket safe — repeated onerror/onopen cycles that
  // don't change the logical state don't trigger repeated side effects.
  const setConnection = (next: ConnectionState) => {
    if (connection !== next && !signal.aborted) {
      connection = next;
      onConnectionChange(next);
    }
  };

  const emitSnapshot = (data: CoinsResponse) => {
    lastReceivedAt = Date.now();
    if (!signal.aborted) onSnapshot(data);
  };

  const stopPolling = () => {
    if (pollInterval !== null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const pollOnce = async () => {
    try {
      const data = await fetchCoins(signal);
      emitSnapshot(data);
    } catch (err) {
      if (signal.aborted) return;
      onError(toErrorMessage(err));
    }
  };

  const ensurePolling = () => {
    if (pollInterval !== null) return; // already polling
    void pollOnce(); // immediate fetch so the user isn't stuck waiting for the interval
    pollInterval = setInterval(() => {
      void pollOnce();
    }, POLL_MS);
  };

  setConnection("connecting");

  const es = new EventSource("/api/events");

  es.addEventListener("coins", (event) => {
    const messageEvent = event as MessageEvent<string>;
    try {
      const data = JSON.parse(messageEvent.data) as CoinsResponse;
      emitSnapshot(data);
      // A genuine SSE payload arrived: the stream is truly healthy again, so
      // this is the only place polling stops. Socket-level open/error events
      // are not trusted for this (they flap independently of real delivery).
      setConnection("connected");
      stopPolling();
    } catch (err) {
      console.warn("Failed to parse SSE coins payload", err);
    }
  });

  es.onopen = () => {
    // Only reflects socket-level state; does NOT stop polling. Polling is
    // state-driven (see ensurePolling/stopPolling above), not event-driven,
    // so a flapping open<->error cycle can't restart an immediate poll loop.
    setConnection("connected");
  };
  es.onerror = () => {
    setConnection("polling");
    ensurePolling(); // guarded: repeated errors never spawn extra intervals
  };

  // Safety net: some failure modes (e.g. a dev-proxy that keeps the socket
  // "open" while upstream is dead) never fire onerror, so don't just trust
  // the socket state — trust the clock. If no snapshot has landed within
  // STALE_AFTER_MS, force the poll fallback regardless of reported state.
  const watchdog = setInterval(() => {
    if (signal.aborted) return;
    if (Date.now() - lastReceivedAt > STALE_AFTER_MS) {
      setConnection("polling");
      ensurePolling(); // guarded against duplicates; recovers data even though onerror never fired
    }
  }, WATCHDOG_CHECK_MS);

  return () => {
    controller.abort();
    es.close();
    stopPolling();
    clearInterval(watchdog);
  };
}
