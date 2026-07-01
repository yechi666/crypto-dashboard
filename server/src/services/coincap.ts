import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { parseIntOrNull, parseFloatOrNull, stringOrNull } from "../utils/parse.js";
import { joinPath } from "../utils/url.js";

export interface UpstreamCoin {
  id: string;
  symbol: string;
  name: string;
  currentPrice: string; // priceUsd — kept as string (Prisma Decimal ingests strings losslessly)
  marketCap: string; // marketCapUsd — string
  volume24h: string | null; // volumeUsd24Hr — string or null if absent/empty
  vwapUsd24h: string | null; // vwap24Hr — volume-weighted avg price over 24h
  priceChangePercentage24h: number | null; // changePercent24Hr parsed to number, null if absent
  marketCapRank: number | null; // rank parsed to int, null if absent/unparsable
}

export interface AssetsSnapshot {
  timestamp: Date;
  coins: UpstreamCoin[];
}

export interface HistoryPoint {
  price: string; // priceUsd (string)
  recordedAt: Date; // time (ms) -> Date
}

export type UpstreamErrorKind = "timeout" | "http" | "network" | "parse";

export class UpstreamError extends Error {
  constructor(
    public readonly kind: UpstreamErrorKind,
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "UpstreamError";
  }
}

// --- Raw response shapes (all numeric fields are JSON strings on CoinCap) ---

const rawAssetSchema = z.object({
  id: z.string(),
  rank: z.string().optional(),
  symbol: z.string(),
  name: z.string(),
  marketCapUsd: z.string(),
  volumeUsd24Hr: z.string().optional().nullable(),
  priceUsd: z.string(),
  changePercent24Hr: z.string().optional().nullable(),
  vwap24Hr: z.string().optional().nullable(),
});

const rawAssetsResponseSchema = z.object({
  timestamp: z.number(),
  data: z.array(rawAssetSchema),
});

const rawHistoryPointSchema = z.object({
  priceUsd: z.string(),
  time: z.number(),
  date: z.string().optional(),
  circulatingSupply: z.unknown().optional(),
});

const rawHistoryResponseSchema = z.object({
  data: z.array(rawHistoryPointSchema),
});

function mapAsset(raw: z.infer<typeof rawAssetSchema>): UpstreamCoin {
  return {
    id: raw.id,
    symbol: raw.symbol,
    name: raw.name,
    currentPrice: raw.priceUsd,
    marketCap: raw.marketCapUsd,
    volume24h: stringOrNull(raw.volumeUsd24Hr),
    vwapUsd24h: stringOrNull(raw.vwap24Hr),
    priceChangePercentage24h: parseFloatOrNull(raw.changePercent24Hr),
    marketCapRank: parseIntOrNull(raw.rank),
  };
}

function isAbortOrTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/** Perform a GET request against the CoinCap API, classifying failures into UpstreamError. */
async function upstreamFetch(url: URL): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.COINCAP_API_KEY}` },
      signal: AbortSignal.timeout(env.UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (isAbortOrTimeoutError(error)) {
      throw new UpstreamError(
        "timeout",
        `Request to CoinCap timed out: ${url.pathname}`,
        undefined,
        {
          cause: error,
        },
      );
    }
    throw new UpstreamError(
      "network",
      `Network error calling CoinCap: ${url.pathname}`,
      undefined,
      {
        cause: error,
      },
    );
  }

  if (!res.ok) {
    throw new UpstreamError(
      "http",
      `CoinCap responded with HTTP ${res.status} for ${url.pathname}`,
      res.status,
    );
  }

  try {
    return await res.json();
  } catch (error) {
    throw new UpstreamError(
      "parse",
      `Failed to parse JSON response from ${url.pathname}`,
      undefined,
      {
        cause: error,
      },
    );
  }
}

/**
 * Fetch the top `limit` assets by market cap rank from CoinCap.
 * Defaults to `env.TRACKED_COIN_COUNT` when no limit is given.
 */
export async function fetchAssets(limit: number = env.TRACKED_COIN_COUNT): Promise<AssetsSnapshot> {
  const url = new URL(joinPath(env.COINCAP_BASE_URL, "assets"));
  url.searchParams.set("limit", String(limit));

  const json = await upstreamFetch(url);

  const parsedResult = rawAssetsResponseSchema.safeParse(json);
  if (!parsedResult.success) {
    throw new UpstreamError("parse", "CoinCap assets response failed validation", undefined, {
      cause: parsedResult.error,
    });
  }

  logger.debug({ count: parsedResult.data.data.length }, "fetched CoinCap assets");

  return {
    timestamp: new Date(parsedResult.data.timestamp),
    coins: parsedResult.data.data.map(mapAsset),
  };
}

/** Fetch minute-interval price history for a single asset between startMs and endMs. */
export async function fetchHistory(
  id: string,
  startMs: number,
  endMs: number,
): Promise<HistoryPoint[]> {
  const url = new URL(joinPath(env.COINCAP_BASE_URL, `assets/${id}/history`));
  url.searchParams.set("interval", "m1");
  url.searchParams.set("start", String(startMs));
  url.searchParams.set("end", String(endMs));

  const json = await upstreamFetch(url);

  const parsedResult = rawHistoryResponseSchema.safeParse(json);
  if (!parsedResult.success) {
    throw new UpstreamError(
      "parse",
      `CoinCap history response failed validation for ${id}`,
      undefined,
      {
        cause: parsedResult.error,
      },
    );
  }

  logger.debug({ id, count: parsedResult.data.data.length }, "fetched CoinCap history");

  return parsedResult.data.data.map((point) => ({
    price: point.priceUsd,
    recordedAt: new Date(point.time),
  }));
}
