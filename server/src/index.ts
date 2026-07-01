import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { runStartupBackfill } from "./services/backfill.js";
import { startRefreshLoop } from "./services/refreshLoop.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`);
});

// Run the one-time startup backfill (best-effort, never throws), then start
// the shared upstream-refresh loop. The returned stop handle from
// startRefreshLoop is unused here (the process runs until killed); wire it
// into graceful shutdown later.
void (async () => {
  await runStartupBackfill();
  startRefreshLoop();
})();
