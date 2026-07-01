import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { coinsRouter } from "./routes/coins.js";
import { eventsRouter } from "./routes/events.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/coins", coinsRouter);
  app.use("/api/events", eventsRouter);

  app.use(errorHandler);

  return app;
}
