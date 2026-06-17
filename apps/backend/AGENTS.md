# Cadence Backend — Agent Instructions

> **Read this before modifying anything in `apps/backend`.** This is the authoritative operating manual for the Cadence backend.

---

## 0. Mission

Cadence backend is a **standalone Cloudflare Worker API** built with **Hono v4** and backed by **Neon Postgres** through **Cloudflare Hyperdrive**.

It is the shared backend for all Cadence clients (web, mobile, desktop) and must remain:

- **Platform-neutral** — no cookies, server actions, or framework-coupled session state
- **Edge-safe** — no Node-only APIs, no global singletons, no long-lived connections
- **Schema-driven** — Drizzle schema is the single source of truth for persistence
- **Parity-first** — every endpoint is consumable by every client identically

If you break a route contract, validation schema, or response shape, you break multiple clients at once.

> **Shared contracts & domain logic.** Shared request/response shapes live in
> [`@cadence/contracts`](../../packages/contracts) (Zod schemas → inferred types,
> the single source of truth). Pure, framework-neutral domain logic lives in
> [`@cadence/domain`](../../packages/domain) (throws `DomainError`, mapped to
> `AppError` in `formatErrorResponse`). A domain's `domains/*/*.schema.ts` now
> holds **only** server-specific validation (query coercion, cross-field
> `superRefine`) and re-exports the canonical shapes. **Never hand-write a type
> that mirrors a contract** — derive it (`z.infer` / `.pick` / `.extend`). Row
> schemas are kept structurally identical to Drizzle `$inferSelect` by the
> compile-time guard in `tests/unit/contract-parity.test.ts`.

---

## 1. Architecture Overview

The backend follows a **domain-first architecture** with a shared platform layer.

```text
src/
├── index.ts                    # Worker entry, middleware chain, route mounting, AppType export
├── platform/                   # Cross-cutting infrastructure (auth, db, errors, rls, etc.)
│   ├── index.ts                # Barrel re-export for all platform symbols
│   ├── auth.ts                 # Bearer JWT middleware + background user sync
│   ├── db.ts                   # Per-request DB client creation (getDbClient)
│   ├── errors.ts               # AppError, throwIfNotFound, formatErrorResponse
│   ├── idempotency.ts          # Header-based idempotency (Idempotency-Key)
│   ├── log.ts                  # Canonical structured logger (logger.error/warn/info)
│   ├── metrics.ts              # Task metric tracking helpers (best-effort, logs on failure)
│   ├── ownership.ts            # Cross-entity ownership validation
│   ├── request-log.ts          # Request context + HTTP failure logging (delegates to log.ts)
│   ├── rls.ts                  # RLS helpers (setRlsContext, withRls)
│   └── validation.ts           # apiValidator() wrapper for @hono/zod-validator
├── domains/                    # Product capabilities, one folder per domain
│   ├── tasks/                  # tasks.route.ts, tasks.schema.ts (server-only filters), task-filters.ts, ...
│   ├── habits/                 # habits.route.ts            (shapes → @cadence/contracts/habit)
│   ├── inbox/                  # inbox.route.ts             (shapes → @cadence/contracts/inbox)
│   ├── projects/               # projects.route.ts          (shapes → @cadence/contracts/project)
│   ├── tags/                   # tags.route.ts              (shapes → @cadence/contracts/tag)
│   ├── subtasks/               # subtasks.route.ts          (shapes → @cadence/contracts/subtask)
│   ├── sections/               # sections.route.ts          (shapes → @cadence/contracts/section)
│   ├── settings/               # settings.route.ts          (shapes+defaults → @cadence/contracts/settings)
│   ├── notes/                  # notes.route.ts             (shapes → @cadence/contracts/note)
│   ├── events/                 # events.route.ts, events.schema.ts
│   ├── suggestions/            # suggestions.route.ts, suggestions.schema.ts
│   ├── health/                 # health.route.ts
│   ├── proxy/                  # proxy.route.ts, proxy.schema.ts
│   ├── debug/                  # debug.route.ts, debug-seed.ts, scenarios/
│   └── ai/                     # ai.route.ts, agent.ts, ai.schema.ts (server-only promptBlock + re-export), tools/
├── db/
│   └── schema.ts               # Drizzle schema: tables, enums, indexes, relations
├── cron/
│   └── overdue-check.ts        # Scheduled overdue metric updates + mutation dedup pruning
└── types/                      # Shared, reused type & schema declarations (no behavior)
    ├── env.ts                  # Worker env bindings type (Env) + stage/origin parsers
    ├── db.ts                   # Shared DB type aliases: DbClient (re-export), Tx
    └── api.ts                  # Re-exports envelope/pagination from @cadence/contracts/common
```

> **Canonical request/response/entity shapes live in
> [`@cadence/contracts`](../../packages/contracts)** (Zod → inferred types); pure
> domain logic lives in [`@cadence/domain`](../../packages/domain). Routes import
> shapes directly from `@cadence/contracts/<domain>`. A `domains/*/*.schema.ts`
> file exists **only** where a domain needs server-only validation that a contract
> must not carry — currently `tasks.schema.ts` (filter/query `superRefine` using
> server normalizers) and `ai.schema.ts` (admin-gated promptBlock schemas); both
> also re-export their contract. Domains with no server-only validation have **no
> schema file**. Read `packages/AGENTS.md` before editing any contract, shared
> type, or domain logic. (`apps/backend/src/types/inbox.ts` and the per-domain
> schema shims were removed in the Tier-0/1 migration.)

### Key Principles

| Principle | Rule |
|---|---|
| **Domain ownership** | Each domain folder owns its routes, schemas, and utilities. |
| **Platform is shared behavior** | `src/platform/` holds only cross-cutting infrastructure *with behavior* (auth, db, rls, validation, …). |
| **Types are shared declarations** | `src/types/` holds general, **reused** type aliases, interfaces, and cross-domain schemas — no behavior. A type used in only one place stays with that code. |
| **Contracts own the wire** | Request/response/entity **shapes** are Zod schemas in `@cadence/contracts`; TS types are `z.infer`red, never hand-written. `domains/*/*.schema.ts` re-export them and add only server-only refinements. |
| **Schema is Drizzle** | `src/db/schema.ts` is the single source of truth for persistence rows + enums. Each contract `xRowSchema` is held structurally identical to its `$inferSelect` by `tests/unit/contract-parity.test.ts` (compile-time). |
| **Routes are thin** | A route handler validates input, reads auth context, calls DB/service, shapes response. |
| **No catch-all folders** | Do not put domain logic in `platform/` or create `helpers.ts`/`utils.ts`/`misc.ts` files. |

---

## 2. Core Non-Negotiables

### 2.1 Universal API Rules

- **Never create platform-specific endpoints.**
- **Auth is always `Authorization: Bearer <JWT>`.** No cookies, no sessions.
- **Always preserve client parity.** If web needs it, mobile must consume the same endpoint.
- **All routes are versioned under `/api/v1/`.** Do not create unversioned routes.

### 2.2 Runtime Rules

- This runs on **Cloudflare Workers** — an isolate, not a server.
- **Do not cache a DB client globally.** Create via `getDbClient(c.env)` per request.
- **Do not introduce Node-only APIs** unless absolutely necessary and verified on Workers.
- Use **pnpm** for all commands.

### 2.3 Security Rules

- **JWT verification is mandatory** for all `/api/v1/*` routes (enforced by auth middleware).
- **RLS context is mandatory** before user-scoped queries. Use `withRls()`.
- **Zod validation is mandatory** for params, query, and JSON body.
- **Never trust client `userId`.** It comes from JWT `sub` only.
- **Verify parent ownership** for nested resources via `assertOwnership` helpers.
- **Never return raw internal errors** or stack traces to clients.

### 2.4 Code Organization Rules (UCURD — non-negotiable)

Every file that registers routes or exports DB-touching functions is ordered by
**UCURD**: **U**tility → **C**reate → **U**pdate → **R**ead → **D**elete.

- Order is determined by **HTTP verb**, not by semantics: `POST` is always Create,
  `PATCH`/`PUT` is Update, `GET` is Read, `DELETE` is Delete — even for action-style
  routes (e.g. `POST /:id/reschedule` lives in the Create block, not next to a
  related `PATCH`).
- **Utility** helpers (pure functions, loaders, type aliases) sit at the **top** of
  the file, above the route/export chain — never trailing at the bottom.
- When a file hosts more than one resource or sub-resource, keep a **stable
  secondary order within each verb group**: primary resource before its
  sub-resources (e.g. within the `GET` block: `GET /` then `GET /sections`).
- This ordering is mechanical and reviewable — do not deviate "because it reads
  better locally." Predictable structure is the point.

This rule exists so any contributor can locate an endpoint in O(1) and so Hono's
RPC surface stays diff-stable. A file that violates UCURD is a defect even if it
functions correctly.

---

## 3. Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| HTTP framework | Hono v4 |
| Validation | Zod v4 + `@hono/zod-validator` (wrapped by `apiValidator()`) |
| ORM | Drizzle ORM (`drizzle-orm/postgres-js`) |
| Database | Neon Postgres via Cloudflare Hyperdrive |
| Auth | Neon Auth JWTs, verified via `jose` against JWKS |
| Scheduling | Cloudflare cron triggers |
| Recurrence | `rrule` |
| Date helpers | `date-fns` |
| NLP | `@cadence/nlp` (workspace dependency) |

### Important: Zod v4

Cadence uses **Zod 4** (`^4.4.3`, pinned via root `pnpm.overrides.zod` so apps and `@cadence/contracts` share one instance — two zod instances cause "types not identical" errors). Key differences from Zod 3:

- **No `.deepPartial()`.** A custom recursive `deepPartial()` utility lives in `@cadence/contracts/settings` (re-exported by `domains/settings/settings.schema.ts`).
- Schema introspection uses `schema._zod.def.type` discriminant.
- `.unwrap()` for optional/nullable, `.element` for arrays.

---

## 4. Naming Conventions

File names communicate responsibility immediately:

| Suffix | Purpose | Example |
|---|---|---|
| `*.route.ts` | HTTP boundary — input validation, auth, response shaping | `tasks.route.ts` |
| `*.schema.ts` | Zod schemas for request/response validation | `tasks.schema.ts` |
| `*.service.ts` | Business workflow / domain logic (when needed) | _(future)_ |
| `*.repo.ts` | Persistence details (when separated from route) | _(future)_ |

**Domain-specific utilities** use descriptive names:

- `task-filters.ts` — query filter building helpers
- `task-normalization.ts` — input normalization logic
- `task-recurrence.ts` — recurrence expansion/management
- `settings-defaults.ts` — default settings values
- `debug-seed.ts` — fixture builder functions

**Avoid** ambiguous file names: `helpers.ts`, `utils.ts`, `misc.ts`, `types.ts`.

---

## 5. Where New Code Goes

### Adding a new feature to an existing domain

1. Add/update the **canonical** request/response/entity shape in
   `@cadence/contracts/{domain}` (Zod). Add a server-only refinement to
   `src/domains/{domain}/{domain}.schema.ts` **only** if it needs a server
   normalizer (query coercion, cross-field `superRefine`).
2. Add/update route handlers → `src/domains/{domain}/{domain}.route.ts`
3. If the route file grows large, extract domain logic into `{domain}.service.ts`
   — and if it is **pure** (no I/O, no `AppError`), put it in `@cadence/domain`.
4. Update Drizzle schema if persistence changes → `src/db/schema.ts`, then update
   the matching `xRowSchema` in contracts (the parity test will fail until you do).
5. Add tests → `tests/unit/` or `tests/contracts/`

### Adding a new domain

1. Author the contract: `packages/contracts/src/{domain}.ts` (Row/Entity/Input
   schemas) + sub-path export in `packages/contracts/package.json`.
2. Create `src/domains/{domain}/{domain}.route.ts` and import shapes directly
   from `@cadence/contracts/{domain}`. Add a `{domain}.schema.ts` **only** if you
   need server-only validation (it would `export * from "@cadence/contracts/
   {domain}"` and add the refinement) — otherwise no schema file.
   **The router MUST be method-chained** (`new Hono().get(...).post(...)`), not
   registered as separate `router.get(...)` statements — otherwise its endpoints
   never enter `AppType` and vanish from the frontend's typed RPC client.
3. Mount the route in `src/index.ts` by adding `.route("/api/v1/{domain}", …)` to
   the existing **chained** `apiApp` expression (not as a standalone statement) so
   the schema flows into `AppType`.
4. Add a Row-parity assertion in `tests/unit/contract-parity.test.ts` + contract
   tests in `tests/contracts/`.

### Adding platform infrastructure

Only code that is **genuinely cross-cutting** belongs in `src/platform/`:

- Authentication / authorization
- Database client creation
- RLS management
- Error formatting
- Request logging
- Validation middleware
- Idempotency
- Ownership validation
- Metrics plumbing

**Do not** put domain-specific logic in `src/platform/`.

### Adding a shared type or schema → `src/types/`

`src/types/` is the home for **general, reused declarations with no behavior**:
type aliases, interfaces, and cross-domain Zod schemas. The litmus test is
**reuse + neutrality**:

| Put it in `src/types/` when… | Keep it local when… |
|---|---|
| It is consumed by **2+ domains** (or platform + a domain). | It is used in exactly one file/domain. |
| It is a **pure declaration** — no DB I/O, middleware, or side effects. | It carries behavior (that's `platform/` or the domain). |
| It is **domain-neutral** (a `Tx`, a pagination schema, a response envelope). | It is domain-specific (a task filter type, an inbox shape). |

Current homes:

- `types/env.ts` — `Env` bindings + stage/origin parsers.
- `types/db.ts` — `DbClient`, `Tx` (see §7.3).
- `types/api.ts` — `paginationSchema`, `uuidParamSchema`, `taskIdParamSchema`,
  `ApiResponse<T>`, `ApiError`.

**Boundary notes — do not blur these:**

- A type that is **intrinsically the output of a platform factory** stays with
  that factory, not in `types/`. `DbClient` is `ReturnType<typeof getDbClient>`,
  so it is *defined* in `platform/db.ts` and merely **re-exported** from
  `types/db.ts` so all shared DB aliases resolve to one place.
- A type that is the **contract of a piece of behavior** stays with that
  behavior. `AuthVariables` is the shape the auth middleware writes onto the Hono
  context — it lives in `platform/auth.ts`, even though every route imports it.
- **Domain types are not "shared types."** A type that only describes one
  domain's data belongs in that domain's `*.schema.ts`, even if reused within the
  domain. Do **not** add domain re-export shims to `types/` for internal use.
- `types/inbox.ts` is the **one deliberate exception**: it exists solely as the
  cross-package export surface (`@cadence/backend/types/*`) so the frontend can
  import inbox types. It is not an internal organizational type. Do not imitate
  this pattern for new domains without a cross-package consumer, and do not remove
  it without coordinating the frontend (it is load-bearing).

---

## 6. Request Lifecycle

Every protected request flows through this chain:

1. Request enters the Worker
2. `createRequestContext()` — assigns request ID
3. `secureHeaders()` — security headers
4. Body size limit (100KB) for `/api/v1/*`
5. CORS — allowlist evaluated (production origin + `ALLOWED_ORIGINS` + localhost in dev)
6. Debug route guard — 404s if `DEPLOYMENT_STAGE=production` or `ENABLE_DEBUG_ROUTES≠true`
7. **Tier 1 rate limit** — IP-based global limiter (pre-auth)
8. **Auth middleware** — JWT verified against Neon Auth JWKS, `userId` attached
9. **Tier 2 rate limit** — user-scoped read/write limiters (post-auth)
10. **Tier 3 rate limit** — admin route limiter for `/api/v1/debug/*`
11. Route-level `apiValidator()` checks params/query/body
12. Handler creates DB client via `getDbClient(c.env)`
13. Handler executes scoped work via `withRls(db, userId, fn)`
14. Handler returns JSON: `{ data: ... }`

### Global Error Handler

All uncaught errors pass through `formatErrorResponse()` which:

- Extracts error code and message from `AppError`
- Attaches request ID
- Never leaks stack traces or SQL details to clients

---

## 7. Database Access Rules

### 7.1 Per-Request Clients Only

```typescript
const db = getDbClient(c.env);
```

**Never** create singleton clients, reuse cached connections, or move DB I/O to module scope. Hyperdrive handles connection pooling.

### 7.2 RLS Pattern

**Always use `withRls()` for user-scoped work:**

```typescript
const result = await withRls(db, userId, async (tx) => {
  // All queries here run within the RLS-scoped transaction
  return tx.select().from(tasks).where(eq(tasks.userId, userId));
});
```

This sets `request.jwt.claims`, guarantees config and queries execute on the same connection, and is mandatory for multi-step handlers.

### 7.3 Type Aliases

The shared database type aliases live in `src/types/db.ts` — **import them, never
redefine them inline:**

```typescript
import type { DbClient, Tx } from "../../types/db";
```

- `DbClient` — per-request Drizzle client (`ReturnType<typeof getDbClient>`).
- `Tx` — RLS-scoped transaction handle passed to `withRls` callbacks.

Re-deriving `Parameters<Parameters<DbClient["transaction"]>[0]>[0]` locally (under
any alias name) is a defect — that exact alias used to be copied across six files.

### 7.4 Ownership Validation

For nested/relational resources, use the helpers from `src/platform/ownership.ts`:

- `assertProjectOwnership(tx, userId, projectId)` — 404 if project doesn't exist, 403 if wrong owner
- `assertSectionOwnership(tx, userId, sectionId)` — same pattern
- `assertTagsOwnership(tx, userId, tagIds)` — validates all tags belong to user
- `assertOwnership(tx, userId, { projectId?, sectionId?, tagIds? })` — batch wrapper

### 7.5 Migration Rules

1. Update `src/db/schema.ts` first
2. Generate migration: `pnpm db:generate`
3. Check migration: `pnpm db:check`
4. Apply migration: `pnpm db:migrate`
5. Update related Zod schemas in the domain's `*.schema.ts`
6. **Never** use `drizzle-kit push` or destructive commands
7. Schema and migrations must stay in sync

Config notes:

- `drizzle.config.ts` loads `.dev.vars`, not `.env`
- Migrations output to `apps/backend/drizzle/`
- Management DB access uses `MANAGEMENT_DATABASE_URL`

---

## 8. API Conventions

### 8.1 Versioning

All routes are mounted under `/api/v1/`. No exceptions.

### 8.2 Response Envelope

**Success:**
```json
{ "data": { ... } }
```

All routes use the `{ data }` wrapper consistently, including health, debug, and error-free responses.

**Mutations** return the full updated entity or primary resource.

**Errors:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "status": 404,
    "requestId": "req_abc123"
  }
}
```

Use `AppError` for expected failures. Global formatting via `formatErrorResponse()`.

### 8.3 Idempotency

Write endpoints support idempotency via the `Idempotency-Key` HTTP header:

```typescript
const idempotencyKey = getIdempotencyKey(c); // reads Idempotency-Key header
await checkIdempotency(tx, userId, idempotencyKey); // no-ops if key is undefined
// ... perform mutation ...
await recordMutation(tx, userId, idempotencyKey);   // no-ops if key is undefined
```

All POST endpoints in tasks, habits, inbox, projects, tags, subtasks, and sections support this pattern.

### 8.4 Caching

Read-heavy routes set:

```
Cache-Control: private, max-age=0, stale-while-revalidate=5
```

Preserve this pattern when extending similar endpoints.

---

## 9. Mounted Routes

### Public

- `GET /health`

### Protected (all under `/api/v1/`)

| Domain | Mount | Key endpoints |
|---|---|---|
| Tasks | `/api/v1/tasks` | CRUD, reorder, batch state, duplicate, tag associations |
| Projects | `/api/v1/projects` | CRUD |
| Tags | `/api/v1/tags` | CRUD |
| Inbox | `/api/v1/inbox` | Items CRUD + sections CRUD |
| Subtasks | `/api/v1` | Nested under tasks, plus standalone PATCH/DELETE |
| Notes | `/api/v1` | Nested under tasks (`/tasks/:taskId/notes`) |
| Sections | `/api/v1/sections` | Task section CRUD |
| Habits | `/api/v1/habits` | CRUD, resolve, weekly/monthly views |
| Settings | `/api/v1/settings` | GET + PATCH (deep-merge) |
| Events | `/api/v1/events` | Track single + batch usage events |
| Suggestions | `/api/v1/suggestions` | List + accept/dismiss |
| Proxy | `/api/v1/proxy` | Proxied external API calls |
| Debug | `/api/v1/debug` | Clear + seed (non-production only) + admin prompt-block edit |
| AI | `/api/v1/ai` | `POST /chat` (streamed turn, persisted), conversation CRUD (`GET`/`PATCH`/`DELETE /conversations[/:id]`) |

**`AppType`** is exported from `src/index.ts` for Hono RPC — treat it as a critical integration boundary.

---

## 10. Domain Model

The Drizzle schema (`src/db/schema.ts`) is the source of truth.

### Tables (26 total)

**Identity:** `users`, `userMetrics`

**Tasks ecosystem:** `projects`, `taskSections`, `tasks`, `subtasks`, `tags`, `taskTags`, `taskMetrics`, `taskNotes`, `taskNlpMetadata`, `taskNlpMetadataHistory`

**Inbox:** `inboxItems`, `inboxSections`

**Habits:** `habits`, `habitLogs`, `habitTags`

**Intelligence:** `aiMemories`, `suggestions`, `usageEvents`, `savedFocusViews`

**AI assistant:** `aiConversations`, `aiMessages` (owner-RLS chat persistence), `aiPromptBlocks`, `aiPromptRevision`

**Infrastructure:** `mutationDedup`

> **Deliberate RLS exception:** `aiPromptBlocks` and `aiPromptRevision` are **global
> application config**, identical for every user, and therefore intentionally have
> **no RLS policy** (`enableRLS()` omitted). They are system-owned: written only by
> migrations / the admin-gated `PATCH /api/v1/debug/ai/prompt-blocks` path, and read
> only by the prompt cache loader (outside `withRls`). This is a conscious, recorded
> deviation from "RLS or it doesn't ship" — mirrors the `types/inbox.ts` exception
> style. Any block write bumps `aiPromptRevision.revision` in the same transaction
> (the cache-bust token). See `docs/ai_upgrade/04`.

### Enums (12 pgEnums)

`targetModeEnum`, `captureKindEnum`, `captureStatusEnum`, `analysisStatusEnum`, `confidenceTierEnum`, `sourceSurfaceEnum`, `suggestionTypeEnum`, `focusViewSourceEnum`, `aiPromptLayerEnum`, `aiPromptBlockKindEnum`, `aiMessageRoleEnum`, `aiMessageStatusEnum`

### FK Cascades

- `taskTags`, `taskNotes`, `taskMetrics`, `subtasks`, `taskNlpMetadata`, `taskNlpMetadataHistory` → cascade from `tasks`
- `habitTags` → cascade from `habits` + `tags`
- `savedFocusViews` → cascade from `users` only

### Settings

`UserSettingsSchema` (canonical Zod schema) lives in `src/domains/settings/settings.schema.ts` and is re-exported from `src/db/schema.ts`. Notification preferences (`browser`, `taskReminders`, `habitReminders`, `dueDateAlerts`) are required fields. The PATCH endpoint uses a custom `deepPartial()` utility for partial updates.

**`settings.assistant`** (AI personality, `docs/ai_upgrade/07`) is an optional section:
`persona`, `tone`, `verbosity`, `emoji`, `nickname`, `assistantName`, `customInstructions`,
`proactiveSuggestions`, `memoryEnabled`, `adaptiveTone`. Defaults reproduce today's
assistant behavior. It maps (pure `personaToDirectives`) to the `persona_customization`
auxiliary prompt block; `customInstructions`/`nickname`/`assistantName` are **untrusted**
free text — sanitized + fenced before composition. No new endpoint: the existing
`PATCH /api/v1/settings` deep-merge accepts `{ assistant: { … } }`.

---

## 11. Debug Seed System

The debug domain (`src/domains/debug/`) provides developer fixture tooling:

### Architecture

- **`debug-seed.ts`** — 10 fixture builder functions (`createSeedTask`, `createSeedHabit`, `createSeedTaskNote`, `createSeedNlpMetadata`, `createSeedSavedFocusView`, etc.)
- **`scenarios/index.ts`** — `Scenario` interface + registry (`name`, `version`, `seed(db, userId)`)
- **`scenarios/active-power-user.ts`** — comprehensive seed scenario with all entity types
- **`debug.route.ts`** — slim route: schema-complete `clearUserData` (21 tables in FK-safe order) + scenario dispatch

### Usage

- `POST /api/v1/debug/clear` — deletes all user data across 21 tables
- `POST /api/v1/debug/seed?scenario=active-power-user` — seeds a full dataset
- `GET /api/v1/debug/capabilities` — lists available scenarios

### Adding a New Scenario

1. Create `src/domains/debug/scenarios/{name}.ts`
2. Export a `Scenario` object with `name`, `version`, and `seed(db, userId)` function
3. Register it in `src/domains/debug/scenarios/index.ts`

---

## 12. Test Structure

```text
tests/
├── setup.ts                    # Vitest global setup (mocks, test DB client)
├── unit/                       # Pure logic tests (no HTTP, no mocking routes)
│   ├── task-filters.test.ts
│   ├── task-normalization.test.ts
│   ├── task-recurrence.test.ts
│   ├── settings.test.ts
│   ├── task.test.ts
│   ├── log.test.ts
│   ├── request-log.test.ts
│   └── debug-seed.test.ts
├── contracts/                  # Route contract tests (HTTP-level, mocked DB)
│   ├── tasks.contract.test.ts
│   ├── tasks.test.ts
│   ├── habits.test.ts
│   ├── inbox.contract.test.ts
│   ├── projects.contract.test.ts
│   ├── tags.contract.test.ts
│   ├── sections.contract.test.ts
│   ├── subtasks.contract.test.ts
│   ├── settings.contract.test.ts
│   ├── events.contract.test.ts
│   ├── suggestions.contract.test.ts
│   ├── health.contract.test.ts
│   ├── proxy.contract.test.ts
│   └── debug-availability.test.ts
└── security/                   # Security-focused tests
    ├── security.asvs.test.ts
    └── security.middleware.test.ts
```

### Test Commands

```bash
pnpm test              # Run all tests
pnpm test:unit         # Unit tests only
pnpm test:contracts    # Contract tests only
pnpm test:security     # Security tests only
pnpm test:watch        # Watch mode
pnpm check             # Typecheck + all tests
```

---

## 13. Auth

`src/platform/auth.ts`:

- Reads `Authorization` header, enforces `Bearer` scheme
- Loads JWKS from `NEON_AUTH_JWKS_URL` with URL-keyed caching
- Retries transient JWKS/network failures with short exponential backoff
- Attaches `userId` from JWT `sub` to Hono context
- Asynchronously syncs user row on write requests via `executionCtx.waitUntil()`

**Do not** introduce cookies, sessions, or non-JWT auth without explicit design.

---

## 14. Background Jobs

### Cron (`wrangler.jsonc`)

Triggers at `0 6 * * *` (daily 06:00 UTC):

- **`handleOverdueCheck(env)`** — finds overdue active tasks, increments `task_metrics.delay_count`
- **`pruneStaleMutations(env)`** — cleans old entries from `mutationDedup` table

### Task Metrics (`src/platform/metrics.ts`)

Silently tracks: reschedule count, first scheduled timestamp, completion timestamp, created-to-done duration. Internal intelligence, not a public API.

---

## 15. Environment and Bindings

| Binding | Purpose |
|---|---|
| `HYPERDRIVE` | Cloudflare Hyperdrive → Neon Postgres |
| `NEON_AUTH_JWKS_URL` | JWKS endpoint for JWT verification |
| `RATE_LIMITER` | Tier 1 IP-based rate limiter |
| `RATE_LIMITER_READ` | Tier 2 user-scoped read limiter |
| `RATE_LIMITER_WRITE` | Tier 2 user-scoped write limiter |
| `RATE_LIMITER_ADMIN` | Tier 3 admin route limiter |
| `DEPLOYMENT_STAGE` | `"production"` / `"staging"` / `"development"` |
| `ENABLE_DEBUG_ROUTES` | Must be `"true"` to enable debug endpoints |

Dev secrets go in `.dev.vars`. Prefer Worker bindings for runtime config.

---

## 16. Package Commands

```bash
pnpm dev               # Start dev server (wrangler + dotenvx)
pnpm deploy            # Deploy to Cloudflare
pnpm check             # Typecheck + full test suite
pnpm test              # All tests
pnpm test:unit         # Unit tests
pnpm test:contracts    # Contract tests
pnpm test:security     # Security tests
pnpm test:watch        # Watch mode
pnpm typecheck         # TypeScript only
pnpm cf-typegen        # Regenerate Cloudflare bindings types
pnpm db:generate       # Generate Drizzle migration
pnpm db:check          # Validate migration consistency
pnpm db:migrate        # Apply migrations
pnpm db:studio         # Drizzle Studio GUI
```

---

## 17. Logging Rules

All logging goes through the structured logger in `src/platform/log.ts`. **Do not
call `console.*` directly** — the logger emits an indexed object that Cloudflare
Workers Logs filters in the dashboard (no `wrangler tail` required). A bare
`console.log("user " + id)` collapses into one opaque `message` string you can
only text-match; `logger.warn("http", "...", { ... })` is filterable per field.

```ts
import { logger } from "../platform/log";

logger.error("proxy", "upstream_failed", { upstream: "nominatim", status: 503 });
logger.warn("http", "validation_failed", { errorCode, issues });
logger.info("cron", "overdue_check_started", { tasks, users });
```

**Levels** (`logger.<level>(source, event, fields)`):

| Level   | Use for                                                        | CF severity |
| ------- | ------------------------------------------------------------- | ----------- |
| `error` | 5xx, unhandled throws, dependency/DB outages                  | error       |
| `warn`  | 4xx client faults, invalid input, best-effort write failures  | warning     |
| `info`  | rare operational milestones (e.g. cron summaries)             | info        |

**Rules**

- **Never log happy paths (2xx/3xx).** Cloudflare's `invocation_logs` already
  records every request; the logger channel is errors and warnings only.
- `event` is a stable, low-cardinality discriminator — one filter = one failure
  class. Keep names like `upstream_failed`, `recurrence_rule_invalid`.
- Always include correlation: `requestId` (HTTP, via the request-context helpers)
  and `userHash` (`hashIdentifier(userId)`) — **never raw user IDs or emails**.
- Flatten thrown errors with `issuesFromError(err)`; truncate free text with
  `shorten(...)`. The per-invocation log budget is 256 KB.
- HTTP failures are logged once, centrally: validation via `logValidationFailure`,
  everything else via `app.onError` → `logErrorResponse`. The request-context
  middleware suppresses a duplicate line when one was already emitted. Don't add
  ad-hoc per-route failure logs for responses that already flow through these.
- Log enough context to debug, but never leak internal error details to clients.

---

## 18. Anti-Patterns

Do not:

- Create platform-specific endpoints
- Bypass JWT verification for any protected route
- Skip Zod validation on any input surface
- Trust client-provided `userId`
- Share DB clients globally or across requests
- Put domain logic in `src/platform/`
- Create `helpers.ts`, `utils.ts`, or `misc.ts` files
- Define reusable schemas inline in route files
- **Re-derive shared type aliases locally** — import `DbClient`/`Tx` from
  `src/types/db.ts`; never redefine `Parameters<Parameters<DbClient[...]>>` inline
- **Scatter a reused declaration across files** — a type/schema used by 2+ places
  belongs in `src/types/` (see §5); a single-use one stays local
- **Add domain re-export shims to `src/types/`** for internal use — domain types
  live in the domain's `*.schema.ts` (`types/inbox.ts` is the one cross-package
  exception, §5)
- Return raw stack traces or SQL details to clients
- Use `drizzle-kit push` or destructive migration commands
- Expand public AI surface unless explicitly scoped
- Create unversioned routes (everything under `/api/v1/`)
- **Duplicate logic across domains** — copy-pasted helpers/queries are a defect;
  extract a single source of truth (shared domain module or `@cadence/*` package)
- **Violate UCURD ordering** (see §2.4) in any route or DB-touching file
- **Bury business logic inside route handlers** — a handler validates, authorizes,
  delegates, and shapes the response; non-trivial logic belongs in a named helper
- **Couple pure logic to persistence** — pass data or an injected loader into pure
  functions instead of threading a raw `tx` through computation, so logic stays
  unit-testable (see §19)

---

## 19. Clean Code & Maintainability

The backend is optimized for **ease of refactor, update, and modification**.
Working code that is hard to change is still a defect — spaghetti is not tolerated
even when it passes tests. Every change is judged on whether the next contributor
can safely modify it.

**Standards:**

- **One responsibility per unit.** Keep pure logic (streak math, parsing,
  normalization, filter building) in small named functions; keep I/O (DB, headers,
  auth) in the route handler. Mixing the two is the most common source of rot here.
- **Dependency injection over hidden coupling.** When a computation needs data,
  inject a value or a narrow loader function rather than a `tx`/`DbClient`. This
  keeps the core pure, bounded, and testable (see `computeCurrentStreak` in
  `habits.route.ts`, which takes a `loadCompleted` callback, not a transaction).
- **Bound the work.** Prefer algorithms whose cost scales with the result size,
  not full table/history scans. Parallelize independent queries with `Promise.all`.
  Use Postgres `ON CONFLICT` for upserts instead of select-then-write round trips.
- **DRY across domains.** Shared logic lives in exactly one place. Cross-domain
  imports are allowed in the dependency direction that already exists (e.g. `inbox`
  may import from `tasks`); never copy logic to avoid an import.
- **Descriptive, single-purpose files.** Follow §4 naming. No `helpers.ts`/
  `utils.ts`/`misc.ts` grab-bags. A new utility gets a name that states its job
  (`task-nlp.ts`, `note-analysis.ts`, `task-filters.ts`).
- **Self-documenting structure.** UCURD ordering (§2.4), explicit types over
  `any` (use the `Tx` alias for transactions), and short comments that explain
  *why*, not *what*.
- **Leave it more refactorable than you found it.** Prefer extraction over
  in-lining when a handler grows; if a route file gets large, split domain logic
  into `{domain}.service.ts` (§5).

If you cannot easily describe where a piece of logic lives and why, restructure it
until you can.

---

## 20. Checklist for New Backend Work

1. Identify the domain → `src/domains/{domain}/`
2. Add/update Zod schema → `{domain}.schema.ts`
3. Update Drizzle schema if persistence changes → `src/db/schema.ts`
4. Generate + check migration → `pnpm db:generate && pnpm db:check`
5. Add/update route with `apiValidator()` → `{domain}.route.ts`
6. Use `getDbClient(c.env)` + `withRls(db, userId, fn)`
7. Add `assertOwnership` checks for nested/relational resources
8. Support `Idempotency-Key` header on write endpoints
9. Return `{ data: ... }` response envelope
10. Add tests → `tests/unit/` and/or `tests/contracts/`
11. Update debug seed fixtures if new entity types are added
12. Run `pnpm check` (typecheck + all tests)

If a proposed change conflicts with this document, treat this document as the backend operating baseline.
