import { Router } from "express";
import { pingDatabase } from "../repositories/healthRepo.js";
import { computeFreshness } from "../services/freshness.js";

export const healthRouter = Router();

// Liveness: is the process up? No DB access — must stay cheap and never
// depend on anything that could itself be unhealthy, or a slow DB would take
// down liveness too and defeat the point of separating the probes.
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness: can this pod serve requests at all? Gated ONLY on DB
// reachability — a pod with a reachable DB can serve correctly even when the
// upstream data is stale or in an "error" state, because serving the graceful
// stale/error-state UI is itself correct behavior. Data quality therefore
// does NOT belong in readiness: gating on it would eject otherwise-healthy
// instances from the load balancer whenever CoinCap is slow or down. Data
// freshness is exposed separately at /freshness for monitoring/alerting.
healthRouter.get("/ready", async (_req, res) => {
  const dbUp = await pingDatabase();
  if (!dbUp) {
    res.status(503).json({ status: "unhealthy", checks: { database: "down" } });
    return;
  }

  res.json({ status: "ok", checks: { database: "up" } });
});

// Freshness: the data-currency signal for monitoring/alerting — a different
// consumer than the load balancer. This is a report, not a gate, so it
// returns 200 even when the status is "error"; an actual DB failure while
// computing freshness surfaces as a 500 via the errorHandler rather than a
// misleading 200.
healthRouter.get("/freshness", async (_req, res, next) => {
  try {
    const freshness = await computeFreshness();
    res.json({
      status: freshness.status,
      lastSuccessfulFetchAt: freshness.lastSuccessfulFetchAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});
