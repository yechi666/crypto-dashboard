import { Router } from "express";
import { env } from "../config/env.js";
import { toCoinDto, toHistoryPointDto } from "../dto/coin.js";
import type { CoinHistoryResponse, CoinsResponse } from "../dto/coin.js";
import { getCoinById, getCoinHistory, getDisplayCoins } from "../services/coinRepo.js";
import { computeFreshness } from "../services/freshness.js";
import { resolveHistorySince } from "../utils/history.js";

export const coinsRouter = Router();

coinsRouter.get("/", async (_req, res, next) => {
  try {
    const [coins, freshness] = await Promise.all([getDisplayCoins(), computeFreshness()]);

    const body: CoinsResponse = {
      status: freshness.status,
      lastSuccessfulFetchAt: freshness.lastSuccessfulFetchAt?.toISOString() ?? null,
      coins: coins.map(toCoinDto),
    };

    res.json(body);
  } catch (err) {
    next(err);
  }
});

coinsRouter.get("/:id/history", async (req, res, next) => {
  try {
    const coin = await getCoinById(req.params.id);
    if (!coin) {
      res.status(404).json({ error: "coin not found" });
      return;
    }

    const since = resolveHistorySince(req.query.minutes, env.HISTORY_RETENTION_HOURS * 60);

    const points = await getCoinHistory(coin.id, since);

    const body: CoinHistoryResponse = {
      coin: toCoinDto(coin),
      points: points.map(toHistoryPointDto),
    };

    res.json(body);
  } catch (err) {
    next(err);
  }
});
