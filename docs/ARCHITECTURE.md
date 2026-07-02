# Architecture

This document records the design decisions for the Crypto Market Dashboard and
the reasoning behind them. It's the answer to "be ready to justify it" from the
assessment brief. Everything described here is implemented — the poll loop,
backfill, SSE + REST, freshness derivation, and dashboard/detail UI all exist
in `server/src` and `client/src` as described below.

_New here? [Questions you probably have](QUESTIONS.md) is the quick "why is
it built this way" FAQ; the sections below go deeper._

## Domain

**Crypto Market Dashboard** (the brief's recommended default): top ~20
cryptocurrencies by market cap, current price, 24h change, and a stored price
history per coin.

## External API

**[CoinCap](https://coincap.io) v3 — `rest.coincap.io/v3`.** Every request
requires an `Authorization: Bearer <COINCAP_API_KEY>` header; a free key is
available from the CoinCap dashboard at https://pro.coincap.io. The free tier
allows ~200 req/min, which trivially covers this app's ~2 req/min poll rate
(one shared call every 30s regardless of how many clients are connected).

A few CoinCap-specific quirks that shape the implementation:

- **All numeric fields are strings.** CoinCap serializes numbers like
  `priceUsd`, `marketCapUsd`, `volumeUsd24Hr`, and `changePercent24Hr` as
  JSON strings to avoid floating-point precision loss. This is why the schema
  uses `Decimal` rather than `Float` for those columns.
- **No logo/image URLs.** CoinCap's asset response includes no image field;
  the schema and UI omit coin images entirely.
- **No absolute 24h price change.** CoinCap provides only `changePercent24Hr`
  (a percentage string), not an absolute dollar delta. The schema and UI
  display the percentage only.
- **Response-level timestamp, not per-coin.** The API returns a top-level
  `timestamp` (ms epoch) representing when CoinCap produced the response;
  individual asset objects carry no `lastUpdated` field.

## Keeping data fresh: single shared poll loop + SSE, not per-request calls or WebSockets

**The server polls CoinCap on a fixed interval (`POLL_INTERVAL_MS`,
default 30s) regardless of how many clients are connected.** Every poll:

1. Fetches the top `TRACKED_COIN_COUNT` coins from CoinCap (`GET /assets?limit=<N>`).
2. Upserts each into the `Coin` table (last-known-good snapshot).
3. Inserts a `PriceHistory` row per coin (time series for the detail view).
4. Writes a `FetchLog` row recording success/failure.

This is the "single shared refresh loop" the brief asks for: rate-limit
exposure is constant no matter how many browser tabs are open, because the
upstream call happens on a timer, not on request.

**Tracked vs. displayed coins (`TRACKED_COIN_COUNT` vs. `COIN_COUNT`).** The
poll loop fetches and stores `TRACKED_COIN_COUNT` coins per cycle (default
100); the API and UI display only `COIN_COUNT` (default 20), applied as
`ORDER BY marketCapRank ASC LIMIT COIN_COUNT` at read time. The buffer exists
because a coin sitting near rank 20 would otherwise oscillate in and out of
the fetched set across polls, producing gappy `PriceHistory` and a stale
`Coin` row. Fetching 100 coins costs one slightly larger payload but is still
a single request, so the rate-limit math is unchanged.

**Startup history backfill.** On first boot, for any tracked coin that has no
`PriceHistory` rows yet, the server issues a one-time backfill using CoinCap's
`GET /assets/{id}/history?interval=m1&start=<ms>&end=<ms>` endpoint to seed
approximately the last hour of price points (one per minute, ~60 points).
History points carry only `priceUsd` and `time` — no volume — so only price
is stored. This is the **only** place the history endpoint is used; all
subsequent history reads go straight to Postgres. The rationale: the
detail/history view is required by the brief to read from the database, not
from a fresh upstream call — without a backfill, that view would be nearly
empty for the duration of a short demo run.

**The server pushes updates to clients over Server-Sent Events (SSE)** rather
than WebSockets:

- Data only flows server → client; there's no client → server real-time
  message to justify a bidirectional protocol.
- `EventSource` reconnects automatically on drop, which is exactly the
  behavior wanted when the network hiccups.
- It's plain HTTP — no extra ws infrastructure, easier to reason about behind
  proxies/load balancers.

**The client falls back to REST polling of `GET /api/coins`** if the SSE
connection can't be established or drops for longer than expected. This
double path (push when possible, pull as a fallback) is what makes "the user
must always be looking at the most up-to-date data available" hold even when
the live channel is unhealthy — the fallback still hits the server's cached
DB data, never CoinCap directly.

**Client-side staleness watchdog: the freshness badge trusts the clock, not
just the socket.** An `EventSource` can report itself as "open" while
silently delivering nothing — a proxy that buffers the response, a server
that stopped writing without closing the connection, etc. — so the client
doesn't treat "the SSE connection is open" as proof of freshness. Instead it
tracks the wall-clock time of the last snapshot it actually received; if
`VITE_STALE_AFTER_MS` elapses with no new snapshot, the client marks itself
stale and forces the REST polling fallback (`GET /api/coins`) regardless of
what the socket's readyState claims. This means the two failure modes — "the
server has no fresh data" (surfaced via the API's `live`/`stale`/`error`
status) and "the push channel stopped delivering" (surfaced via this
watchdog) — are detected independently, so a silently-stalled SSE connection
can't masquerade as a live dashboard.

**Alternatives considered:**

- _Per-client polling of CoinCap_ — rejected outright, violates "don't make
  a new external call for every user request."
- _WebSockets_ — viable, but adds protocol complexity (handshake, ping/pong,
  reconnection logic) for a use case that's purely one-way. SSE gets the same
  outcome with less code.
- _Client polls the server only (no SSE)_ — simpler, but adds up to one full
  poll interval of latency before a user sees new data, and doesn't
  demonstrate a push-based freshness strategy. Kept as the fallback, not the
  primary path.

## One poll loop across many replicas: leader election

The shared poll loop above assumes a _single_ writer. Run more than one server
instance — horizontal scaling, or a rolling deploy that briefly overlaps old
and new pods — and, naively, every instance would poll CoinCap and run the
startup backfill independently: duplicate `PriceHistory` rows and N× the
rate-limit burn.

To keep exactly one active writer, each instance tries to become the leader at
boot via a Postgres **session-level advisory lock** (`pg_try_advisory_lock`,
`lib/leaderLock.ts`):

- The instance that acquires the lock is the **leader**: it runs the startup
  backfill and the refresh loop (`services/backgroundJobs.ts`).
- Every other instance is a **follower**: it skips both and just serves API
  reads from the shared database.

Two details make this robust:

- **The lock is held on a dedicated, single-connection Prisma client.** A
  session advisory lock belongs to the exact connection that took it, but
  Prisma's normal pool hands queries to arbitrary connections — so a lock taken
  on the shared client could be silently dropped when that pooled connection
  recycles, producing two leaders. Pinning it to its own `connection_limit=1`
  client keeps the lock on one long-lived connection for the process's lifetime.
- **Failover is automatic, with no heartbeat.** Because the lock is
  session-scoped, Postgres releases it the moment the leader's connection closes
  (the process crashes, the pod is killed, the deploy rolls). The next follower
  to retry `pg_try_advisory_lock` then wins and takes over. On a graceful
  `SIGTERM`/`SIGINT` shutdown the leader also releases the lock explicitly
  (`releaseLeaderLock`) so a successor can pick up immediately instead of
  waiting on connection teardown.

A single instance (local dev, CI, a one-pod deploy) always wins the lock on the
first try, so this is transparent there — it only matters once more than one
instance runs.

## Handling upstream failure

Every poll's outcome is recorded in `FetchLog`. The API derives a `status` for
its responses from that log, not from guessing based on `Coin.updatedAt`
alone:

- `live` — most recent `FetchLog` succeeded within `STALE_AFTER_INTERVALS *
POLL_INTERVAL_MS`.
- `stale` — last success is older than that window (CoinCap slow or rate
  limiting us), but we still have last-known-good rows in `Coin` to serve.
- `error` — no successful fetch has ever completed, or failures have been
  continuous long enough that even `stale` data doesn't exist yet.

The server **never surfaces a 5xx to the client just because upstream is
down** — it serves whatever is in `Coin`/`PriceHistory` and lets the `status`
field tell the UI to show a staleness indicator instead of an error page.

**Graceful degrade when `COINCAP_API_KEY` is absent.** If the env var is
blank, the app boots normally; the poll loop simply fails on every cycle
(CoinCap returns a 401), records each failure in `FetchLog`, and the UI shows
the stale/error state described above. The process does not exit or crash.
This means a developer can start the server without a key and still exercise
the full UI error path, and it incidentally demonstrates the brief's
upstream-failure-handling requirement out of the box.

## Database schema (`server/prisma/schema.prisma`)

Three tables, chosen for exactly the two things the brief requires: serving
last-known-good data, and powering history.

- **`Coin`** — one row per coin, upserted every poll. This is the read model
  for the live dashboard and doubles as the last-known-good cache.
- **`PriceHistory`** — append-only time series, one row per coin per poll.
  Backs the "last hour" detail view, read straight from Postgres, never from
  a fresh upstream call.
- **`FetchLog`** — one row per poll attempt. Exists specifically so
  staleness/error state is derived from real fetch history instead of
  inferred indirectly.

**`FetchLog` status lifecycle.** Each poll cycle writes to `FetchLog` twice,
not once: a row is created with `status: PROCESSING` (and `startedAt`) at the
_start_ of the cycle, then updated to `SUCCEEDED` or `FAILED` (the
`FetchStatus` enum) with `finishedAt` set once the cycle completes. The
alternative — a single row written only at the end of a cycle — would be
simpler but would lose crash visibility: if the process dies mid-fetch (e.g.
an unhandled exception between the CoinCap call and the Postgres write),
nothing would ever record that the cycle happened at all. With the
two-phase write, a `FetchLog` row stuck in `PROCESSING` well past
`POLL_INTERVAL_MS` is itself a diagnostic signal — a cycle that started and
never finished — which is exactly the "graceful behavior when upstream is
slow, rate-limited, or down" the brief asks for, extended to cover the
poll loop crashing outright.

**Why relational/Postgres over a NoSQL store:** the data is naturally
tabular (fixed columns per coin), the access patterns are simple
range/lookup queries (`WHERE coinId = ? AND recordedAt > ?`), and Prisma's
migration workflow gives a clean, reviewable schema history — which matters
more here than horizontal write scale we don't need at 20 coins / 30s polls.

## Rate limits and caching

- One in-process interval owns all upstream calls; no route ever calls
  CoinCap directly.
- CoinCap's free tier allows ~200 req/min. At the default 30s poll interval
  the app issues ~2 req/min, leaving an enormous margin regardless of how many
  concurrent dashboard users are connected.
- On a 429 or network failure, the loop logs the failure to `FetchLog` and
  waits for the next tick — no retry storm against an already-struggling
  upstream.

The above covers the *upstream* (CoinCap) side. The server also protects its
own ingress from its own clients:

- A cap on concurrent SSE connections (`SSE_MAX_CLIENTS`) — once reached,
  `/api/events` responds `503` with `Retry-After` instead of opening a
  stream, and the client's `EventSource` falls back to REST polling.
- A per-IP rate limit on the REST API (`express-rate-limit`, mounted on
  `/api/coins` only), keyed off the real client IP via `trust proxy` set to
  the single nginx hop in front of the server.
- Health probes (`/api/health*`) and the SSE stream itself are deliberately
  not request-rate-limited — they're governed by the connection cap above
  instead.

## Stack choices

- **TypeScript** end to end (client + server) for a single type-safety story
  and shared discipline across the stack.
- **npm workspaces monorepo** (`client/`, `server/`) — one `npm install`, one
  place to run scripts from, no need for a separate package registry.
- **Express** — minimal, well understood, easy to justify every middleware
  added (helmet, cors, pino-http) rather than inheriting an opinionated
  framework's defaults.
- **Prisma** — type-safe queries and migrations without hand-writing SQL or a
  heavier ORM.
- **Vite + React** — fast dev loop; no meta-framework (Next/Remix) needed
  since there's no SSR/routing requirement here.

## Known scope boundary

The design above is fully implemented, not just planned: the poll loop
(`server/src/services/refreshLoop.ts`), startup history backfill
(`services/backfill.ts`), SSE push (`services/sse.ts`, `routes/events.ts`)
with REST-polling fallback (`routes/coins.ts`), `FetchLog`-derived freshness
(`services/freshness.ts`), and the React dashboard + per-coin history/detail
page (`client/src`) all exist and are covered by tests (`server/tests`,
`client/src/**/*.test.ts`).

**The app is fully containerized.** `docker compose up` starts three
services: Postgres, the Express server (built via `server/Dockerfile`,
running `prisma migrate deploy` then the compiled server), and an nginx
container (`client/Dockerfile`) that serves the built SPA and reverse-proxies
`/api` (and the `/api/events` SSE stream) to the server container. This is
the primary way to run the whole stack — see the README. `npm run dev`
(client + server as local processes against a Dockerized Postgres) remains
available as the faster local-development inner loop. The server exposes
three health endpoints: a liveness probe (`/api/health`, process-up only), a
readiness probe (`/api/health/ready`, DB reachable — used by the compose
healthcheck and by a k8s readiness probe / load balancer), and a freshness
report (`/api/health/freshness`, the data-currency signal for
monitoring/alerting). Readiness deliberately does NOT gate on data freshness:
a pod with a reachable DB can still serve the graceful stale/error-state UI
correctly, so a slow or failed upstream never ejects instances from the load
balancer.

## Known limitations / future work

These are deliberate omissions, not things that were forgotten:

- **Backfill and refresh run inside the app process, on startup.** Both were built to run in-process rather than as a dedicated job, which doesn't fit autoscaled multi-pod deployments cleanly (the backfill is mainly to enable the history page for easier testing of the app). The [advisory-lock leader election](#one-poll-loop-across-many-replicas-leader-election) mitigates the multi-instance case today — only one elected leader runs them — but properly separating the refresh into its own writer service (see next bullet) remains the real fix.
- **Simple Client-Server Architecture** with a lot of users wanting the same data a cache like `Redis` will give quicker answers and less traffic to the DB. Also the external API refresh logic could be in a separate micro service that won't affect the main Server - separation between write and read logic.
- **No multi-provider failover.** CoinCap is the only upstream source. If
  CoinCap itself has an extended outage, the app degrades to stale/error
  state (as designed) rather than failing over to a second provider (e.g.
  CoinGecko). Adding one would mean abstracting the provider interface
  beyond `services/coincap.ts` and reconciling schema differences (e.g.
  CoinGecko does provide absolute 24h price deltas and logo URLs, which
  CoinCap does not).
- **The server's runtime container image is not lean.** `server/Dockerfile`
  ships the full hoisted `node_modules` (including the Prisma CLI) into the
  runtime image rather than a pruned production-only `node_modules`, because
  the container's startup command runs `prisma migrate deploy` before
  starting the server, and that requires the Prisma CLI to be present at
  runtime. A leaner image would split migration and runtime into separate
  stages/images (or run migrations from a one-off job/init container instead
  of the app container's own entrypoint).
