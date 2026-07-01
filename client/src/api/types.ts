export type FreshnessStatus = "live" | "stale" | "error";

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

export interface HistoryPointDto {
  price: string;
  recordedAt: string;
}

export interface CoinHistoryResponse {
  coin: CoinDto;
  points: HistoryPointDto[];
}
