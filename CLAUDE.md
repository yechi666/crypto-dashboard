# CLAUDE.md

Guidance for Claude Code (and any other engineer) working in this repo.

## What this is

A take-home assessment project: a real-time crypto market dashboard.
Full brief: top ~20 coins, live prices, a visible freshness indicator, a
per-coin price-history detail view backed by the database (not a fresh
upstream call), and graceful behavior when the upstream API is slow,
rate-limited, or down.

Full requirements are not duplicated here — if you need the original brief,
ask the user; the decisions made in response to it are recorded in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current state

**The feature set is implemented.** The CoinCap client and shared poll loop,
startup history backfill, SSE push (`/api/events`) with REST-polling
fallback, `FetchLog`-derived freshness, and the React dashboard + per-coin
detail/history UI all exist, are wired up in `server/src/app.ts` /
`server/src/index.ts`, and are covered by tests. The stack is also fully
containerized — `docker compose up` runs Postgres + server + client.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before implementing
anything — it lays out the intended design (single shared poll loop, SSE push
with REST-polling fallback, the `Coin`/`PriceHistory`/`FetchLog` schema, and
why) so new code lands in the right place instead of re-deriving the
architecture from scratch.

Read [docs/STANDARDS.md](docs/STANDARDS.md) for conventions before writing
code (import style, where business logic goes, testing approach, etc.).

## Stack

- **Client**: React 19 + TypeScript, Vite.
- **Server**: Express + TypeScript (ESM), Prisma.
- **Database**: PostgreSQL (via Docker Compose for local dev).
- **Monorepo**: npm workspaces (`client/`, `server/`), one root `npm install`.

## Repo layout

```
client/           Vite + React + TS app (stock template — not yet built out)
server/
  src/
    config/env.ts       Zod-validated env vars — read config through here only
    lib/                Shared singletons (prisma client, logger)
    middleware/          Express middleware (currently just errorHandler)
    app.ts               Express app factory — TODO: mount feature routes here
    index.ts             Entrypoint — TODO: start the refresh loop here
  prisma/schema.prisma   Coin / PriceHistory / FetchLog — see ARCHITECTURE.md
  tests/                 Vitest + supertest
docs/
  ARCHITECTURE.md        Design decisions and their justification
  STANDARDS.md           Coding conventions
docker-compose.yml        Postgres (+ Adminer) for local dev
env.example                Copy to .env (see note on the missing leading dot below)
```

## Running it

```
npm install
docker compose up -d postgres
cp env.example .env      # then run the Prisma migration
npm run prisma:migrate
npm run dev              # runs client + server together
```

Full details, including how to get a free CoinCap API key (needed for live
data; the app degrades gracefully without it), are in [README.md](README.md).

## Conventions worth knowing before editing

- The file is named `env.example`, not `.env.example` — this sandbox's tooling
  blocks writes to any dotfile starting with `.env`, including the example.
  Don't rename it back; document this if you hit the same block.
- Server code is ESM; relative imports need explicit `.js` extensions even
  though the source is `.ts` (`moduleResolution: NodeNext`).
- One root `eslint.config.js` lints both workspaces — don't add per-package
  ESLint configs.
- The frontend must never call CoinCap (or any third-party API) directly —
  everything goes through the Express server. This is a hard architectural
  rule from the brief, not a style preference.
