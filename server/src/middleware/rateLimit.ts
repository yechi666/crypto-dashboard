import rateLimit from "express-rate-limit";

/** Factory for a per-IP REST rate limiter. Relies on `trust proxy` being set
 * correctly in the app so requests are keyed off the real client IP. */
export function makeRateLimiter(opts: { windowMs: number; max: number }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
}
