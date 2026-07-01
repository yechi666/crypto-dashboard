import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startRefreshLoop } from "./services/refreshLoop.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`);
});

// Start the shared upstream-refresh loop. The returned stop handle is unused
// here (the process runs until killed); wire it into graceful shutdown later.
startRefreshLoop();
