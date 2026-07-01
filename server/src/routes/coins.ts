import { Router } from "express";
import { env } from "../config/env.js";
import { toCoinDto, toHistoryPointDto } from "../dto/coin.js";
import type { CoinHistoryResponse } from "../dto/coin.js";
import { getCoinById, getCoinHistory } from "../services/coinRepo.js";
import { getCoinsSnapshot } from "../services/coinsSnapshot.js";
import { resolveHistorySince } from "../utils/history.js";

export const coinsRouter = Router();

coinsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getCoinsSnapshot());
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
