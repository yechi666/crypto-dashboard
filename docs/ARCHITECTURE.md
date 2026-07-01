# Architecture

This document records the design decisions for the Crypto Market Dashboard and
the reasoning behind them. It's the answer to "be ready to justify it" from the
assessment brief. Everything described here is implemented — the poll loop,
backfill, SSE + REST, freshness derivation, and dashboard/detail UI all exist
in `server/src` and `client/src` as described below.

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
available as the faster local-development inner loop.

## Known limitations / future work

These are deliberate omissions, not things that were forgotten:

- **No market-cap history.** `PriceHistory` stores `price` (and optionally
  `volume24h`); it does not snapshot `marketCap` over time, so the detail
  view can't chart market-cap trends, only price.
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
