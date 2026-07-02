import { Router } from "express";
import { logger } from "../lib/logger.js";
import { getCoinsSnapshot } from "../services/coinsSnapshot.js";
import { addClient, isAtCapacity, sendTo } from "../services/sse.js";

export const eventsRouter = Router();

eventsRouter.get("/", async (_req, res, next) => {
  let headersSent = false;
  try {
    if (isAtCapacity()) {
      // Normal HTTP error response — headers not yet sent, so this is a
      // plain 503, not an SSE stream that opens and immediately closes.
      // The client's EventSource will auto-retry and fall back to REST
      // polling in the meantime.
      res.status(503).set("Retry-After", "30").json({ error: "server at SSE capacity, retry shortly" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    // flush headers so the client's EventSource 'open' fires promptly
    res.flushHeaders?.();
    headersSent = true;
    addClient(res);

    const snapshot = await getCoinsSnapshot();
    sendTo(res, "coins", snapshot); // initial push on connect
  } catch (err) {
    // Once headers are sent, a normal error response is no longer possible —
    // log it and leave the connection open; the client will get the next
    // broadcast from the poll loop instead.
    if (headersSent) {
      logger.error({ err }, "failed to send initial snapshot to sse client");
      return;
    }
    next(err);
  }
});
