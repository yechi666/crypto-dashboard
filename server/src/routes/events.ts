import { Router } from "express";
import { logger } from "../lib/logger.js";
import { getCoinsSnapshot } from "../services/coinsSnapshot.js";
import { addClient, sendTo } from "../services/sse.js";

export const eventsRouter = Router();

eventsRouter.get("/", async (_req, res, next) => {
  let headersSent = false;
  try {
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
