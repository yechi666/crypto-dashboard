# Architecture

This document records the design decisions for the Crypto Market Dashboard and
the reasoning behind them. It's the answer to "be ready to justify it" from the
assessment brief. Nothing here is implemented yet — this is the plan the
boilerplate was built to support.

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
4. Prunes `PriceHistory` rows older than `HISTORY_RETENTION_HOURS`.
5. Writes a `FetchLog` row recording success/failure.

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

**Alternatives considered:**
- *Per-client polling of CoinCap* — rejected outright, violates "don't make
  a new external call for every user request."
- *WebSockets* — viable, but adds protocol complexity (handshake, ping/pong,
  reconnection logic) for a use case that's purely one-way. SSE gets the same
  outcome with less code.
- *Client polls the server only (no SSE)* — simpler, but adds up to one full
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
- **`PriceHistory`** — append-only time series, one row per coin per poll,
  pruned after `HISTORY_RETENTION_HOURS`. Backs the "last hour" detail view,
  read straight from Postgres, never from a fresh upstream call.
- **`FetchLog`** — one row per poll attempt. Exists specifically so
  staleness/error state is derived from real fetch history instead of
  inferred indirectly.

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

This repository is currently **boilerplate only**: project structure, tooling,
and the schema above are in place; the polling loop, SSE endpoint, REST
routes, and dashboard UI are not yet implemented (see the `TODO` markers in
`server/src/app.ts` and `server/src/index.ts`). Docker Compose provisions
Postgres (and Adminer for inspection) for local dev; containerizing the
Node/Vite processes themselves was left out to keep the boilerplate focused —
`npm run dev` is the documented path to run both.
