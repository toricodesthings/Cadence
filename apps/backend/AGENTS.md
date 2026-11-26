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
- Another user's row is a 404 under RLS, except rows in a list shared with the caller (`cadence_member_lists`).
- A route touching a shared list, event or routine resolves `listAccess`/`tasksByOwner`/`eventAccess`/`routineAccess` (`platform/list-access.ts`, plus `platform/owner-change.ts`), enforces the role and passes `ownerId` to services. Never relax a service's `user_id` filter. Check referenced ids with the `platform/ownership.ts` asserts.
- Shared writes call `noteAudience`; writes that return a row (or refetch hint) call `noteChange`.
- Personal data on a shared row goes in a `(row_id, user_id)` table, never a column on the row. `task_personal` holds members' reminders; tags are per person via `task_tags` RLS; `cadence_transfer_list` and `cadence_move_task_to_list` are the only paths that re-own rows. New shareable things get their own `<thing>_members` table on `share_role`, and a target column on `share_invites`. Live list presence (`ListPresence` DO) and shared note co-editing (`NoteCollab` DO via `y-partyserver`) live on per-resource Durable Objects and never wake Neon on idle.
- Every new create path calls `assertRowRoom`, and `assertStorageRoom` for long text (`platform/storage-ceiling.ts`).
- Every write that creates a row (creates, duplicate, process) honours `Idempotency-Key`: `checkIdempotency` → mutate → `recordMutation`. PATCH, PUT, DELETE and set-style action POSTs (resolve, link, reschedule, batch) are idempotent by nature and take no key. Usage telemetry is exempt.
- A replayed key returns the first result whatever the new body says; keys are per queued mutation, so a mismatch is a client bug.
- Creates that accept a client `id` insert through `insertWithClientId`.

**Migrations**
1. Edit the schema.
2. `pnpm db:generate` → `db:check` → `db:migrate`.
3. `pnpm db:migrate:prod` before pushing. The `pre-push` hook blocks a push while prod is behind.

- Never `drizzle-kit push`.
- Primary keys use `id()` (`db/schema/columns.ts`, UUIDv7). Never read time from an id; `created_at` is the record.
- Generated columns say `STORED` or `VIRTUAL` explicitly (PG18+ defaults to VIRTUAL, which can't be indexed).
- Tests run on PGlite (PostgreSQL 19), the same major as Neon.
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

Every change ships its tests in the same change. Test behaviour through public entry points, not internals.

- `tests/unit`: new or changed logic (validation, transforms, time math, branching). Pure, no HTTP or DB. Never mock the DB to unit-test a query.
- `tests/integration`: new or changed route, service or query. Real routes on PGlite, running as `api_worker` so RLS applies. Create users with `createUser()` and call routes with `apiAs()`. Only external services are faked.
- `tests/e2e`: one flow test per user-visible feature: the full user sequence through the API with the integration helpers. Happy path only; edge cases stay in unit/integration.
- `tests/security`: middleware chain and tenant-isolation scan. A new user-owned table goes in `USER_SCOPED_TABLES` (`tenant-isolation.static.test.ts`), and its routes get an integration test proving another user gets 404/empty, never data.
- `vitest.config.ts` has two projects: `fast` (`unit` + `security`, no PGlite) and `db` (`integration` + `e2e`). A test needing the DB goes in `integration`/`e2e`; never import `helpers/db` from `unit`/`security`. Timeouts are 5s (`fast`) / 15s (`db`), so a hang fails loudly.
- No real waits: fake `setTimeout` (`vi.useFakeTimers({ toFake: ["setTimeout"] })` + `runAllTimersAsync`) for backoff and delays. Tests use `beforeAll(startTestDb)`, which closes PGlite after the file.
- Schema and domain-rule tests belong in `packages/tests`.
- A new AI tool must be used in the debug seed's `ai-showcase-conversation.ts`, or `debug-seed.test.ts` fails.
- `tests/evals` spend real tokens and never run in `pnpm test` or CI. While iterating, run only affected scenarios. Run the full relevant suite once after the final prompt or tool change.

## Deploy

- Pushing to `main` deploys. CI runs afterwards.
- So `pnpm check` and `wrangler deploy --dry-run` must pass locally first.
