# Cadence Backend — Agent Instructions

Standalone Cloudflare Worker API (Hono v4 + Neon Postgres via Hyperdrive). Shared backend for web, desktop, and future mobile clients — must stay platform-neutral (no cookies/sessions), edge-safe (no Node-only APIs, no long-lived connections), schema-driven (Drizzle is truth), and parity-first (every endpoint usable by every client identically). Breaking a route contract breaks every client at once.

**Canonical shapes live upstream, not here.** [`@cadence/contracts`](../../packages/contracts) (Zod → inferred types) owns every request/response/entity shape. [`@cadence/domain`](../../packages/domain) owns pure business logic (throws `DomainError`, mapped to `AppError`). Read `packages/AGENTS.md` before touching either. No domain has a schema file: routes and services import every schema from its contract (filters and their `superRefine` included). **Never hand-write a type that mirrors a contract** — derive via `z.infer`/`.pick`/`.extend`.

## 1. Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Cloudflare Workers (`nodejs_compat`), placed next to Neon (`placement.region`: `aws:us-east-1`, dev `aws:us-east-2`; move it with the database) |
| HTTP | Hono v4 |
| Validation | Zod v4 (pinned via root `pnpm.overrides.zod` — one instance workspace-wide) + `@hono/zod-validator` wrapped by `apiValidator()` |
| ORM | Drizzle ORM (`drizzle-orm/postgres-js`) |
| DB | Neon Postgres via Cloudflare Hyperdrive |
| Auth | Neon Auth JWTs, verified via `jose` against JWKS |
| AI | Vercel AI SDK (`ai` v7); `@openrouter/ai-sdk-provider` for chat, titles and embeddings, plain HTTPS to OpenRouter's Decisions API for `domains/decisions`; Upstash Redis (`@upstash/redis/cloudflare`) for stream resumption |
| Scheduling | One hourly cron trigger that does work only at 06:00 UTC, a `ReminderClock` Durable Object per person (reminders and live-sync sockets), Queues with delays (memory's per-person work) |
| Recurrence | Shared day-based validation/expansion in `@cadence/domain/time`; pnpm-patched `rrule` bounds sparse searches, streaks expand history once |
| NLP | `@cadence/nlp` (workspace dep) |
| Lang | TypeScript 7 |

Zod v4 gotchas: no `.deepPartial()` (custom recursive version in `@cadence/contracts/settings`); introspect via `schema._zod.def.type`; `.unwrap()` for optional/nullable, `.element` for arrays.

## 2. Architecture

```text
src/
├── index.ts          # Worker entry, middleware chain, route mounting, AppType export
├── platform/         # Cross-cutting infra ONLY — no domain logic
│   ├── auth.ts       # Bearer JWT middleware + async user sync
│   ├── db.ts         # getDbClient(c.env) — per-request client
│   ├── rls.ts        # setRlsContext, withRls
│   ├── errors.ts     # AppError (code: contract `ErrorCode`, optional `issues`), sameVersion, createErrorBody (→ `ApiError`), throwIfNotFound, formatErrorResponse
│   ├── validation.ts # apiValidator() wrapper
│   ├── idempotency.ts, ownership.ts, metrics.ts, log.ts, request-log.ts, redis.ts, user-zone.ts, daily-budget.ts, storage-ceiling.ts
├── domains/           # tasks, habits, inbox, projects, tags, subtasks, sections, settings, notes, events,
│                       # push, health, proxy, account, ai, decisions, mcp, debug — one folder each
├── db/schema.ts       # Drizzle schema (SOURCE OF TRUTH): re-exports schema/{core,ai,ops}.ts; schema/columns.ts holds timestamptz + RLS helpers
├── cron/overdue-check.ts   # the daily run (06:00 UTC); reminders fire from domains/push/reminder-clock.ts
└── types/             # env.ts (Env bindings), db.ts (DbClient/Tx aliases), text-modules.d.ts (.md imports)
```

**Key Principles**
| Rule |
|---|
| Each domain folder owns its routes + domain-specific utilities. |
| `platform/` = shared behavior only. `types/` = shared *declarations* only (no behavior), reused by 2+ places. A type used once stays local. |
| A route handler validates → authorizes → delegates → shapes response. Non-trivial logic goes in a named helper or `{domain}.service.ts`. Another domain imports only that service (or a `PUBLIC` module in `scripts/check-domains.mjs`, run by `lint`). |
| No `helpers.ts`/`utils.ts`/`misc.ts` catch-alls anywhere. |
| Router MUST be method-chained (`new Hono().get().post()`) and mounted via `.route(...)` on the chained `apiApp` in `index.ts` — a non-chained router silently vanishes from `AppType`. |

**UCURD (non-negotiable, mechanical, not aesthetic):** every route/DB-touching file is ordered **U**tility → **C**reate → **U**pdate → **R**ead → **D**elete, by HTTP verb (`POST`=Create even for action routes like `/:id/reschedule`, `PATCH/PUT`=Update, `GET`=Read, `DELETE`=Delete). Utility helpers/type aliases sit at the top. Multi-resource files keep primary-resource-before-sub-resource within each verb group. A UCURD violation is a defect even if it works.

## 3. Adding Code

- **New feature in existing domain:** contract in `@cadence/contracts/{domain}` → route handler → Drizzle schema + matching `xRowSchema` if persistence changed → tests in `tests/unit/` or `tests/integration/`.
- **New domain:** author contract (`packages/contracts/src/{domain}.ts` + sub-path export) → `{domain}.route.ts` importing shapes directly from `@cadence/contracts/{domain}` (chained router) → mount in `src/index.ts` on the chained `apiApp` → Row-parity line in `tests/unit/contract-parity.test.ts` + schema tests in `packages/tests/contracts` + `tests/integration/{domain}.test.ts`. Read routes return the contract entity (narrow loose columns in one mapper, like `toTask`), and each gets a line in the frontend's `rpc-parity.test.ts`.
- **Every route:** `apiValidator()` → `getDbClient` + `withRls` → ownership checks → idempotency on writes → `{ data }` envelope → tests → `pnpm check`.

## 4. Request Lifecycle

`createRequestContext` (request ID) → `secureHeaders()` → body size limit (100KB, `/api/v1/*`; the two photo uploads, background and chat image, are exempt and capped on their own routes) → CORS allowlist (desktop; the web app arrives same-origin through the frontend Worker's `BACKEND` service binding, headers untouched) → debug-route guard (404 in production, or unless `ENABLE_DEBUG_ROUTES=true`) → Tier-1 IP rate limit (pre-auth) → JWT auth (`userId` attached) → Tier-2 user rate limit (read/write) → Tier-3 admin rate limit (`/api/v1/debug/*`) → `apiValidator()` → handler: `getDbClient(c.env)` → `withRls(db, userId, fn)` → `{ data: ... }`.

`/api/v1/live` (the live-sync WebSocket) is also dispatched before the Hono app, by `connectLive`. The MCP origin is a separate boundary, dispatched in the Worker's `fetch` before the Hono app (`isMcpRequest`: the `MCP_ORIGIN` host and `/mcp`, `/authorize`, `/oauth/*`, `/.well-known/oauth-*`): Tier-1 IP limit (plus per-IP `RATE_LIMITER_ADMIN` on `/oauth/register` and `/authorize`; `/favicon.ico` redirects to the app's) → `@cloudflare/workers-oauth-provider` (discovery, DCR/CIMD, token, revocation, bearer check on `/mcp`) → `serveMcp`. No app JWT, CORS or `{ data }` envelope there.

Uncaught errors → `formatErrorResponse()`: extracts `AppError` code/message, attaches request ID, never leaks stack traces/SQL.

## 5. Database Rules

- **Timestamps:** every `timestamp with time zone` column is declared with the `timestamptz()` helper in `db/schema/columns.ts`, which reads values as strict ISO (`2026-03-09T12:00:00.000Z`). Never use drizzle's `timestamp()` directly, or that column goes out as Postgres text. Integration tests fail on any non-ISO date-time in a response.
- **Per-request clients only.** `const db = getDbClient(c.env)`. Never a module-scope singleton — Hyperdrive pools connections, Workers don't hold them.
- **RLS is mandatory** for user-scoped work: `withRls(db, userId, async (tx) => { ... })`. Sets `request.jwt.claims` on the same connection as the queries; traces awaited transaction/context/work spans (async callbacks adopt Drizzle thenables) plus begin/commit timings, never SQL or identity. Policies compare against `rlsUserId` in `db/schema/columns.ts` (a `(select …)` Postgres evaluates once per query, not per row); never inline `current_setting` in a policy.
- **Storage ceilings** (`platform/storage-ceiling.ts`, Manifesto §8 abuse ceilings): every create counts its kind first (`assertRowRoom`: tasks 25,000, captures 10,000, conversations 2,000, routines/lists/tags 1,000) and a write carrying over 2,000 characters of description, note or capture text checks the account's descriptions + notes against 50 MB (`assertStorageRoom`); either answers 413 `STORAGE_FULL`. A new create path calls them.
- **Type aliases:** import `DbClient`/`Tx` from `src/types/db.ts` — never redefine `Parameters<Parameters<DbClient["transaction"]>[0]>[0]` inline.
- **Ownership:** `assertProjectOwnership`/`assertSectionOwnership`/`assertTagsOwnership`/`assertOwnership` in `platform/ownership.ts`. Another user's row is invisible under RLS (404); 403 only fires if RLS is bypassed. Task updates use an atomic version condition for simple edits; schedule, recurrence and placement edits lock/read first. Moving lists without a section clears the old section; explicit sections must belong to the effective list.
- **Migrations:** update the schema → `pnpm db:generate` → `pnpm db:check` → `pnpm db:migrate` (dev) → `pnpm db:migrate:prod` before pushing. Never `drizzle-kit push`. `drizzle.config.ts` reads `.dev.vars` (`DB_TARGET=prod` picks `PROD_MANAGEMENT_DATABASE_URL`); migrations output to `apps/backend/drizzle/`. Everything lives in the schema files (checks included) so drizzle's snapshot matches the database; hand-written SQL only for data or what drizzle can't express (extensions, grants). `0000_baseline` builds the whole schema (existing databases skip it: the migrator only applies entries newer than the last one recorded). A new database needs the `api_worker` login role (the Worker's Hyperdrive user) created first; then `pnpm db:migrate` builds everything, grants included.

## 6. API Conventions

- All app routes under `/api/v1/`. Auth is always `Authorization: Bearer <JWT>` — never cookies/sessions. Exceptions: the live socket (`/api/v1/live`, §13: a browser can't set headers on a WebSocket, so the JWT rides in `Sec-WebSocket-Protocol`) and the MCP origin (§9b): OAuth/MCP standards fix its paths, and its short-lived `__Host-` cookies only bind a consent flow to one browser.
- Success envelope: `{ "data": {...} }` everywhere, including health/debug. Errors: the contract `ApiError` (`{ "error": { code, message, status, isRetryable, requestId, issues? } }`) via `AppError`; codes come from `ERROR_CODES` in `@cadence/contracts/common`. Task responses always carry `tagIds` (`toTask`/`withTagIds` in `tasks.service.ts`).
- **Idempotency:** `Idempotency-Key` header — `getIdempotencyKey(c)` → `checkIdempotency(tx, userId, key)` (no-op if undefined; holds a transaction lock on the key so a concurrent retry waits, then sees the record) → mutate → `recordMutation(tx, userId, key)`. Supported on all POST endpoints in tasks/habits/inbox/projects/tags/subtasks/sections. Creates there also take an optional client-chosen `id` (clients send it as the key too, so offline replays are safe): insert through `insertWithClientId`, which turns an id another account holds into 409. Update schemas omit `id`.
- Read-heavy routes: `Cache-Control: private, max-age=0, stale-while-revalidate=5`. App responses expose `Server-Timing: app;dur=…`; `http.response` traces the same middleware/handler duration, excluding post-response `waitUntil` work included in invocation wall time. Auth and task writes/tags/background metrics have separate spans.

## 7. Mounted Routes

Public: `GET /health`. Protected (all `/api/v1/`):

| Domain | Mount | Notes |
|---|---|---|
| tasks | `/tasks` | CRUD, reorder, batch state/reschedule/delete, Trash, duplicate, tag links, `POST /place` (Fit today), `GET /batch` warm reads — see `src/domains/tasks/AGENTS.md` |
| projects, tags, sections | `/projects`, `/tags`, `/sections` | CRUD; tags list by `sort_order` (new ones last, a tag made without a colour gets a random palette one) |
| inbox | `/inbox` | items + sections CRUD; clarifying or kept reads, stable newest first; atomic process/complete + unprocess Undo; `PATCH` can't write `placed`, `processed` or `placedTaskId` and answers 409 for a status change on a placed capture; the app discards (restorable) and deletes only on request |
| subtasks, notes | `/tasks/:taskId/*` + standalone | nested under tasks, standalone PATCH/DELETE; versioned note edits — see `src/domains/tasks/AGENTS.md` |
| habits | `/habits` | CRUD, resolve (streaks, steps, set times), `/weekly` range view — see `src/domains/habits/AGENTS.md` |
| settings | `/settings`, `/settings/background` | GET + PATCH (deep-merge), background photo in R2 — see `src/domains/settings/AGENTS.md` |
| events | `/events` | single + batch usage tracking |
| push | `/push` | device registry, VAPID config, test push (503 `PUSH_UNAVAILABLE` without VAPID) — see `src/domains/push/AGENTS.md` |
| proxy | `/proxy` | weather, geocoding, approximate location, holidays — see `src/domains/proxy/AGENTS.md` |
| debug | `/debug` | clear + seed (non-prod only) |
| connections | `/connections` | connected assistants (MCP): list, Disconnect, consent-page routes — see `src/domains/mcp/AGENTS.md` |
| account | `/account` | `POST /delete`, `POST|GET /export` — see `src/domains/account/AGENTS.md` |
| ai | `/ai`, `/ai/images` | `/chat` (streamed), `/steps`, conversations, `/usage`, memory and decisions routes; `/ai/images` upload/report/get/delete — see `src/domains/ai/AGENTS.md` |

`AppType` (exported from `src/index.ts`) is the RPC contract the frontend types against — treat as a critical integration boundary.

## 8. Domain Model

`src/db/schema.ts` (and the `schema/` files it re-exports) is truth: **32 tables**, **17 pgEnums**. Groups: identity (`users`, `userMetrics`) · tasks ecosystem (`projects`, `taskSections`, `tasks`, `subtasks`, `tags`, `taskTags`, `taskMetrics`, `taskNotes`, `taskNlpMetadata`) · inbox (`inboxItems`, `inboxSections`) · habits (`habits`, `habitLogs`, `habitTags`) · intelligence (`aiMemories`, `aiMemorySignals`, `durationReports`, `planningRecords`, `aiMemoryNotes`, `usageEvents`, `savedFocusViews`, `notificationState`, `devices`, `pushDeliveries`) · AI assistant (`aiConversations`, `aiMessages`, `aiImages`) · connected assistants (`mcpConnections`) · infra (`mutationDedup`, `dataExports`).

## 9. AI Domain (`src/domains/ai`)

- **Assistant core** (chat route, agent and model routing, approvals, prompts and turn context, Cadence guide, images, time, Redis): [`src/domains/ai/AGENTS.md`](src/domains/ai/AGENTS.md).
- **Decisions (`src/domains/decisions`):** a decision model picks among app-supplied options (placement, effort guess, did-you-mean, Weekly Reset), never writes text. Rules in [`src/domains/decisions/AGENTS.md`](src/domains/decisions/AGENTS.md).
- **Memory (`domains/ai/memory`):** modes `off|basic|full` (null = Basic), facts in `ai_memories`, learning from idle chats, and a nightly pass. Rules in [`src/domains/ai/memory/AGENTS.md`](src/domains/ai/memory/AGENTS.md).
- `tools/` — one file per callable surface (tasks, projects, tags, habits, inbox, calendar, events, focus-views, metrics, help, plus `projections` and `drafts`); writes go through the domain services in one RLS transaction. Rules in [`src/domains/ai/tools/AGENTS.md`](src/domains/ai/tools/AGENTS.md).

## 9b. MCP (`src/domains/mcp`) — outside assistants

Outside assistants reach the app through an OAuth-protected MCP server (§4); tokens, per-call checks and the tool catalog are in [`src/domains/mcp/AGENTS.md`](src/domains/mcp/AGENTS.md).

## 10. Debug Seed System (`src/domains/debug/`)

`debug-seed.ts` (fixture builders) + `scenarios/index.ts` (re-exports `seed(db, userId)`) + `scenarios/active-power-user.ts` (which also seeds `ai-showcase-conversation.ts`: one AI thread firing every tool through the real services, with waiting, approved, declined and unanswered cards; add new tools there, `tests/integration/debug-seed.test.ts` fails otherwise). Routes: `POST /debug/clear` (wipes all user data, FK-safe order), `POST /debug/seed`, `GET /debug/capabilities`.

## 11. Tests

`tests/unit/` (pure logic, no HTTP, no DB) · `tests/integration/` (routes against a real Postgres: `tests/helpers/global-setup.ts` migrates PGlite once per run and snapshots it; `tests/helpers/db.ts` loads that snapshot per file and runs as `api_worker`, so RLS and the real grants apply; each test creates its own users via `createUser()` and calls routes with `apiAs()`; only external services are faked: HTTP upstreams, R2, Redis, and models via the `ai/test` mocks in `tests/helpers/ai.ts`, whose recorded calls show what the model was sent) · `tests/security/` (worker middleware chain + static tenant-isolation scan of `src/`). Schema and domain-rule tests live in `packages/tests`, not here. Commands in §15 (`pnpm test` = all of `tests/`, what CI runs; `pnpm check` = typecheck + all tests). `tests/evals/` spends real model tokens and never runs in `pnpm test` or CI. `pnpm eval` runs five assistant scenarios once; `eval:assistant`, `eval:memory` and `eval:decisions` run their suite once; `eval:full` restores the complete repeated behavior suite (assistant/memory up to three passes, decisions two). `eval:embeddings` separately runs dimension research. Separate TTL studies: `eval:cache` (23 calls), `eval:cache:matched` (36; three settings, rotating order), `eval:cache:resume` (3; set `AI_EVAL_CACHE_RESUME` to the prior probe UUID). They use synthetic data, disable tool execution and wait real 6/61-minute gaps. `eval:cache:report <matched UUID> <probe UUID>` reconciles read-only generation metadata and weights charges against root `output/evals/p3-production-gaps.json`, without model calls or automatic policy changes. Add `-t "<name>"` to target a regression, or `--list` to inspect selection without model calls. Evals use isolated synthetic users and unchanged configured models; credentials come from env or `.dev.vars`. Reports in root `output/evals/` record profile/repetitions, and assistant totals include cache warmup spend. Smoke/iteration results are partial validation. Synthetic memory seed embeddings are reused within one process; `eval:decisions` caches each answer by request in root `output/evals/decisions-cache.json` (only new or changed cases cost a call), asks every kind at threshold 0 and picks thresholds on a 70% split, confirmed on the held-out 30%; assistant turns pass `userTexts` and `answeredField` as the chat route does; actual recall/tool calls stay live. `EVAL_RUNS`, `MEMORY_EVAL_RUNS` and `DECISIONS_EVAL_RUNS` allow explicit positive repeat counts; smoke stays single-pass. Start with local tests, run only affected live scenarios while iterating, and run full relevant gates once after final prompt/tool changes; wiring/docs changes need no repeated paid sweep. Add scenarios for new chains.

## 12. Auth (`platform/auth.ts`)

Reads `Authorization: Bearer`, loads JWKS from `NEON_AUTH_JWKS_URL` (URL-keyed cache, retries transient failures), attaches `userId` from JWT `sub`, pins `EdDSA` (Neon Auth's signing algorithm), and before a write ensures the `users` row exists (once per user per isolate; an account deleted in the last hour, `markAccountDeleted` in Upstash, gets 401 instead of a recreated row; `POST /account/delete` is exempt, so a failed deletion can be retried). Never introduce cookies/sessions/non-JWT auth without explicit design sign-off (the MCP OAuth boundary in §9b is the one signed-off exception; it never accepts app JWTs, and app routes never accept its tokens).

## 13. Background Jobs

Nothing wakes Postgres on a short timer: Neon scales to zero after 5 idle minutes, and a minute poll kept it awake around the clock. A new background job must not either (never sooner than every 5 minutes, even when retrying); start work from the event that makes it due (a delayed queue message, a Durable Object alarm).

**Daily run** (`0 * * * *`, `runHourlyCron`, the only trigger): returns at once unless it is 06:00 UTC (no query, so Postgres sleeps). Then, as `api_worker` under RLS (`cron_user_ids`, SECURITY DEFINER, ids only; each user in `withRls`): `pruneStaleMutations`, `pruneAiImages` (unsent after a day, others 30 days after last use; storage before rows), `pruneUsageEvents` (past 90 days), `runMemoryJob` (the memory backstop) and `runMemoryNightly` (one `nightly` message for every person, each using their own zone's today, sent 25 a minute so chat `learn` messages don't queue behind them; with no queue, as many people as fit in 8 minutes, in a random order). One `cron_summary` line per run.

**Memory queue** (`MEMORY_QUEUE`): carries memory's `nightly`, `learn` and `scrub` messages; rules in [`src/domains/ai/memory/AGENTS.md`](src/domains/ai/memory/AGENTS.md).

**Reminders** (`domains/push`): a per-person `ReminderClock` Durable Object sends pushes and runs live-sync sockets; full rules in [`src/domains/push/AGENTS.md`](src/domains/push/AGENTS.md).

## 14. Environment & Bindings

| Binding | Purpose |
|---|---|
| `HYPERDRIVE` | → Neon Postgres |
| `NEON_AUTH_JWKS_URL` | JWT verification (plain var in `wrangler.jsonc`, not a secret) |
| `RATE_LIMITER` / `_READ` / `_WRITE` / `_ADMIN` | Tier 1/2/2/3 limiters; `_AI` (optional, 6/60s per person) stands in for assistant admission only while Upstash is unreachable and the fail mode is open |
| `USER_ASSETS` | Private R2 bucket for photo backgrounds and chat images (optional — absence answers 503 on upload). Deleting an account by hand also means deleting its `backgrounds/{userId}/` and `ai-images/{sha256(userId)}/` prefixes |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | AI stream resumption (optional — absence disables gracefully) |
| `AI_RL_*` / `AI_IMAGES_*` | AI budget caps (5h/7d requests + tokens, concurrency; tokens are metered at their price by `readMeteredTokens`: cache reads 0.1×, writes 1.25×; `AI_RL_IMAGES_24H` 20, `AI_IMAGES_PER_MESSAGE` 4, `AI_IMAGES_MAX_PENDING` 8), all optional |
| `AI_RATE_LIMIT_FAIL_MODE` | `open`/`closed` when Upstash errors at admission: default closed in production, open elsewhere. In production with no Upstash configured, `/ai/chat` and `/ai/steps` answer 503 rather than run unmetered |
| `AI_DAILY_SPEND_CAP_USD` | plain var, everyone's assistant spend per UTC day (default 10): `addDailySpend` (`platform/daily-budget.ts`) adds every logged `costUsd` (turns, titles, steps, decisions, embeddings, memory); at the cap admission answers 429 `AI_SPEND_CAPPED` until UTC midnight and logs `ai_spend_cap_reached` once; a Redis error fails open (the OpenRouter key's credit limit is the hard stop) |
| `MEMORY_QUEUE` | Queue (`cadence-memory`, dev `cadence-memory-dev`, each with a `-dlq` dead-letter queue) carrying memory's per-person `nightly`, delayed `learn` and `scrub` messages (optional — absence leaves the work to the cron's backstop) |
| `REMINDER_CLOCK` | Durable Object namespace for `ReminderClock` (also live sync; migration `v1`, inherited by `env.dev`; optional — absence sends no pushes) |
| `EMAIL` | Email Sending (`send_email`) for data exports (optional — absence answers 503 on `POST /account/export`; dev sends remotely) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push signing keys (base64url P-256 public point and private scalar; optional — absence turns push off and `/push/test` answers 503) and the `mailto:` contact (default the support address) |
| `OAUTH_KV` | MCP OAuth provider storage (optional — absence answers 503 on the MCP origin); nothing else |
| `MCP_ORIGIN` / `APP_ORIGIN` | MCP server origin (default `https://mcp.cadenceapp.cloud`, dev `http://localhost:8787`) and the web app hosting `/connect` (default the production dashboard) |
| `TOOL_APPROVAL_SECRET` | HMAC key for assistant tool approvals (required in production: `getAgentInstance` throws `AUTH_MISCONFIGURED` without it; unset = unsigned, dev only) |
| `DEPLOYMENT_STAGE` | plain var in `wrangler.jsonc` (`production`; `development` under `--env dev`); unset or unknown falls back to `production` |
| `ENABLE_DEBUG_ROUTES` | must be `"true"` to enable debug endpoints |

Dev secrets in `.dev.vars`. Prefer Worker bindings over ad hoc env reads.

## 15. Commands

```bash
pnpm dev | deploy | check | test | test:unit | test:integration | test:security | test:watch
pnpm typecheck | cf-typegen
pnpm db:generate | db:check | db:migrate | db:migrate:prod | db:check:prod | db:studio
```

**Deployment:** direct push to `main` deploys. GitHub Actions run *after* push (health signal, not a gate) — all verification must pass locally first. Pre-push: `test:unit`, `typecheck`, `wrangler deploy --dry-run --minify`. A local `.git/hooks/pre-push` runs `scripts/check-prod-migrations.mjs` (`db:check:prod`) on a push to `main` and blocks it while prod lacks a journal migration.

## 16. Logging (`platform/log.ts`)

Never call `console.*` directly — use `logger.<level>(source, event, fields)`. **Never log 2xx/3xx request successes** (Cloudflare records invocations); `/events/performance` emits validated frontend measurements after checking saved usage-diagnostics consent; `/events/errors` emits fixed error categories under saved crash-reports consent, without user identifiers or content. `event` is a stable low-cardinality discriminator (`upstream_failed`, not a sentence). Request/failure logs include `requestId` + `userHash` (`hashIdentifier(userId)`); anonymous frontend timings carry only `requestId`. Never log raw user IDs/emails. Levels: `error` (5xx, unhandled throws, dependency outages), `warn` (4xx, validation failures, best-effort write failures), `info` (`ai_turn`, the daily run's `cron_summary`, and consent-checked `frontend_startup` timings). Structured entries carry `origin: backend`; frontend measurements and errors carry `origin: frontend` with fixed phase/route/cache/platform/layout categories. HTTP failures are centralized (`logValidationFailure`, `app.onError`→`logErrorResponse`) — don't add ad hoc per-route failure logs on top of these; 401s and unmatched 404s aren't logged (the invocation log has them). Pass failures as `issues` (`issuesFromError`): `emit` flattens them to one string, because Workers Logs doesn't index arrays of objects.

## 17. Never

Platform-specific endpoints · trusting a client `userId` · re-export shims in `types/` · expanding the public AI surface without explicit scope · threading a raw `tx` into pure logic (inject data or a loader instead). Everything banned in §2, §5 and §6 stays banned. If this document conflicts with a proposed change, this document is the baseline.
