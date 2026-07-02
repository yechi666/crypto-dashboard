import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { coinsRouter } from "./routes/coins.js";
import { eventsRouter } from "./routes/events.js";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.use("/api/health", healthRouter);

  app.use("/api/coins", coinsRouter);
  app.use("/api/events", eventsRouter);

  app.use(errorHandler);

  return app;
}
