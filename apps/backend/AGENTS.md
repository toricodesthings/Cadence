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
│   ├── metrics.ts              # Silent task metric tracking helpers
│   ├── ownership.ts            # Cross-entity ownership validation
│   ├── request-log.ts          # Request context + structured logging
│   ├── rls.ts                  # RLS helpers (setRlsContext, withRls)
│   └── validation.ts           # apiValidator() wrapper for @hono/zod-validator
├── domains/                    # Product capabilities, one folder per domain
│   ├── tasks/                  # tasks.route.ts, tasks.schema.ts, task-filters.ts, ...
│   ├── habits/                 # habits.route.ts, habits.schema.ts
│   ├── inbox/                  # inbox.route.ts, inbox.schema.ts
│   ├── projects/               # projects.route.ts, projects.schema.ts
│   ├── tags/                   # tags.route.ts, tags.schema.ts
│   ├── subtasks/               # subtasks.route.ts, subtasks.schema.ts
│   ├── sections/               # sections.route.ts, sections.schema.ts
│   ├── settings/               # settings.route.ts, settings.schema.ts, settings-defaults.ts
│   ├── notes/                  # notes.route.ts, notes.schema.ts
│   ├── events/                 # events.route.ts, events.schema.ts
│   ├── suggestions/            # suggestions.route.ts, suggestions.schema.ts
│   ├── health/                 # health.route.ts
│   ├── proxy/                  # proxy.route.ts, proxy.schema.ts
│   ├── debug/                  # debug.route.ts, debug-seed.ts, scenarios/
│   └── ai/                     # (reserved — no public endpoints yet)
├── db/
│   └── schema.ts               # Drizzle schema: tables, enums, indexes, relations
├── cron/
│   └── overdue-check.ts        # Scheduled overdue metric updates + mutation dedup pruning
└── types/
    └── env.ts                  # Worker environment bindings type (Env)
```

### Key Principles

| Principle | Rule |
|---|---|
| **Domain ownership** | Each domain folder owns its routes, schemas, and utilities. |
| **Platform is shared** | `src/platform/` holds only cross-cutting infrastructure. |
| **Schema is Drizzle** | `src/db/schema.ts` is the single source of truth for all tables and enums. |
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

Cadence uses **Zod 4** (`^4.3.6`). Key differences from Zod 3:

- **No `.deepPartial()`.** A custom recursive `deepPartial()` utility exists in `src/domains/settings/settings.schema.ts`.
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

1. Add/update its Zod schema → `src/domains/{domain}/{domain}.schema.ts`
2. Add/update route handlers → `src/domains/{domain}/{domain}.route.ts`
3. If the route file grows large, extract domain logic into `{domain}.service.ts`
4. Update Drizzle schema if persistence changes → `src/db/schema.ts`
5. Add tests → `tests/unit/` or `tests/contracts/`

### Adding a new domain

1. Create `src/domains/{domain}/`
2. Create `{domain}.route.ts` and `{domain}.schema.ts`
3. Mount the route in `src/index.ts` under `/api/v1/{domain}`
4. Add contract tests in `tests/contracts/`

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

```typescript
// Database client type
type DbClient = ReturnType<typeof getDbClient>;

// Transaction type (preserves full schema inference)
type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
```

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
| Debug | `/api/v1/debug` | Clear + seed (non-production only) |

**`AppType`** is exported from `src/index.ts` for Hono RPC — treat it as a critical integration boundary.

---

## 10. Domain Model

The Drizzle schema (`src/db/schema.ts`) is the source of truth.

### Tables (22 total)

**Identity:** `users`, `userMetrics`

**Tasks ecosystem:** `projects`, `taskSections`, `tasks`, `subtasks`, `tags`, `taskTags`, `taskMetrics`, `taskNotes`, `taskNlpMetadata`, `taskNlpMetadataHistory`

**Inbox:** `inboxItems`, `inboxSections`

**Habits:** `habits`, `habitLogs`, `habitTags`

**Intelligence:** `aiMemories`, `suggestions`, `usageEvents`, `savedFocusViews`

**Infrastructure:** `mutationDedup`

### Enums (8 pgEnums)

`targetModeEnum`, `captureKindEnum`, `captureStatusEnum`, `analysisStatusEnum`, `confidenceTierEnum`, `sourceSurfaceEnum`, `suggestionTypeEnum`, `focusViewSourceEnum`

### FK Cascades

- `taskTags`, `taskNotes`, `taskMetrics`, `subtasks`, `taskNlpMetadata`, `taskNlpMetadataHistory` → cascade from `tasks`
- `habitTags` → cascade from `habits` + `tags`
- `savedFocusViews` → cascade from `users` only

### Settings

`UserSettingsSchema` (canonical Zod schema) lives in `src/domains/settings/settings.schema.ts` and is re-exported from `src/db/schema.ts`. Notification preferences (`browser`, `taskReminders`, `habitReminders`, `dueDateAlerts`) are required fields. The PATCH endpoint uses a custom `deepPartial()` utility for partial updates.

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

- Use `console.error` for failures
- Use `console.warn` for warnings
- Use `console.info` or `console.log` sparingly for useful operational context
- Do not add noisy success logs
- Log enough context to debug, but never leak internal error details to clients

Cloudflare Observability captures console output — prefer signal over noise.

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
- Return raw stack traces or SQL details to clients
- Use `drizzle-kit push` or destructive migration commands
- Expand public AI surface unless explicitly scoped
- Create unversioned routes (everything under `/api/v1/`)

---

## 19. Checklist for New Backend Work

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
