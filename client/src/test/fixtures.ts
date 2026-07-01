import type { CoinDto } from "../api/types";

export function makeCoin(overrides: Partial<CoinDto> = {}): CoinDto {
  return {
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
    ...overrides,
  };
}
