import type { CoinsResponse } from "../dto/coin.js";
import { toCoinDto } from "../dto/coin.js";
import { getDisplayCoins } from "../repositories/coinRepo.js";
import { computeFreshness } from "./freshness.js";

/**
 * The single source of the "current state of the dashboard" snapshot —
 * shared by GET /api/coins and the SSE `coins` event so both surfaces are
 * always built from the same data and shaping logic.
 */
export async function getCoinsSnapshot(): Promise<CoinsResponse> {
  const [coins, freshness] = await Promise.all([getDisplayCoins(), computeFreshness()]);
  return {
    status: freshness.status,
    lastSuccessfulFetchAt: freshness.lastSuccessfulFetchAt?.toISOString() ?? null,
    coins: coins.map(toCoinDto),
  };
}
