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
├── routes/     Route modules
├── lib/        Shared backend logic
├── types/      Zod schemas and shared API types
├── db/         Drizzle schema
└── cron/       Scheduled worker jobs
```

## Workspace Role

- Export `AppType` from the package root for typed Hono RPC clients.
- Export schema types through `@cadence/backend/types/*`.
- Keep this package runtime-safe for Cloudflare Workers.

## Related Docs

- [Workspace root](../../README.md)
- [Frontend app](../frontend/README.md)
- [Mobile app](../mobile/README.md)
