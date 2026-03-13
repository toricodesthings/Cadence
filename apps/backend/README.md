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

## Related Docs

- [Workspace root](../../README.md)
- [Frontend app](../frontend/README.md)
- [Mobile app](../mobile/README.md)
