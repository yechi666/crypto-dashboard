# Crypto Market Dashboard

A live dashboard of the top ~20 cryptocurrencies (price, 24h change, market
cap) with a visible freshness indicator and a database-backed price-history
view. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design
decisions and their justification, and [CLAUDE.md](CLAUDE.md) for the current
state of the project.

_The live dashboard, showing top-20 coin prices alongside the freshness badge._

## Stack

- **Client:** React + TypeScript + Vite
- **Server:** Express + TypeScript + Prisma
- **Database:** PostgreSQL
- **External API:** [CoinCap](https://coincap.io) v3 (`rest.coincap.io/v3`);
  free API key required (see below)

## Prerequisites

- **Docker Desktop** — the primary path below runs the whole stack (Postgres +
  server + client) with one command.
- **Node.js 20+** — only needed for the "Local development" path.
- **CoinCap Token** — go to [CoinCap Dashboard](https://pro.coincap.io/dashboard), sign in for free and create an API Key.

## Running it (Docker, primary path)

```bash
# Copy env vars. Note: the example file is named `env.example` (no leading
# dot) because this repo's tooling blocks writes to .env* files directly.
cp env.example .env

# Add your CoinCap API key to .env (see "Environment variables" below).
# Compose reads COINCAP_API_KEY from .env automatically. The app degrades
# gracefully (stale/error UI) if you skip this — see docs/ARCHITECTURE.md.

docker compose up
```

Then open:

- **http://localhost:8080** — the dashboard (nginx serving the built SPA,
  reverse-proxying `/api` to the server)
- **http://localhost:8081** — Adminer, for browsing the Postgres database
- **http://localhost:4000** — the server API directly (health check, REST
  routes, `/api/events` SSE stream)

## Local development

For a faster inner loop (hot reload on both client and server) without
rebuilding Docker images on every change:

```bash
npm install

# Start only Postgres (+ Adminer) in Docker
docker compose up -d postgres

cp env.example .env
npm run prisma:migrate

# Runs client + server together (client on :5173, server on :4000)
npm run dev
```

Then open http://localhost:5173.

## Trying the failure modes

The app is built to degrade gracefully rather than crash. A few ways to see
that in practice:

- **No API key → the app degrades instead of crashing.** Leave
  `COINCAP_API_KEY` blank in `.env` (or set it to an invalid value) and start
  the app. It boots normally, but every poll cycle fails (CoinCap returns
  401), each failure is recorded, and the dashboard's freshness badge shows an
  `Offline`/error state while still serving whatever last-known-good data is
  in the database (empty on a truly fresh DB). Nothing crashes. See "Handling
  upstream failure" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the
  reasoning.

- **Kill the server with the dashboard open → the client notices.** With the
  dashboard open in the browser, stop the server process (Ctrl-C, or
  `docker compose stop server`). The SSE stream drops; within a few seconds
  the client's staleness watchdog flips the badge to `Stale`/reconnecting and
  the client falls back to REST polling, retrying until the server returns.
  This shows the client trusts the clock, not just the socket. See
  "Client-side staleness watchdog" in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Ingress protection (optional to trigger).** The server also guards
  itself: rapid repeated requests to `GET /api/coins` beyond the configured
  per-IP limit return `429`, and once the SSE connection cap
  (`SSE_MAX_CLIENTS`) is reached new `/api/events` connections get `503` +
  `Retry-After` (the browser then falls back to polling). See the env vars in
  [`env.example`](env.example).

## Useful scripts (run from repo root)

| Command                     | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `npm run dev`               | Runs client and server in parallel (local dev)                      |
| `npm run build`             | Builds both workspaces                                              |
| `npm run typecheck`         | Typechecks both workspaces, including tests                         |
| `npm test`                  | Runs server and client test suites (typechecks first via `pretest`) |
| `npm run lint`              | Lints both workspaces                                               |
| `npm run format`            | Formats the repo with Prettier                                      |
| `npm run db:up` / `db:down` | Start/stop the Postgres container                                   |
| `npm run prisma:migrate`    | Apply Prisma migrations (dev)                                       |
| `npm run prisma:studio`     | Open Prisma Studio to browse the DB                                 |

## Environment variables

See [`env.example`](env.example) for the full list with explanations. The
notable one:

- `COINCAP_API_KEY` — a Bearer token sent on every request to CoinCap v3.
  Get a free key at https://pro.coincap.io (the CoinCap dashboard) and set it
  in `.env`. Without it the app still boots, but the poll loop will fail every
  cycle and the UI will show a stale/error state instead of live data. **Never
  commit `.env`** — only `env.example` is tracked.

## Project structure

```
client/     React + Vite frontend
server/     Express + Prisma backend
docs/       Architecture decisions and coding standards
```
