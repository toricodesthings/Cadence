# Cadence Backend — Agent Instructions

Standalone Cloudflare Worker API (Hono v4 + Neon Postgres via Hyperdrive). Shared backend for web, desktop, and future mobile clients — must stay platform-neutral (no cookies/sessions), edge-safe (no Node-only APIs, no long-lived connections), schema-driven (Drizzle is truth), and parity-first (every endpoint usable by every client identically). Breaking a route contract breaks every client at once.

**Canonical shapes live upstream, not here.** [`@cadence/contracts`](../../packages/contracts) (Zod → inferred types) owns every request/response/entity shape. [`@cadence/domain`](../../packages/domain) owns pure business logic (throws `DomainError`, mapped to `AppError`). Read `packages/AGENTS.md` before touching either. A domain's `domains/*/*.schema.ts` holds **only** server-only refinement (query coercion, cross-field `superRefine`) and re-exports the contract — most domains have **no schema file** at all. **Never hand-write a type that mirrors a contract** — derive via `z.infer`/`.pick`/`.extend`.

## 1. Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| HTTP | Hono v4 |
| Validation | Zod v4 (pinned via root `pnpm.overrides.zod` — one instance workspace-wide) + `@hono/zod-validator` wrapped by `apiValidator()` |
| ORM | Drizzle ORM (`drizzle-orm/postgres-js`) |
| DB | Neon Postgres via Cloudflare Hyperdrive |
| Auth | Neon Auth JWTs, verified via `jose` against JWKS |
| AI | Vercel AI SDK (`ai` v7) + `@ai-sdk/openai`; Upstash Redis (`@upstash/redis/cloudflare`) for stream resumption |
| Scheduling | Cloudflare cron triggers |
| Recurrence | `rrule`; dates via `date-fns` |
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
│   ├── errors.ts     # AppError, throwIfNotFound, formatErrorResponse
│   ├── validation.ts # apiValidator() wrapper
│   ├── idempotency.ts, ownership.ts, metrics.ts, log.ts, request-log.ts, redis.ts, date-utils.ts
├── domains/           # tasks, habits, inbox, projects, tags, subtasks, sections, settings,
│                       # notes, events, suggestions, health, proxy, ai, debug — one folder each
├── db/schema.ts       # Drizzle schema: tables, enums, indexes, RLS policies, relations (SOURCE OF TRUTH)
├── cron/overdue-check.ts
└── types/             # env.ts (Env bindings), db.ts (DbClient/Tx aliases), api.ts (envelope re-exports)
```

**Key Principles**
| Rule |
|---|
| Each domain folder owns its routes + domain-specific utilities. |
| `platform/` = shared behavior only. `types/` = shared *declarations* only (no behavior), reused by 2+ places. A type used once stays local. |
| A route handler validates → authorizes → delegates → shapes response. Non-trivial logic goes in a named helper or `{domain}.service.ts`. |
| No `helpers.ts`/`utils.ts`/`misc.ts` catch-alls anywhere. |
| Router MUST be method-chained (`new Hono().get().post()`) and mounted via `.route(...)` on the chained `apiApp` in `index.ts` — a non-chained router silently vanishes from `AppType`. |

**UCURD (non-negotiable, mechanical, not aesthetic):** every route/DB-touching file is ordered **U**tility → **C**reate → **U**pdate → **R**ead → **D**elete, by HTTP verb (`POST`=Create even for action routes like `/:id/reschedule`, `PATCH/PUT`=Update, `GET`=Read, `DELETE`=Delete). Utility helpers/type aliases sit at the top. Multi-resource files keep primary-resource-before-sub-resource within each verb group. A UCURD violation is a defect even if it works.

## 3. Adding Code

- **New feature in existing domain:** contract in `@cadence/contracts/{domain}` → server refinement in `{domain}.schema.ts` only if needed → route handler → Drizzle schema + matching `xRowSchema` if persistence changed → tests in `tests/unit/` or `tests/contracts/`.
- **New domain:** author contract (`packages/contracts/src/{domain}.ts` + sub-path export) → `{domain}.route.ts` importing shapes directly from `@cadence/contracts/{domain}` (chained router) → mount in `src/index.ts` on the chained `apiApp` → Row-parity assertion in `tests/unit/contract-parity.test.ts` + contract tests.
- **Platform infra:** only genuinely cross-cutting code (auth, db, rls, errors, logging, validation, idempotency, ownership, metrics, redis).

## 4. Request Lifecycle

`createRequestContext` (request ID) → `secureHeaders()` → body size limit (100KB, `/api/v1/*`; the photo upload is exempt and capped on its own route) → CORS allowlist → debug-route guard (404 in production, or unless `ENABLE_DEBUG_ROUTES=true`) → Tier-1 IP rate limit (pre-auth) → JWT auth (`userId` attached) → Tier-2 user rate limit (read/write) → Tier-3 admin rate limit (`/api/v1/debug/*`) → `apiValidator()` → handler: `getDbClient(c.env)` → `withRls(db, userId, fn)` → `{ data: ... }`.

Uncaught errors → `formatErrorResponse()`: extracts `AppError` code/message, attaches request ID, never leaks stack traces/SQL.

## 5. Database Rules

- **Per-request clients only.** `const db = getDbClient(c.env)`. Never a module-scope singleton — Hyperdrive pools connections, Workers don't hold them.
- **RLS is mandatory** for user-scoped work: `withRls(db, userId, async (tx) => { ... })`. Sets `request.jwt.claims`; guarantees same connection for config+query.
- **Type aliases:** import `DbClient`/`Tx` from `src/types/db.ts` — never redefine `Parameters<Parameters<DbClient["transaction"]>[0]>[0]` inline.
- **Ownership:** `assertProjectOwnership`/`assertSectionOwnership`/`assertTagsOwnership`/`assertOwnership` in `platform/ownership.ts` (404 if missing, 403 if wrong owner).
- **Migrations:** update `schema.ts` → `pnpm db:generate` → `pnpm db:check` → `pnpm db:migrate`. Never `drizzle-kit push`. `drizzle.config.ts` reads `.dev.vars`; migrations output to `apps/backend/drizzle/`.

## 6. API Conventions

- All routes under `/api/v1/`, no exceptions. Auth is always `Authorization: Bearer <JWT>` — never cookies/sessions.
- Success envelope: `{ "data": {...} }` everywhere, including health/debug. Errors: `{ "error": { code, message, status, requestId } }` via `AppError`.
- **Idempotency:** `Idempotency-Key` header — `getIdempotencyKey(c)` → `checkIdempotency(tx, userId, key)` (no-op if undefined) → mutate → `recordMutation(tx, userId, key)`. Supported on all POST endpoints in tasks/habits/inbox/projects/tags/subtasks/sections.
- Read-heavy routes: `Cache-Control: private, max-age=0, stale-while-revalidate=5`.

## 7. Mounted Routes

Public: `GET /health`. Protected (all `/api/v1/`):

| Domain | Mount | Notes |
|---|---|---|
| tasks | `/tasks` | CRUD, reorder, batch state, duplicate, tag associations |
| projects, tags, sections | `/projects`, `/tags`, `/sections` | CRUD |
| inbox | `/inbox` | items + sections CRUD |
| subtasks, notes | nested under `/tasks/:taskId/*` + standalone PATCH/DELETE |
| habits | `/habits` | CRUD, resolve, weekly/monthly views |
| settings | `/settings`, `/settings/background` | GET + PATCH (deep-merge via `deepPartial`); background = one photo per user in R2 (`USER_ASSETS`): POST upload (WebP-only, metadata stripped), GET own image, DELETE |
| events | `/events` | single + batch usage tracking |
| suggestions | `/suggestions` | list + accept/dismiss |
| proxy | `/proxy` | proxied external calls: weather, reverse/forward geocoding, approximate location (`GET /geo/approximate` from Cloudflare `request.cf`), holidays. Coordinates are rounded to 2 decimals before any upstream call. |
| debug | `/debug` | clear + seed (non-prod only) + admin prompt-block edit |
| ai | `/ai` | `POST /chat` (streamed, persisted), conversation CRUD, tool-output endpoints |

`AppType` (exported from `src/index.ts`) is the RPC contract the frontend types against — treat as a critical integration boundary.

## 8. Domain Model

`src/db/schema.ts` is truth: **28 tables**, **16 pgEnums**. Groups: identity (`users`, `userMetrics`) · tasks ecosystem (`projects`, `taskSections`, `tasks`, `subtasks`, `tags`, `taskTags`, `taskMetrics`, `taskNotes`, `taskNlpMetadata`, `taskNlpMetadataHistory`) · inbox (`inboxItems`, `inboxSections`) · habits (`habits`, `habitLogs`, `habitTags`) · intelligence (`aiMemories`, `suggestions`, `usageEvents`, `savedFocusViews`, `notificationState`) · AI assistant (`aiConversations`, `aiMessages`, `aiPromptBlocks`, `aiPromptRevision`, `aiTitlePrompts`) · infra (`mutationDedup`).

**Deliberate RLS exception:** `aiPromptBlocks`/`aiPromptRevision` have **no RLS** — global app config, identical for every user, written only by migrations/admin route, read only by the prompt cache loader outside `withRls`. Any block write bumps `aiPromptRevision.revision` (cache-bust token) in the same transaction.

**Settings:** `UserSettingsSchema` lives in `settings.schema.ts`, re-exported from `db/schema.ts`. `settings.appearance.backgroundImage` is server-owned: `sanitizeBackgroundPatch` (`domains/settings/background-image.ts`) lets a PATCH change only accent/blur/brightness, never the photo's identity or existence. Notification fields (`browser`, `taskReminders`, `habitReminders`, `dueDateAlerts`) are required. `settings.assistant` (persona, tone, verbosity, emoji, nickname, customInstructions, proactiveSuggestions, memoryEnabled, adaptiveTone) maps via pure `personaToDirectives` into the `persona_customization` prompt block; free-text fields are sanitized + fenced before composition — never trust them raw in a prompt.

## 9. AI Domain (`src/domains/ai`)

- `ai.route.ts` — `POST /chat` streams a turn via `createAgentUIStream`/`createUIMessageStream` (AI SDK v7), persists messages, supports resumable streams and `stopStream`. Conversation CRUD (`GET/PATCH/DELETE /conversations[/:id]`).
- `agent.ts` — model/agent construction (`getAgentInstance`, `getModelId`).
- `tools/` — one file per callable surface: `tasks`, `projects`, `sections`, `tags`, `habits`, `inbox`, `calendar`, `metrics`, `suggestions`, `projections`. Tools read/write real user data through the same RLS-scoped path as routes — never bypass `withRls`.
- **Redis (`platform/redis.ts`, Upstash REST over HTTPS only):** `getRedis(env)` gates stream-resumption (in-flight SSE chunk log + abort flag) — returns `null` if unconfigured/insecure, and every resumption path must no-op gracefully on `null`. `getRateLimitRedis(env)` is a separate accessor for AI-specific rate limiting. Redis is a *cache*, never the source of truth — Postgres is. Built per-request (Workers rule), never a module global.
- Admin-gated `promptBlock*` schemas stay in `ai.schema.ts`, not in contracts (not client-facing).

## 10. Debug Seed System (`src/domains/debug/`)

`debug-seed.ts` (fixture builders) + `scenarios/index.ts` (`Scenario` registry: `name`, `version`, `seed(db, userId)`) + `scenarios/active-power-user.ts`. Routes: `POST /debug/clear` (wipes all user data, FK-safe order), `POST /debug/seed?scenario=`, `GET /debug/capabilities`. New scenario = new file in `scenarios/` + register in the index.

## 11. Tests

`tests/unit/` (pure logic, no HTTP) · `tests/contracts/` (route-level, mocked DB) · `tests/security/` (ASVS + middleware). Commands: `pnpm test` (all of `tests/`, what CI runs), `test:unit`, `test:contracts`, `test:security`, `test:watch`, `pnpm check` (typecheck + all tests).

## 12. Auth (`platform/auth.ts`)

Reads `Authorization: Bearer`, loads JWKS from `NEON_AUTH_JWKS_URL` (URL-keyed cache, retries transient failures), attaches `userId` from JWT `sub`, async-syncs user row via `executionCtx.waitUntil()`. Never introduce cookies/sessions/non-JWT auth without explicit design sign-off.

## 13. Background Jobs

Cron `0 6 * * *` (daily 06:00 UTC, `wrangler.jsonc`): `handleOverdueCheck(env)` (overdue active tasks → `task_metrics.delay_count`) + `pruneStaleMutations(env)`. Task metrics (`platform/metrics.ts`) silently track reschedule count, first-scheduled, completed-at, created-to-done duration — internal only, no public API.

## 14. Environment & Bindings

| Binding | Purpose |
|---|---|
| `HYPERDRIVE` | → Neon Postgres |
| `NEON_AUTH_JWKS_URL` | JWT verification |
| `RATE_LIMITER` / `_READ` / `_WRITE` / `_ADMIN` | Tier 1/2/2/3 limiters |
| `USER_ASSETS` | Private R2 bucket for photo backgrounds (optional — absence answers 503) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | AI stream resumption (optional — absence disables gracefully) |
| `DEPLOYMENT_STAGE` | `"production"` / `"staging"` / `"development"` |
| `ENABLE_DEBUG_ROUTES` | must be `"true"` to enable debug endpoints |

Dev secrets in `.dev.vars`. Prefer Worker bindings over ad hoc env reads.

## 15. Commands

```bash
pnpm dev | deploy | check | test | test:unit | test:contracts | test:security | test:watch
pnpm typecheck | cf-typegen
pnpm db:generate | db:check | db:migrate | db:studio
```

**Deployment:** direct push to `main` deploys. GitHub Actions run *after* push (health signal, not a gate) — all verification must pass locally first. Pre-push: `test:unit`, `typecheck`, `wrangler deploy --dry-run --minify`.

## 16. Logging (`platform/log.ts`)

Never call `console.*` directly — use `logger.<level>(source, event, fields)`. **Never log 2xx/3xx** (Cloudflare already records every request). `event` is a stable low-cardinality discriminator (`upstream_failed`, not a sentence). Always include `requestId` + `userHash` (`hashIdentifier(userId)`) — never raw user IDs/emails. Levels: `error` (5xx, unhandled throws, dependency outages), `warn` (4xx, validation failures, best-effort write failures), `info` (rare milestones like cron summaries). HTTP failures are centralized (`logValidationFailure`, `app.onError`→`logErrorResponse`) — don't add ad hoc per-route failure logs on top of these.

## 17. Anti-Patterns

Platform-specific endpoints · bypassing JWT/RLS/Zod · trusting client `userId` · global/cached DB clients · domain logic in `platform/` · `helpers.ts`/`utils.ts`/`misc.ts` · inline reusable schemas in routes · re-deriving `DbClient`/`Tx` aliases locally · domain re-export shims in `types/` (the one exception is `types/inbox.ts`, load-bearing for the frontend — don't imitate) · raw stack traces/SQL to clients · `drizzle-kit push` · expanding public AI surface without explicit scope · unversioned routes · duplicated cross-domain logic · UCURD violations · business logic buried in handlers · threading a raw `tx` into pure logic instead of injecting data/a loader.

## 18. Checklist

Identify domain → update/add contract + server schema refinement → update Drizzle schema + regenerate migration if persistence changed → route with `apiValidator()` → `getDbClient` + `withRls` → ownership checks → idempotency support on writes → `{ data }` envelope → tests → `pnpm check`.

If this document conflicts with a proposed change, this document is the baseline.
