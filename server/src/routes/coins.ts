import { Router } from "express";
import { toCoinDto } from "../dto/coin.js";
import type { CoinsResponse } from "../dto/coin.js";
import { getDisplayCoins } from "../services/coinRepo.js";
import { computeFreshness } from "../services/freshness.js";

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
