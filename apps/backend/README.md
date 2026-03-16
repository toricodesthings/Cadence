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
├── index.ts    Worker entry point and AppType export
├── routes/     Route modules (tasks, projects, inbox, tags, habits, settings, debug, etc.)
├── lib/        Shared backend logic (auth, DB, RLS, errors, metrics)
├── types/      Zod schemas and shared API types (including settings patch schema)
├── db/         Drizzle schema (user settings default includes full notification preferences)
└── cron/       Scheduled worker jobs (overdue task processing)
```

## Workspace Role

- Export `AppType` from the package root for typed Hono RPC clients.
- Export schema types through `@cadence/backend/types/*`.
- Keep this package runtime-safe for Cloudflare Workers.
- The settings PATCH schema keeps notification fields optional by design (partial merges).
- The debug seed route includes notification-triggering test data and unmanaged tasks for frontend testing.

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
