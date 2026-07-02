import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { makeRateLimiter } from "./middleware/rateLimit.js";
import { coinsRouter } from "./routes/coins.js";
import { eventsRouter } from "./routes/events.js";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  // Exactly one proxy hop (the nginx reverse proxy in docker-compose) so
  // express-rate-limit keys off the real client IP via X-Forwarded-For
  // instead of treating all requests as coming from the single proxy IP.
  // Safe because ingress is fronted by our own nginx.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.use("/api/health", healthRouter);

  app.use(
    "/api/coins",
    makeRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX }),
    coinsRouter,
  );
  app.use("/api/events", eventsRouter);

  app.use(errorHandler);

  return app;
}
