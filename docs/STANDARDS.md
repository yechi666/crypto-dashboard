# Coding Standards

Conventions for this repo. Keep this file short and update it when a
convention changes — it's the source of truth, not tribal knowledge.

## General

- **TypeScript everywhere**, `strict: true`. Don't use `any`; if the shape is
  genuinely unknown, use `unknown` and narrow it.
- **No default exports** for anything except React components (Vite/React
  ecosystem convention); prefer named exports elsewhere for grep-ability.
- Run `npm run lint` and `npm run format` before committing. ESLint config is
  centralized at the repo root (`eslint.config.js`) and covers both
  workspaces — don't add per-workspace ESLint configs.
- Prettier owns formatting (`.prettierrc.json`); don't hand-format or fight it
  with inline overrides.

## Server (`server/`)

- ESM throughout (`"type": "module"`); relative imports use explicit `.js`
  extensions (required by `moduleResolution: NodeNext`), even though the
  source files are `.ts`.
- All environment variables are read through `src/config/env.ts` (Zod-parsed
  and defaulted there). Don't read `process.env` directly elsewhere — it
  defeats the validation and makes required config implicit.
- One shared `PrismaClient` instance (`src/lib/prisma.ts`). Don't instantiate
  `new PrismaClient()` elsewhere.
- Routes stay thin: parse/validate input, call a service, shape the response.
  Business logic (upstream calls, the refresh loop, cache/staleness
  calculations) belongs in `src/services/`, not in route handlers.
- Errors: throw; don't swallow. Let the global `errorHandler` middleware be
  the last line of defense — it should rarely fire if routes/services handle
  their own known failure modes explicitly.
- Logging via the shared `pino` logger (`src/lib/logger.ts`). No `console.log`
  in server code.

## Client (`client/`)

- Function components + hooks only. No class components.
- Co-locate a component's styles/tests next to the component, not in a
  parallel tree.
- Data fetching goes through a small typed client wrapper, not inline `fetch`
  calls scattered across components — keeps the "frontend never calls
  CoinGecko directly, only our API" rule enforceable by construction.
- Loading, empty, and error states are not optional — every data-driven view
  handles all three explicitly (see `docs/ARCHITECTURE.md` for the
  live/stale/error contract the API returns).

## Testing

- **Vitest** for both workspaces (chosen for one test runner/config shape
  across the stack instead of Jest+something-else).
- Server: `supertest` against the Express app for route-level tests; unit
  tests for services that touch the DB should use a real test database, not
  mocked Prisma calls — a mocked ORM tells you nothing about whether a query
  actually works.
- A test file lives next to (or in a `tests/`/`__tests__` dir near) the code
  it covers. Don't build a separate mirrored test tree.

## Commits

- Conventional, imperative subject lines (`fix: ...`, `feat: ...`,
  `docs: ...`, `chore: ...`). Explain *why* in the body when it's not obvious
  from the diff.
- Never commit `.env`, only `env.example` (see root README for why the
  example file doesn't use a leading dot in this repo).

## Secrets

- No secrets in the repo, ever — not in code, not in commit messages, not in
  test fixtures.
- New required config goes in `env.example` with a comment explaining what it
  is and, if it's a credential, a link to where to obtain a free one.
