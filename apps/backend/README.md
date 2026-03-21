# Cadence Backend

The backend is a Hono API deployed to Cloudflare Workers. It is the contract source for the web and mobile clients, and its package exports are consumed inside the workspace as `@cadence/backend`.

## Stack

- Cloudflare Workers + Wrangler
- Hono v4
- Drizzle ORM
- Neon Postgres via Hyperdrive
- Zod validation

## Commands

Run from the repository root:

```bash
pnpm dev:backend
pnpm --filter @cadence/backend typecheck
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
├── platform/       Cross-cutting infrastructure (auth, db, rls, errors, idempotency, metrics, etc.)
├── domains/        Product capabilities — one folder per domain
│   ├── tasks/      tasks.route.ts, tasks.schema.ts, task-filters.ts, task-normalization.ts, ...
│   ├── habits/     habits.route.ts, habits.schema.ts
│   ├── inbox/      inbox.route.ts, inbox.schema.ts
│   ├── projects/   projects.route.ts, projects.schema.ts
│   ├── tags/       tags.route.ts, tags.schema.ts
│   ├── subtasks/   subtasks.route.ts, subtasks.schema.ts
│   ├── sections/   sections.route.ts, sections.schema.ts
│   ├── settings/   settings.route.ts, settings.schema.ts, settings-defaults.ts
│   ├── notes/      notes.route.ts, notes.schema.ts
│   ├── events/     events.route.ts, events.schema.ts
│   ├── suggestions/ suggestions.route.ts, suggestions.schema.ts
│   ├── health/     health.route.ts
│   ├── proxy/      proxy.route.ts, proxy.schema.ts
│   └── debug/      debug.route.ts, debug-seed.ts, scenarios/
├── db/             Drizzle schema (tables, enums, indexes, RLS policies, relations)
├── cron/           Scheduled worker jobs (overdue check, mutation dedup pruning)
└── types/          Worker environment bindings (Env)
```

## Workspace Role

- Export `AppType` from the package root for typed Hono RPC clients.
- Keep this package runtime-safe for Cloudflare Workers.
- Domain-first architecture: each domain owns its routes, schemas, and utilities under `src/domains/`.
- Platform layer (`src/platform/`) holds only cross-cutting infrastructure — no domain logic.
- All routes are versioned under `/api/v1/` and use bearer JWT authentication.
- RLS (`withRls`) is mandatory for all user-scoped queries.
- Zod validation (`apiValidator`) is mandatory for all params, query, and JSON body inputs.
- Debug routes are disabled by default and only available when explicitly enabled in non-production environments.

## Release Notes

- **Task interaction mode** — recurring tasks now persist `interactionMode`, including timetable-style passive recurring blocks used by the frontend schedule and task surfaces.
- **Migration normalization** — the Drizzle migration ledger was repaired so fresh databases and existing databases share the same reproducible migration chain without `push`/force workflows.
- **Security tightening** — debug routes are disabled by default in production and only become available when explicitly enabled through environment configuration.
- **Contract alignment** — task recurrence, section/project scoping, and settings flows were updated to match the release frontend behavior and typed RPC contracts.

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

- Update Drizzle schema first
- Generate a numbered SQL migration
- Confirm `pnpm --filter @cadence/backend db:generate` reports no drift after the migration is committed

## Related Docs

- [Workspace root](../../README.md)
- [Frontend app](../frontend/README.md)
- [Mobile app](../mobile/README.md)
