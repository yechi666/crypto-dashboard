import type { CoinsResponse, CoinHistoryResponse } from "./types";
import { getJson } from "../utils/http";

export function fetchCoins(signal?: AbortSignal): Promise<CoinsResponse> {
  return getJson<CoinsResponse>("/api/coins", signal);
}

export function fetchCoinHistory(
  id: string,
  minutes?: number,
  signal?: AbortSignal,
): Promise<CoinHistoryResponse> {
  const q = minutes ? `?minutes=${minutes}` : "";
  return getJson<CoinHistoryResponse>(`/api/coins/${encodeURIComponent(id)}/history${q}`, signal);
}
