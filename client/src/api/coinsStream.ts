import { fetchCoins } from "./client";
import type { CoinsResponse } from "./types";
import { toErrorMessage } from "../utils/errors";

const POLL_MS = 15000;

export interface CoinsStreamHandlers {
  onSnapshot: (data: CoinsResponse) => void;
  onError: (message: string) => void;
}

/**
 * Subscribe to live coin snapshots: Server-Sent Events primary, REST polling
 * fallback if the SSE connection drops. Returns an unsubscribe function that
 * closes the stream and stops any polling. Framework-agnostic (no React).
 */
export function subscribeToCoins({ onSnapshot, onError }: CoinsStreamHandlers): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const stopPolling = () => {
    if (pollInterval !== null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const pollOnce = async () => {
    try {
      const data = await fetchCoins(signal);
      if (!signal.aborted) onSnapshot(data);
    } catch (err) {
      if (signal.aborted) return;
      onError(toErrorMessage(err));
    }
  };

  const startPolling = () => {
    if (pollInterval !== null) return; // already polling
    void pollOnce(); // immediate fetch so the user isn't stuck waiting for the interval
    pollInterval = setInterval(() => {
      void pollOnce();
    }, POLL_MS);
  };

  const es = new EventSource("/api/events");

  es.addEventListener("coins", (event) => {
    const messageEvent = event as MessageEvent<string>;
    try {
      const data = JSON.parse(messageEvent.data) as CoinsResponse;
      if (!signal.aborted) onSnapshot(data);
    } catch (err) {
      console.warn("Failed to parse SSE coins payload", err);
    }
  });

  es.onopen = () => {
    stopPolling(); // SSE healthy again; its pushes resume
  };
  es.onerror = () => {
    startPolling(); // connection down; fall back to polling
  };

  return () => {
    controller.abort();
    es.close();
    stopPolling();
  };
}
