# Cadence Backend

The API behind every Cadence app. It stores tasks, routines, lists and notes, and it is the one source of truth that the web and desktop apps share.

## How it works

- Runs as a **Cloudflare Worker** built with **Hono**.
- Data lives in **Neon Postgres**, reached through Cloudflare **Hyperdrive**, with **Drizzle** as the ORM.
- Sign-in is **Neon Auth**. The API never sees a password, only a signed token.
- Each request is checked twice: **Zod** validates its shape, and Postgres **row-level security** confirms the data belongs to you.
- The assistant uses the **Vercel AI SDK** through OpenRouter.
- Request and response shapes come from the shared [packages](../../packages/README.md), so the web app is fully typed against this API.

## Commands

From the repo root:

```bash
pnpm dev:backend        # local API on http://localhost:8787
pnpm db:generate        # create a migration from schema changes
pnpm db:migrate         # apply migrations to the dev database
pnpm db:studio          # browse the database
pnpm --filter @cadence/backend check   # types + tests
```

## Deploying

Pushing to `main` deploys to production; CI runs afterwards. Run the checks locally before you push.

## See also

[Workspace](../../README.md) · [Frontend](../frontend/README.md) · [Desktop](../desktop/README.md) · [Changelog](../../CHANGELOG.md)
