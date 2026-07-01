import type { CoinsResponse } from "./types";
import { STALE_AFTER_MS } from "../config";

const WATCHDOG_CHECK_MS = 5000;

export type ConnectionState = "connecting" | "connected" | "polling";

export interface CoinsStreamHandlers {
  onSnapshot: (data: CoinsResponse) => void;
  onConnectionChange: (state: ConnectionState) => void;
}

/**
 * Subscribe to live coin snapshots over Server-Sent Events. This module is
 * transport-only: it reports connection health and forwards parsed snapshots,
 * but never fetches or polls on its own — the caller (React Query) owns
 * fetching and decides how to react to a "polling" connection state (e.g. via
 * refetchInterval). Returns an unsubscribe function that closes the stream
 * and clears the watchdog. Framework-agnostic (no React).
 */
export function subscribeToCoins({
  onSnapshot,
  onConnectionChange,
}: CoinsStreamHandlers): () => void {
  let lastReceivedAt = Date.now();
  // No real ConnectionState value here on purpose: it guarantees the first
  // setConnection("connecting") call below always fires onConnectionChange,
  // even though "connecting" is also the first real state.
  let connection: ConnectionState | null = null;

  // Dedupe: only notify when the logical state actually changes. This is
  // what makes a flapping socket safe — repeated onerror/onopen cycles that
  // don't change the logical state don't trigger repeated side effects.
  const setConnection = (next: ConnectionState) => {
    if (connection !== next) {
      connection = next;
      onConnectionChange(next);
    }
  };

  setConnection("connecting");

  const es = new EventSource("/api/events");

  es.addEventListener("coins", (event) => {
    const messageEvent = event as MessageEvent<string>;
    try {
      const data = JSON.parse(messageEvent.data) as CoinsResponse;
      lastReceivedAt = Date.now();
      onSnapshot(data);
      setConnection("connected");
    } catch (err) {
      console.warn("Failed to parse SSE coins payload", err);
    }
  });

  es.onopen = () => {
    setConnection("connected");
  };
  es.onerror = () => {
    setConnection("polling");
  };

  // Safety net: some failure modes (e.g. a dev-proxy that keeps the socket
  // "open" while upstream is dead) never fire onerror, so don't just trust
  // the socket state — trust the clock. If no snapshot has landed within
  // STALE_AFTER_MS, force the poll fallback regardless of reported state.
  const watchdog = setInterval(() => {
    if (Date.now() - lastReceivedAt > STALE_AFTER_MS) {
      setConnection("polling");
    }
  }, WATCHDOG_CHECK_MS);

  return () => {
    es.close();
    clearInterval(watchdog);
  };
}
