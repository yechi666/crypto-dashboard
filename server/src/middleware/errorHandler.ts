import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

// Generic last-resort error handler. Route-specific error shaping (e.g.
// upstream-vs-client errors) belongs in the routes/services that throw.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, path: req.path }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
}
