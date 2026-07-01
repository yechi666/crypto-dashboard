import type { Response } from "express";
import { logger } from "../lib/logger.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

const clients = new Set<Response>();
let heartbeat: NodeJS.Timeout | null = null;

function startHeartbeatIfNeeded(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const client of clients) {
      writeFrame(client, ": ping\n\n");
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
}

function stopHeartbeatIfIdle(): void {
  if (clients.size > 0) return;
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

function writeFrame(res: Response, frame: string): void {
  try {
    res.write(frame);
  } catch (error) {
    logger.debug({ err: error }, "sse write failed; dropping client");
    removeClient(res);
  }
}

/** Register a newly-connected SSE client. Caller is responsible for writing SSE response headers first. */
export function addClient(res: Response): void {
  clients.add(res);
  res.on("close", () => removeClient(res));
  startHeartbeatIfNeeded();
  logger.debug({ clientCount: clients.size }, "sse client connected");
}

/** Remove a client (on disconnect or dead-socket write failure) and stop the heartbeat if no clients remain. */
export function removeClient(res: Response): void {
  const existed = clients.delete(res);
  if (existed) {
    logger.debug({ clientCount: clients.size }, "sse client disconnected");
  }
  stopHeartbeatIfIdle();
}

/** Push a named event with a JSON payload to every connected client. */
export function broadcast(event: string, payload: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    writeFrame(client, frame);
  }
}

/** Push a named event with a JSON payload to a single client (used for the initial on-connect snapshot). */
export function sendTo(res: Response, event: string, payload: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  writeFrame(res, frame);
}

/** Number of currently-connected SSE clients — for tests. */
export function clientCount(): number {
  return clients.size;
}
