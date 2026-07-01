# Crypto Market Dashboard

A live dashboard of the top ~20 cryptocurrencies (price, 24h change, market
cap) with a visible freshness indicator and a database-backed price-history
view. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design
decisions and their justification, and [CLAUDE.md](CLAUDE.md) for the current
state of the project.

> **Status:** this is the project boilerplate — tooling, structure, and the
> database schema are set up; the dashboard feature itself is not yet
> implemented.

## Stack

- **Client:** React + TypeScript + Vite
- **Server:** Express + TypeScript + Prisma
- **Database:** PostgreSQL
- **External API:** [CoinCap](https://coincap.io) v3 (`rest.coincap.io/v3`);
  free API key required (see below)

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres via Docker Compose)

## Setup

```bash
npm install

# Start Postgres (+ Adminer at http://localhost:8080 for browsing the DB)
docker compose up -d postgres

# Copy env vars. Note: the example file is named `env.example` (no leading
# dot) because this repo's tooling blocks writes to .env* files directly.
cp env.example .env

# Create the database tables from server/prisma/schema.prisma
npm run prisma:migrate

# Run client + server together (client on :5173, server on :4000)
npm run dev
```

Then open http://localhost:5173.

## Useful scripts (run from repo root)

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs client and server in parallel |
| `npm run build` | Type-checks and builds both workspaces |
| `npm test` | Runs server and client test suites |
| `npm run lint` | Lints both workspaces |
| `npm run format` | Formats the repo with Prettier |
| `npm run db:up` / `db:down` | Start/stop the Postgres container |
| `npm run prisma:migrate` | Apply Prisma migrations (dev) |
| `npm run prisma:studio` | Open Prisma Studio to browse the DB |

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
