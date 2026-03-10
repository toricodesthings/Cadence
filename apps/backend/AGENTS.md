# Cadence Backend - Agent Instructions

> **Read this before modifying anything in `apps/backend`.** This file is the current operating manual for the Cadence backend.

## 0. Mission

Cadence backend is a **standalone Cloudflare Worker API** built with **Hono** and backed by **Neon Postgres** through **Cloudflare Hyperdrive**.

It is the shared backend for the Cadence clients and must remain:

- **Platform-neutral**
- **Edge-safe**
- **Schema-driven**
- **Parity-first across web and mobile**

If you break a route contract, validation schema, or response shape, you can break multiple clients at once.

---

## 1. Core Non-Negotiables

### 1.1 Universal API Rules

- **Never create platform-specific endpoints.**
- **Never use cookies, server actions, or framework-coupled session state.** Auth is always `Authorization: Bearer <JWT>`.
- **Always preserve 1:1 client parity.** If the web app needs it, the mobile app should be able to consume the same API pattern.
- **Do not casually change route shapes.** The backend exports shared contract types across the monorepo.

### 1.2 Runtime Rules

- This code runs on **Cloudflare Workers**.
- **Do not cache a DB client globally.** Reusing shared I/O pipelines across requests is unsafe in Workers.
- Always create the database client **per request** via `getDbClient(env)`.
- Use **pnpm** for all development commands.

### 1.3 Security Rules

- **JWT verification is mandatory** for all protected routes.
- **RLS context is mandatory** before user-scoped queries.
- **Validation is mandatory** for params, query strings, and JSON bodies.
- **Never trust client ownership fields.** `userId` comes from auth context only.
- **Never return raw internal errors** to clients.

---

## 2. Current Backend Scope

The backend now supports substantially more than the original task/project CRUD layer.

### Public / product-facing domains

- Tasks
- Projects
- Tags
- Inbox items
- Inbox sections
- Task sections
- Subtasks
- Habits
- Habit log hydration for weekly/monthly views
- User settings
- Health checks
- Debug seed/clear helpers

### Internal / infrastructure domains

- User sync from Neon Auth
- Task metrics for silent tracking
- Overdue-task cron processing
- `user_metrics` for future adaptive intelligence
- `ai_memories` for future AI memory/RAG workflows

### Important product-state note

AI-related tables exist in the schema, but there are **no public AI endpoints yet**. Treat them as internal scaffolding unless the task explicitly expands that surface.

---

## 3. Current Tech Stack

- **Runtime:** Cloudflare Workers
- **Router:** Hono v4
- **Validation:** Zod + `@hono/zod-validator`
- **ORM / SQL layer:** Drizzle ORM + `postgres`
- **Database:** Neon Postgres
- **Connection layer:** Cloudflare Hyperdrive
- **Auth:** Neon Auth JWTs verified through `jose`
- **Scheduling:** Cloudflare cron triggers
- **Recurrence:** `rrule`
- **Date helpers:** `date-fns`

---

## 4. Source Layout

```text
src/
├── index.ts              # Worker entry, middleware chain, route mounting, AppType export
├── cron/
│   └── overdue-check.ts  # Scheduled metric updates for overdue tasks
├── db/
│   └── schema.ts         # Drizzle schema, enums, indexes, relations, JSON schemas
├── lib/
│   ├── auth.ts           # Bearer auth middleware + background user sync
│   ├── db.ts             # Per-request DB client creation
│   ├── errors.ts         # AppError + shared error formatting
│   ├── metrics.ts        # Silent task metric tracking helpers
│   └── rls.ts            # RLS helpers (`setRlsContext`, `withRls`)
├── routes/
│   ├── debug.ts
│   ├── habits.ts
│   ├── health.ts
│   ├── inbox.ts
│   ├── projects.ts
│   ├── sections.ts
│   ├── settings.ts
│   ├── subtasks.ts
│   ├── tags.ts
│   └── tasks.ts
└── types/
    ├── auth.ts
    ├── common.ts
    ├── env.ts
    ├── habit.ts
    ├── inbox.ts
    ├── project.ts
    ├── subtask.ts
    ├── tag.ts
    └── task.ts
```

---

## 5. Runtime Architecture

### 5.1 Entry Point Responsibilities

`src/index.ts` is the composition root. It currently applies:

1. `secureHeaders()` globally
2. `logger()` globally
3. CORS with localhost + Cadence allowlist
4. shared `onError()` handling
5. public `/health`
6. rate limiting for `/api/*`
7. auth middleware for `/api/*`
8. route registration for all protected domains
9. scheduled cron handling via `handleOverdueCheck()`

### 5.2 Mounted Route Roots

Protected routes currently mount as:

- `/api/tasks`
- `/api/projects`
- `/api/inbox`
- `/api/tags`
- `/api/habits`
- `/api` for shared subtask paths
- `/api/sections`
- `/api/settings`
- `/api/debug`

### 5.3 Shared Contract Export

`AppType` is exported from `src/index.ts`. Treat it as a critical integration boundary.

---

## 6. Standard Request Lifecycle

Protected requests should be understood in this order:

1. Request enters the Worker.
2. Secure headers and logging middleware run.
3. CORS allowlist is evaluated.
4. Rate limiting runs on `/api/*` using `cf-connecting-ip`.
5. Auth middleware verifies the Bearer JWT against Neon Auth JWKS.
6. `userId` is attached to the Hono context.
7. Write requests schedule background user sync with `executionCtx.waitUntil()`.
8. Route-level `zValidator` checks params/query/body.
9. Route creates a per-request DB client via `getDbClient(c.env)`.
10. Route executes scoped DB work with RLS enabled.
11. Route returns JSON, usually `{ data: ... }`.

---

## 7. Database Access Rules

### 7.1 Per-request DB clients only

Use `getDbClient(c.env)` inside route handlers.

Do **not**:

- create a singleton Drizzle client
- reuse a cached `postgres` connection across requests
- move DB I/O to module scope for “performance”

Hyperdrive handles pooling. The local client must stay request-scoped.

### 7.2 RLS rules

Preferred pattern for new work:

- `withRls(db, userId, async (tx) => { ... })`

Why:

- it sets `request.jwt.claims`
- it guarantees the config and query execute on the same transactional connection
- it is safer for multi-step handlers

`setRlsContext(db, userId)` still exists and is used in some simpler/older routes. For new multi-query work, prefer `withRls()`.

### 7.3 Ownership rules

- Always scope user-owned records by `userId`.
- Always verify parent ownership for nested resources.
  - Subtasks must confirm the parent task belongs to the authenticated user.
  - Task-tag association must validate both the task and the tag belong to the user.

---

## 8. Domain Model Snapshot

The Drizzle schema is the source of truth.

### 8.1 Identity / preferences

- `users`
  - primary key mirrors Neon Auth `sub`
  - stores JSON `settings`
  - is synced automatically on authenticated write traffic

### 8.2 Tasks ecosystem

- `projects`
- `task_sections`
- `tasks`
- `subtasks`
- `tags`
- `task_tags`
- `task_metrics`

Task records currently support:

- project assignment
- section assignment
- rich text content/notes
- all-day vs scheduled blocks
- due dates
- scheduled start/end windows
- duration estimate
- timezone locking
- priority
- pinning
- reminders
- recurrence rules
- waiting metadata
- effort scoring
- `notBefore`
- completion/archive states

Task state enum is currently:

- `ACTIVE`
- `WAITING`
- `COMPLETE`
- `ARCHIVED`

### 8.3 Inbox ecosystem

- `inbox_items`
- `inbox_sections`

Inbox is currently raw capture + organization. Public AI parsing is not exposed yet.

### 8.4 Habit ecosystem

- `habits`
- `habit_logs`

Habits support:

- RRULE recurrence
- optional target time
- reminder enablement
- archived state
- notes and description
- aggregate tracking (`totalCompletions`, `totalSkips`, `currentStreak`, `longestStreak`)

### 8.5 Internal / future intelligence tables

- `user_metrics`
- `ai_memories`

These are real schema entities, but not active public API domains.

---

## 9. Current Route Inventory

### 9.1 Public routes

- `GET /health`

### 9.2 Tasks

- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `PATCH /api/tasks/:id/reorder`
- `PATCH /api/tasks/batch/state`
- `POST /api/tasks/batch/reschedule`
- `POST /api/tasks/:id/duplicate`
- `GET /api/tasks/:id/tags`
- `POST /api/tasks/:id/tags`
- `DELETE /api/tasks/:id/tags/:tagId`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `DELETE /api/tasks/:id`

Task list filtering currently supports:

- `state`
- `projectId`
- `scheduledDate`
- `scheduledRangeStart`
- `scheduledRangeEnd`
- `priority`
- `isPinned`
- `effort`
- `notBeforeBefore`
- `hasNoDate`
- `limit`
- `offset`

### 9.3 Projects

- `POST /api/projects`
- `PATCH /api/projects/:id`
- `GET /api/projects`
- `GET /api/projects/:id`
- `DELETE /api/projects/:id`

### 9.4 Tags

- `POST /api/tags`
- `PATCH /api/tags/:id`
- `GET /api/tags`
- `GET /api/tags/:id`
- `DELETE /api/tags/:id`

### 9.5 Inbox

- `POST /api/inbox`
- `GET /api/inbox`
- `PATCH /api/inbox/:id`
- `DELETE /api/inbox/:id`
- `POST /api/inbox/sections`
- `GET /api/inbox/sections`
- `PATCH /api/inbox/sections/:id`
- `DELETE /api/inbox/sections/:id`

### 9.6 Subtasks

- `GET /api/tasks/:taskId/subtasks`
- `POST /api/tasks/:taskId/subtasks`
- `PATCH /api/subtasks/:id`
- `PATCH /api/subtasks/:id/reorder`
- `DELETE /api/subtasks/:id`

### 9.7 Task sections

- `GET /api/sections`
- `POST /api/sections`
- `PATCH /api/sections/:id`
- `DELETE /api/sections/:id`

### 9.8 Habits

- `POST /api/habits`
- `GET /api/habits`
- `GET /api/habits/unresolved`
- `GET /api/habits/weekly`
- `GET /api/habits/:id`
- `GET /api/habits/:id/monthly`
- `PATCH /api/habits/:id`
- `POST /api/habits/:id/resolve`
- `DELETE /api/habits/:id`

### 9.9 Settings

- `GET /api/settings`
- `PATCH /api/settings`

### 9.10 Debug

- `POST /api/debug/clear`
- `POST /api/debug/seed`

These are utility/debug routes. Do not expand them casually.

---

## 10. Validation and Type Rules

### 10.1 Zod is mandatory

Every externally reachable input surface must be validated:

- params
- query
- JSON body

### 10.2 Type organization

Default rule:

- Put reusable schemas and exported types in `src/types/`.

Current codebase note:

- Most reusable schemas already live in `src/types/`.
- Some route-local schemas still exist in a few route files.
- **Do not add new reusable schemas inline.** If you touch an area deeply, prefer moving reusable validation into `src/types/`.

### 10.3 `any` is not allowed in new work

If you encounter existing loose typing, tighten it when reasonable and safe.

---

## 11. Response Conventions

### 11.1 Success payloads

Primary convention:

```json
{ "data": ... }
```

### 11.2 Mutation payloads

As a rule, mutations should return the full updated entity or primary updated resource.

Examples in the current backend:

- CRUD routes generally return the created/updated/deleted row
- habit resolution returns both the updated habit and the resolved log
- some older routes still return `{ success: true }`; preserve compatibility unless the task explicitly changes it

### 11.3 Error payloads

Use `AppError` for expected failures such as:

- `NOT_FOUND`
- `UNAUTHORIZED`
- related domain errors

Global formatting is handled through `formatErrorResponse()`.

---

## 12. Caching and Performance Patterns

### 12.1 Current caching pattern

Several read-heavy routes set:

`Cache-Control: private, max-age=0, stale-while-revalidate=5`

Preserve that pattern when extending similar endpoints.

### 12.2 Query patterns

- Prefer indexed filters already represented in schema.
- Respect existing sort/order behavior expected by clients.
- Avoid N+1 query patterns when a join or relation query is clearer.

### 12.3 Ordering pattern

Tasks and subtasks use numeric `orderIndex` values for drag-and-drop reordering.

Do not replace this with naive renumbering unless the task explicitly requires it.

---

## 13. Auth Implementation Details

`src/lib/auth.ts` currently:

- reads `Authorization`
- enforces `Bearer`
- loads JWKS from `NEON_AUTH_JWKS_URL`
- caches the remote JWK set by URL
- retries transient JWKS/network failures with short exponential backoff
- attaches `userId` from JWT `sub`
- asynchronously syncs the user row on write requests with `executionCtx.waitUntil()`

When modifying auth:

- preserve Bearer-token compatibility
- preserve background user sync unless intentionally redesigning it
- do not introduce cookies or framework session dependencies

---

## 14. Background Jobs and Silent Tracking

### 14.1 Cron

`wrangler.jsonc` currently schedules:

- `0 6 * * *`

The Worker calls `handleOverdueCheck(env)` from `src/cron/overdue-check.ts`.

### 14.2 Current overdue behavior

The cron job:

- finds overdue tasks with `state = ACTIVE`
- checks `dueDate < now`
- increments `task_metrics.delay_count`

### 14.3 Task metrics helpers

`src/lib/metrics.ts` currently tracks:

- reschedule count
- first scheduled timestamp
- completion timestamp
- created-to-done duration

This is internal product intelligence, not a public analytics API.

---

## 15. Logging Rules

- Use `console.error` for failures.
- Use `console.warn` for warnings.
- Use `console.info` or `console.log` sparingly for useful operational context.
- Do not add noisy success logs everywhere.
- Log enough context to debug, but never leak internal error details to clients.

Cloudflare Observability captures console output, so prefer signal over noise.

---

## 16. Best Practices for Route Files

### 16.1 Keep routes thin

Handlers should primarily:

1. validate input
2. read `userId`
3. create a DB client
4. execute or delegate scoped DB work
5. shape the response

Move repeated logic into `src/lib/`.

### 16.2 Prefer clean functions

- One function = one job
- Prefer 3–4 parameters max
- Use typed object params when argument count grows

### 16.3 Prefer consistent logical ordering

When practical, organize route helpers and handler chains as:

1. utility helpers
2. create
3. update
4. read
5. delete

### 16.4 Preserve API compatibility

Do not “clean up” field names, routes, or shapes unless the task explicitly includes coordinated client updates.

---

## 17. Best Practices for Schema Changes

When touching `src/db/schema.ts` or migrations:

- keep Drizzle schema as source of truth
- add indexes for new high-frequency lookup paths
- think through RLS and ownership implications
- update related Zod schemas in `src/types/`
- return newly relevant fields from mutations if clients need them for optimistic reconciliation

Also remember:

- `drizzle.config.ts` loads `.dev.vars`, not `.env`
- migrations output to `apps/backend/drizzle`
- management DB access comes from `MANAGEMENT_DATABASE_URL`

---

## 18. Environment and Bindings

Current backend bindings include:

- `HYPERDRIVE`
- `NEON_AUTH_JWKS_URL`
- `RATE_LIMITER`

Current worker configuration also includes:

- Hyperdrive binding
- Cloudflare native rate limiting
- cron trigger
- `compatibility_date`
- `nodejs_compat`

When adding config:

- prefer Worker bindings
- keep development compatible with `.dev.vars`
- keep secrets in bindings/secrets, not ad hoc files

---

## 19. Package Commands

From `apps/backend`:

- `pnpm dev`
- `pnpm deploy`
- `pnpm cf-typegen`
- `pnpm typecheck`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:studio`

After backend code changes, prefer running the backend typecheck at minimum.

---

## 20. Anti-Patterns to Avoid

Do not:

- add platform-only endpoints
- add auth paths that bypass JWT verification
- skip Zod validation
- trust client `userId`
- share DB clients globally
- introduce Node-only APIs unnecessarily
- duplicate query logic across route files
- define large reusable schemas inline in route modules
- return raw stack traces or SQL details to clients
- expand public AI automation scope unless the task explicitly requires it

---

## 21. What to Preserve When Editing

Unless the task explicitly says otherwise, preserve:

- the universal API model
- Hono RPC compatibility through `AppType`
- per-request DB client creation
- RLS-first query flow
- Bearer JWT auth
- response shape compatibility
- optimistic-UI-friendly mutation payloads
- task/habit ordering and recurrence behavior

---

## 22. Default Checklist for New Backend Work

1. add or update Zod schema in `src/types/`
2. update Drizzle schema only if persistence changes
3. add or update route with `zValidator`
4. use `getDbClient(c.env)`
5. prefer `withRls()` for user-scoped DB work
6. enforce ownership checks for nested resources
7. return a client-friendly payload
8. preserve cross-client compatibility
9. run backend typecheck

If a proposed change conflicts with this document, treat this document as the backend operating baseline.

