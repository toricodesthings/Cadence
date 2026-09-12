# Cadence Backend

The backend is Cadence's API server. It stores every task, habit, project, and note, and it is the **one** source of truth that the web app, the desktop app, and (in the future) mobile all talk to — none of them are allowed to invent their own rules for what a "task" is.

## In plain terms

- It runs as a **Cloudflare Worker** — a small, fast script Cloudflare runs close to the user, instead of a traditional always-on server.
- It's built with **Hono**, a lightweight web framework (think Express, but built for Workers).
- Data lives in **Neon Postgres**, a normal Postgres database, reached through **Hyperdrive** (Cloudflare's connection pooler, since Workers can't hold long-lived database connections themselves).
- Every request is checked twice: once by **Zod** (is this data shaped correctly?) and once by **Postgres Row-Level Security** (does this user actually own this row?). Both checks are mandatory — see [AGENTS.md](./AGENTS.md) for the full rules.
- Sign-in is handled by **Neon Auth**. The backend never sees a password — only a signed JWT it verifies on every request.

## Stack

- Cloudflare Workers + Wrangler
- Hono v4
- Drizzle ORM
- Neon Postgres via Hyperdrive
- Zod v4 validation
- Vercel AI SDK (`ai`, `@ai-sdk/openai`) for the AI assistant
- Shared logic from [`@cadence/contracts`](../../packages/contracts) (request/response shapes) and [`@cadence/domain`](../../packages/domain) (pure business logic)

## Commands

Run from the repository root:

```bash
pnpm dev:backend
pnpm --filter @cadence/backend typecheck
pnpm --filter @cadence/backend check          # typecheck + full test suite
pnpm --filter @cadence/backend test           # all tests
pnpm --filter @cadence/backend cf-typegen
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm deploy:backend
```

Or run them from this directory with `pnpm <script>`.

## Structure

```text
src/
├── index.ts        Worker entry point, middleware chain, route mounting, AppType export
├── platform/       Cross-cutting infrastructure (auth, db, rls, errors, idempotency, metrics, logging, redis)
├── domains/        Product capabilities — one folder per domain
│   ├── tasks/      tasks.route.ts, tasks.schema.ts, task-filters.ts, task-normalization.ts, ...
│   ├── habits/     habits.route.ts
│   ├── inbox/      inbox.route.ts (items + sections)
│   ├── projects/   projects.route.ts
│   ├── tags/       tags.route.ts
│   ├── subtasks/   subtasks.route.ts
│   ├── sections/   sections.route.ts
│   ├── settings/   settings.route.ts, settings-defaults.ts
│   ├── notes/      notes.route.ts
│   ├── events/     events.route.ts, events.schema.ts
│   ├── suggestions/ suggestions.route.ts, suggestions.schema.ts
│   ├── health/     health.route.ts
│   ├── proxy/      proxy.route.ts (proxied external API calls, e.g. geolocation/holidays)
│   ├── ai/         ai.route.ts, agent.ts, tools/ — the AI assistant's chat endpoint and tool calls
│   └── debug/      debug.route.ts, debug-seed.ts, scenarios/ (dev-only fixture data)
├── db/             Drizzle schema (tables, enums, indexes, RLS policies, relations)
├── cron/           Scheduled worker jobs (overdue check, mutation dedup pruning)
└── types/          Worker environment bindings (Env)
```

Most of what a route actually validates or returns lives one level up, in the shared packages:

- **[`@cadence/contracts`](../../packages/contracts)** — the Zod schemas that define every request/response shape. A domain's `*.schema.ts` file only exists when the backend needs extra server-only validation on top of the shared contract.
- **[`@cadence/domain`](../../packages/domain)** — pure logic (recurrence rules, ordering, AI conversation titling) with no database or HTTP dependency, shared between backend and frontend.

## Workspace Role

- Export `AppType` from the package root so the frontend gets a fully typed RPC client — no hand-written API types on either side.
- Keep this package runtime-safe for Cloudflare Workers (no Node-only APIs, no long-lived connections).
- Domain-first architecture: each domain owns its routes and domain-specific logic under `src/domains/`.
- Platform layer (`src/platform/`) holds only cross-cutting infrastructure — no domain logic.
- All routes are versioned under `/api/v1/` and use bearer JWT authentication.
- RLS (`withRls`) is mandatory for all user-scoped queries.
- Zod validation (`apiValidator`) is mandatory for all params, query, and JSON body inputs.
- Debug routes are disabled by default and only available when explicitly enabled in non-production environments.

## Operational Notes

### Deployment Model

Production deploys to Cloudflare Workers happen via direct pushes to `main`. There is no CI gate that blocks deployment — GitHub Actions verify (typecheck, tests, deploy dry-run) runs **after** push and serves as a post-deploy health signal, not a preventative release gate.

This means:
- All verification must pass **locally** before pushing to `main`.
- A failing post-push check indicates a rollback may be needed.
- `wrangler deploy --minify` is the deploy command (aliased as `pnpm deploy:backend`).

### Environment Configuration

- Set `NEON_AUTH_JWKS_URL` in Worker secrets for the production Neon Auth branch.
- Keep debug capabilities off in production unless there is an intentional operational reason to enable them (`ENABLE_DEBUG_ROUTES` must be explicitly set to `"true"`).

### Pre-Push Checklist

Before pushing to `main`, verify locally:
1. `pnpm --filter @cadence/backend test:unit` — all contract and unit tests pass
2. `pnpm --filter @cadence/backend typecheck` — no type errors
3. `wrangler deploy --dry-run --minify` — deploy bundle builds successfully

### Schema Changes

- Update the Drizzle schema first (`src/db/schema.ts`)
- Generate a numbered SQL migration (`pnpm db:generate`)
- Update the matching row schema in `@cadence/contracts` — a compile-time test fails until the two stay in sync

## Related Docs

- [Workspace root](../../README.md)
- [Frontend app](../frontend/README.md)
- [Desktop app](../desktop/README.md)
- [Shared packages](../../packages/README.md)
- [Full contributor rules](./AGENTS.md)
- [Changelog](../../CHANGELOG.md)
