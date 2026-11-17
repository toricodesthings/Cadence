# Cadence Backend — Agent Rules

One Cloudflare Worker API (Hono + Drizzle + Neon via Hyperdrive), shared by web, desktop and future clients.

- Platform-neutral: Bearer JWT only, no cookies or sessions.
- Edge-safe: no Node-only APIs, no long-lived connections.
- A broken route contract breaks every client. `AppType` in `src/index.ts` is what the frontend types against.
- Shared shapes and rules: `packages/AGENTS.md`.
- Domain guides: `src/domains/{tasks,habits,settings,push,proxy,account,mcp,decisions,ai,ai/memory,ai/tools}/AGENTS.md`.

## Structure

- Types come from `@cadence/contracts`. Never hand-write a type that mirrors a contract.
- Pure rules come from `@cadence/domain`. Its `DomainError` becomes an `AppError` at the boundary.
- Routers must be method-chained and mounted with `.route()` on the chained `apiApp`. Otherwise they silently drop out of `AppType`.
- Handler flow: validate (`apiValidator()`) → authorize → delegate → return `{ data }`.
- Other domains import only `{domain}.service.ts`, or a `PUBLIC` module listed in `scripts/check-domains.mjs`.
- `types/` holds declarations used in 2+ places. No re-export shims.
- Never pass a raw `tx` into pure logic. Pass data or a loader.

**UCURD order** in every route or DB file:
1. Utility helpers and types
2. Create (POST, including action routes)
3. Update (PATCH, PUT)
4. Read (GET)
5. Delete

Within each group, the primary resource comes before sub-resources.

## Database

- Call `getDbClient(c.env)` per request. Never a module-level singleton.
- User work runs inside `withRls(db, userId, fn)`.
- RLS policies compare against `rlsUserId`. Never inline `current_setting`.
- Never trust a `userId` sent by the client.
- Another user's row is a 404 under RLS. Check referenced ids with the `platform/ownership.ts` asserts.
- Every new create path calls `assertRowRoom`, and `assertStorageRoom` for long text (`platform/storage-ceiling.ts`).
- Writes honour `Idempotency-Key`: `checkIdempotency` → mutate → `recordMutation`.
- Creates that accept a client `id` insert through `insertWithClientId`.

**Migrations**
1. Edit the schema.
2. `pnpm db:generate` → `db:check` → `db:migrate`.
3. `pnpm db:migrate:prod` before pushing. The `pre-push` hook blocks a push while prod is behind.

- Never `drizzle-kit push`.
- Keep everything, checks included, in the schema files. Hand-write SQL only for data, extensions or grants.

## Background work

- Neon sleeps after 5 idle minutes. Nothing may wake Postgres more often than that, retries included.
- The only cron runs hourly and skips the database except at 06:00 UTC.
- Start work from the event that makes it due: a delayed queue message or a Durable Object alarm.

## Logging

- Never log 2xx/3xx responses.
- Never log raw user ids or emails. Use `hashIdentifier`.
- `event` is a stable snake_case token.
- HTTP failures are logged centrally. Don't add per-route failure logs.
- Pass failure details as `issues` (`issuesFromError`).

## Tests

- `tests/unit`: pure logic, no HTTP or DB.
- `tests/integration`: real routes on PGlite, running as `api_worker` so RLS applies. Create users with `createUser()` and call routes with `apiAs()`. Only external services are faked.
- `tests/security`: middleware chain and tenant-isolation scan.
- Schema and domain-rule tests belong in `packages/tests`.
- A new AI tool must be used in the debug seed's `ai-showcase-conversation.ts`, or `debug-seed.test.ts` fails.
- `tests/evals` spend real tokens and never run in `pnpm test` or CI. While iterating, run only affected scenarios. Run the full relevant suite once after the final prompt or tool change.

## Deploy

- Pushing to `main` deploys. CI runs afterwards.
- So `pnpm check` and `wrangler deploy --dry-run` must pass locally first.
