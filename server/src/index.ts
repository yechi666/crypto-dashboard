import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startBackgroundJobs, stopBackgroundJobs } from "./services/backgroundJobs.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`);
});

// Leader-elects (via a Postgres advisory lock) into running the one-time
// startup backfill + the shared upstream-refresh loop; other instances stay
// followers serving API reads only. See services/backgroundJobs.ts.
void startBackgroundJobs();

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, "shutting down");

  // Force-exit if graceful shutdown hangs (e.g. a stuck DB connection).
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  await stopBackgroundJobs();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
