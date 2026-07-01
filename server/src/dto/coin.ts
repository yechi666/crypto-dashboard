import type { Coin, PriceHistory } from "@prisma/client";
import type { FreshnessStatus } from "../services/freshness.js";

export interface CoinDto {
  id: string;
  symbol: string;
  name: string;
  currentPrice: string;
  marketCap: string;
  marketCapRank: number | null;
  volume24h: string | null;
  priceChangePercentage24h: number | null;
  lastUpdatedUpstream: string;
  updatedAt: string;
}

export interface CoinsResponse {
  status: FreshnessStatus;
  lastSuccessfulFetchAt: string | null;
  coins: CoinDto[];
}

/** Map a Prisma Coin row to its wire representation — Decimal must not leak past this boundary. */
export function toCoinDto(coin: Coin): CoinDto {
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    currentPrice: coin.currentPrice.toString(),
    marketCap: coin.marketCap.toString(),
    marketCapRank: coin.marketCapRank,
    volume24h: coin.volume24h?.toString() ?? null,
    priceChangePercentage24h: coin.priceChangePercentage24h,
    lastUpdatedUpstream: coin.lastUpdatedUpstream.toISOString(),
    updatedAt: coin.updatedAt.toISOString(),
  };
}

export interface HistoryPointDto {
  price: string;
  recordedAt: string;
}

export interface CoinHistoryResponse {
  coin: CoinDto;
  points: HistoryPointDto[];
}

/** Map a Prisma PriceHistory row to its wire representation — Decimal must not leak past this boundary. */
export function toHistoryPointDto(row: PriceHistory): HistoryPointDto {
  return {
    price: row.price.toString(),
    recordedAt: row.recordedAt.toISOString(),
  };
}
