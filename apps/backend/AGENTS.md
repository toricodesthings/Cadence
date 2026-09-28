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
| AI | Vercel AI SDK (`ai` v7); `@openrouter/ai-sdk-provider` for chat, titles and embeddings; Upstash Redis (`@upstash/redis/cloudflare`) for stream resumption |
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
│   ├── errors.ts     # AppError (code: contract `ErrorCode`), createErrorBody (→ `ApiError`), throwIfNotFound, formatErrorResponse
│   ├── validation.ts # apiValidator() wrapper
│   ├── idempotency.ts, ownership.ts, metrics.ts, log.ts, request-log.ts, redis.ts, date-utils.ts
├── domains/           # tasks, habits, inbox, projects, tags, subtasks, sections, settings,
│                       # notes, events, health, proxy, ai, mcp, debug — one folder each
├── db/schema.ts       # Drizzle schema: tables, enums, indexes, RLS policies, relations (SOURCE OF TRUTH)
├── cron/overdue-check.ts
└── types/             # env.ts (Env bindings), db.ts (DbClient/Tx aliases), text-modules.d.ts (.md imports)
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

- **New feature in existing domain:** contract in `@cadence/contracts/{domain}` → route handler → Drizzle schema + matching `xRowSchema` if persistence changed → tests in `tests/unit/` or `tests/integration/`.
- **New domain:** author contract (`packages/contracts/src/{domain}.ts` + sub-path export) → `{domain}.route.ts` importing shapes directly from `@cadence/contracts/{domain}` (chained router) → mount in `src/index.ts` on the chained `apiApp` → Row-parity line in `tests/unit/contract-parity.test.ts` + schema tests in `packages/tests/contracts` + `tests/integration/{domain}.test.ts`. Read routes return the contract entity (narrow loose columns in one mapper, like `toTask`), and each gets a line in the frontend's `rpc-parity.test.ts`.
- **Platform infra:** only genuinely cross-cutting code (auth, db, rls, errors, logging, validation, idempotency, ownership, metrics, redis).

## 4. Request Lifecycle

`createRequestContext` (request ID) → `secureHeaders()` → body size limit (100KB, `/api/v1/*`; the two photo uploads, background and chat image, are exempt and capped on their own routes) → CORS allowlist → debug-route guard (404 in production, or unless `ENABLE_DEBUG_ROUTES=true`) → Tier-1 IP rate limit (pre-auth) → JWT auth (`userId` attached) → Tier-2 user rate limit (read/write) → Tier-3 admin rate limit (`/api/v1/debug/*`) → `apiValidator()` → handler: `getDbClient(c.env)` → `withRls(db, userId, fn)` → `{ data: ... }`.

The MCP origin is a separate boundary, dispatched in the Worker's `fetch` before the Hono app (`isMcpRequest`: the `MCP_ORIGIN` host and `/mcp`, `/authorize`, `/oauth/*`, `/.well-known/oauth-*`): Tier-1 IP limit (plus per-IP `RATE_LIMITER_WRITE` on `/oauth/register`, `RATE_LIMITER_ADMIN` on `/authorize`; `/favicon.ico` redirects to the app's) → `@cloudflare/workers-oauth-provider` (discovery, DCR/CIMD, token, revocation, bearer check on `/mcp`) → `serveMcp`. No app JWT, CORS or `{ data }` envelope there.

Uncaught errors → `formatErrorResponse()`: extracts `AppError` code/message, attaches request ID, never leaks stack traces/SQL.

## 5. Database Rules

- **Timestamps:** every `timestamp with time zone` column is declared with the `timestamptz()` helper in `schema.ts`, which reads values as strict ISO (`2026-03-09T12:00:00.000Z`). Never use drizzle's `timestamp()` directly, or that column goes out as Postgres text. Integration tests fail on any non-ISO date-time in a response.
- **Per-request clients only.** `const db = getDbClient(c.env)`. Never a module-scope singleton — Hyperdrive pools connections, Workers don't hold them.
- **RLS is mandatory** for user-scoped work: `withRls(db, userId, async (tx) => { ... })`. Sets `request.jwt.claims`; guarantees same connection for config+query. Policies compare against `rlsUserId` in `schema.ts` (a `(select …)` Postgres evaluates once per query, not per row); never inline `current_setting` in a policy.
- **Type aliases:** import `DbClient`/`Tx` from `src/types/db.ts` — never redefine `Parameters<Parameters<DbClient["transaction"]>[0]>[0]` inline.
- **Ownership:** `assertProjectOwnership`/`assertSectionOwnership`/`assertTagsOwnership`/`assertOwnership` in `platform/ownership.ts`. Another user's row is invisible under RLS, so it resolves as 404 (existence never leaks); the 403 branch only fires if RLS is bypassed. Task writes validate the section against the effective list; moving lists without a section clears the old section.
- **Migrations:** update `schema.ts` → `pnpm db:generate` → `pnpm db:check` → `pnpm db:migrate`. Never `drizzle-kit push`. `drizzle.config.ts` reads `.dev.vars`; migrations output to `apps/backend/drizzle/`.

## 6. API Conventions

- All app routes under `/api/v1/`. Auth is always `Authorization: Bearer <JWT>` — never cookies/sessions. The one exception is the MCP origin (§9b): OAuth/MCP standards fix its paths, and its short-lived `__Host-` cookies only bind a consent flow to one browser.
- Success envelope: `{ "data": {...} }` everywhere, including health/debug. Errors: the contract `ApiError` (`{ "error": { code, message, status, isRetryable, requestId, issues? } }`) via `AppError`; codes come from `ERROR_CODES` in `@cadence/contracts/common`. Task responses always carry `tagIds` (`toTask`/`withTagIds` in `tasks.service.ts`).
- **Idempotency:** `Idempotency-Key` header — `getIdempotencyKey(c)` → `checkIdempotency(tx, userId, key)` (no-op if undefined; holds a transaction lock on the key so a concurrent retry waits, then sees the record) → mutate → `recordMutation(tx, userId, key)`. Supported on all POST endpoints in tasks/habits/inbox/projects/tags/subtasks/sections.
- Read-heavy routes: `Cache-Control: private, max-age=0, stale-while-revalidate=5`.

## 7. Mounted Routes

Public: `GET /health`. Protected (all `/api/v1/`):

| Domain | Mount | Notes |
|---|---|---|
| tasks | `/tasks` | CRUD, reorder, batch state/reschedule/delete (≤50 ids; reschedule to a value, or to a local `date` keeping each task's time), duplicate, tag associations. Lists have no default limit; Done and Trash come newest first so their pages can send one |
| projects, tags, sections | `/projects`, `/tags`, `/sections` | CRUD |
| inbox | `/inbox` | items + sections CRUD; clarifying or kept reads, stable newest first; atomic process/complete + unprocess Undo |
| subtasks, notes | nested under `/tasks/:taskId/*` + standalone PATCH/DELETE; `GET /subtasks?taskIds=a,b` (≤200) reads many tasks' subtasks, `POST /subtasks/bulk` stays for older desktop builds |
| habits | `/habits` | CRUD, resolve (streak in the caller's `timezone`; skipped days are neutral, never a break; a routine with `steps` can send `stepStatus` and the day's status follows from it via `stepDayStatus`, a partial day kept as PENDING), `/weekly` range view (any start/end: logs per due day from the day before creation, earlier days only when logged; a pause hides today onward, never the past) |
| settings | `/settings`, `/settings/background` | GET + PATCH (deep-merge via `deepPartial`); background = one photo per user in R2 (`USER_ASSETS`): POST upload (WebP-only, metadata stripped), GET own image, DELETE |
| events | `/events` | single + batch usage tracking |
| proxy | `/proxy` | proxied external calls: weather, reverse/forward geocoding, approximate location (`GET /geo/approximate` from Cloudflare `request.cf`), holidays. Coordinates are rounded to 2 decimals before any upstream call. |
| debug | `/debug` | clear + seed (non-prod only) |
| connections | `/connections` | connected assistants (MCP): `GET /` active ones with a live KV grant (rows under 10 minutes old always show), `DELETE /:id` Disconnect; the consent page's `GET /requests/:request`, `POST …/approve` (scopes + browser zone → callback URL) and `POST …/decline` |
| ai | `/ai`, `/ai/images` | `POST /chat` (streamed, persisted; a new message or approval answers), conversation CRUD (delete takes its images), `GET /usage`; images: `POST /` upload (WebP-only, 1MB, dedup per user + conversation), `POST /:id/report`, `GET /:id` own image, `DELETE /:id` while unsent |

`AppType` (exported from `src/index.ts`) is the RPC contract the frontend types against — treat as a critical integration boundary.

## 8. Domain Model

`src/db/schema.ts` is truth: **27 tables**, **14 pgEnums**. Groups: identity (`users`, `userMetrics`) · tasks ecosystem (`projects`, `taskSections`, `tasks`, `subtasks`, `tags`, `taskTags`, `taskMetrics`, `taskNotes`, `taskNlpMetadata`, `taskNlpMetadataHistory`) · inbox (`inboxItems`, `inboxSections`) · habits (`habits`, `habitLogs`, `habitTags`) · intelligence (`aiMemories`, `suggestions`, `usageEvents`, `savedFocusViews`, `notificationState`) · AI assistant (`aiConversations`, `aiMessages`, `aiImages`) · connected assistants (`mcpConnections`) · infra (`mutationDedup`).

**Settings:** the contract's `userSettingsSchema` types the `users.settings` column; reads return `normalizeSettings` → `SettingsView` (stored over defaults). `settings.appearance.backgroundImage` is server-owned: `sanitizeBackgroundPatch` (`domains/settings/background-image.ts`) lets a PATCH change only accent/blur/brightness, never the photo's identity or existence. Notification fields (`browser`, `taskReminders`, `habitReminders`, `dueDateAlerts`) are required. `settings.assistant`: `persona` is the one voice setting (it picks `prompt/blocks/voice/<persona>.md`); `tone` and `verbosity` stay for back-compat but never reach the prompt; the rest (names, emoji, proactiveSuggestions, adaptiveTone) render into the prompt's Environment. Free-text fields (names, customInstructions) are sanitized + fenced before composition — never trust them raw in a prompt.

## 9. AI Domain (`src/domains/ai`)

- `ai.route.ts` — `POST /chat` streams a turn via `createAgentUIStream`/`createUIMessageStream` (AI SDK v7), persists messages, supports resumable streams and `stopStream`. A request carries a new user message or `approvals`: answers are applied to the stored last reply (`applyApprovals`, never a client copy) and the SDK runs what was approved, then the same reply continues. Replayed history turns open calls into declined ones (`settleUnanswered`). The agent builds alongside the turn's persistence, not after it. Each turn logs one `ai_turn` info line from `onEnd` (model, outcome, steps, tool calls, tokens, tokens/sec; `setupMs`, `ttftMs`, `firstTextMs`, `totalMs` all counted from the request's arrival). Conversation CRUD (`GET/PATCH/DELETE /conversations[/:id]`); `DELETE /conversations/archived` clears the archive (images from storage first), registered before `/:id`.
- `agent.ts` — model/agent construction (`getAgentInstance`, `getModelId`, reasoning effort `REASONING_EFFORT`); no temperature override (provider default); stamps each assistant message's metadata with `promptHash` (prompt blocks + help files + tool names/descriptions/schemas). Writes execute on the server; `toolApproval` (`safety/approval.ts` `approvalFor`) decides which wait for a tap: Ask every write, Auto only `needsTap` (permanent deletes: any `delete_*` tool, removing subtasks, whole-note rewrites, more than 5 tasks or captures), Full none; reads and `capture_to_inbox` never. Approvals are HMAC-signed with `TOOL_APPROVAL_SECRET`, so an edited or forged one fails closed. History passes through `dropUnsignedReasoning` (`persistence/message-mapper.ts`) before replay, so unsigned reasoning summaries never reach the provider.
- **Prompts are files, git is the only source:** system-prompt blocks are `prompt/blocks/{base,voice,user}/*.md` (order in `prompt/prompt-blocks.ts`), the title prompt is `title/title-prompt.md`. Edit and push; the deploy ships them. `.md` imports as text (wrangler `rules` + the vitest `md-text` plugin). `composePrompt` order is static → per-user → per-turn for caching: base sections · voice (+ `workload-high.md` when adaptive tone and burnout > 70) · custom instructions · Environment (names, emoji, approval mode from the chat request, workload, zone, minute-precision clock) · Today at a glance (`loadSnapshot` in `agent.ts`: today's schedule, overdue, routines, newest captures and events within 7 days, read through the read tools with small caps before the model starts) · memory. Only raw user values (names, custom instructions, snapshot, memory) are fenced; instructions never are. An unknown `{{placeholder}}` throws — the composer tests catch it.
- **Cadence guide:** `help/*.md` (one file per topic) served by the read-only `get_cadence_help` tool (`tools/help.ts`, topic enum). Links are in-app only: routes, `?settings=<tab>`, or ids from tool results. The guide and primer call projects Lists and document Capture completion, notes, ordering and Undo. A user-visible change that makes a help file or the primer (`blocks/base/cadence-primer.md`) wrong edits it in the same change; `tests/unit/ai-help.test.ts` checks every link against the known routes and Settings tabs.
- `tools/` — one file per callable surface: `tasks` (filters by tag, section, priority, pin, local date range and a saved focus view, sorted by priority, list order or date; reminder, Waiting check-in, hide-until and Fixed in drafts and patches; copy via `duplicateTask`, list order via `reorderTasks`, step order in `edit_subtasks`), `projects` (searchable, paged lists and sections; `sectionsMore` flags incomplete sections; a list is made with its sections, renamed, or deleted keeping or trashing its tasks; section create/rename/reorder/delete, a deleted section's tasks stay unsectioned), `tags` (searchable, paged; rename, delete), `habits` (paged reads with day times, colour, list, tags and adherence over the last 30 due days; `get_habit_history` sorts a range's due days into done/skipped/missed/partial/open through `habitDays` in `habits.service.ts`, the same days `/habits/weekly` shows; create/update/move/delete via `habits.service.ts`, shared with the routes; repeat rules limited to what the Routines picker shows; logging), `inbox` (paged; batch `structure_captures`, `update_captures` for note/discard/done/back to New via `unprocessCapture`, permanent `delete_captures`), `calendar` (the schedule window: dated one-offs matched on their local day in SQL plus expanded series, sorted, capped after expansion and paged), `events` (the /events page: `settings.calendar.personalEvents.items`, rewritten whole inside the transaction; dedup keyed to the user row), `focus-views` (saved views; stored definitions read leniently by `readFocusView`, which `get_tasks` also uses), `metrics`, `help`, plus `projections` (compact rows: default and null keys dropped) and `drafts` (write-tool task schemas picked from the task contracts; no `isAllDay`, it follows from the values; tags by name through `findOrCreateTags`). Tools read/write real user data through the same RLS-scoped path as routes — never bypass `withRls`; writes call the domain services (`{domain}.service.ts`, shared with the routes) in one transaction, keyed by the tool call id (`once`), with metrics after commit. Reads return open tasks unless a state is asked for, hide the note body past 1,000 characters, fence note text, and page: `more: true` with `nextOffset` when a cap cuts a list. Local-day windows use `localDaySql` (same rule as `taskLocalDay`), so pages stay exact. `buildToolRegistry` strips regex `pattern`s from the schemas the model sees (validation still uses the zod schema). Descriptions say what a tool does, returns and its limits; when to use it belongs in the prompt (`blocks/base/recipes.md` holds the common chains). History replay shrinks older turns' read rows to `{count, ids}` (`compactOldReads`).
- **Images (`images/`):** a turn carries `cadence-image:<uuid>` file parts only (`input-guard`: WebP references, ≤ `AI_IMAGES_PER_MESSAGE`, no filename), persisted as-is. Before `admit`, `resolveTurnImages` checks the ids are the caller's in this conversation (else 400 `IMAGE_NOT_FOUND`) and counts new sends; re-sends are free. After `compactOldReads`, `hydrateImages` turns images in the last 6 messages into data URLs (one R2 read each) and older or expired ones into a text stub; memory extraction and the saved reply keep the references. Objects live at `ai-images/{sha256(userId)}/{id}.webp` with no metadata; only the `ai_images` row links a user to one. The 24h image quota is one more dimension in the admit script (429 `AI_IMAGE_LIMITED`); 8 unsent uploads at most (429 `AI_IMAGE_PENDING_LIMIT`).
- **Time:** `userClock` (`agent.ts`) turns the client's instant + IANA zone into the turn's clock: the prompt gets local wall-clock time to the minute with offset and weekday, tools get `ctx.timezone` + `ctx.today` (the user's local date). Tools speak local: `toMinimalTask(row, tz)` writes timed values as `…T14:00:00-04:00` and all-day values as `YYYY-MM-DD`; day windows are local dates matched with `taskLocalDay` (query a day wider, filter exactly). Never slice a UTC timestamp for "today". `localDay`, `addDaysToDate` and `isPausedOn` come from `@cadence/domain/repeats`; server-only zone helpers (`toZonedIso`, `atLocalDate`, `resolveTimeZone`) live in `platform/date-utils.ts`.
- **Redis (`platform/redis.ts`, Upstash REST over HTTPS only):** `getRedis(env)` gates stream-resumption (in-flight SSE chunk log + abort flag) — returns `null` if unconfigured/insecure, and every resumption path must no-op gracefully on `null`. `getRateLimitRedis(env)` is a separate accessor for AI-specific rate limiting. Redis is a *cache*, never the source of truth — Postgres is. Built per-request (Workers rule), never a module global.

## 9b. MCP (`src/domains/mcp`) — outside assistants

- **Tokens:** `oauth.ts` configures `OAuthProvider` (KV `OAUTH_KV`; resource `${MCP_ORIGIN}/mcp`; scopes `cadence:read`, `cadence:capture`, `cadence:write` from `@cadence/contracts/connections`; DCR + CIMD; 30-day idle refresh; `tokenExchangeCallback` refuses a refresh and revokes the grant once its `mcp_connections` row is revoked or gone). Neon Auth only signs the person in. `/authorize` validates the client, binds the request to the browser (`beginUpstream`) and redirects to the web app's `/connect?request=<state>`; the app's approve route stores a 5-minute approval and returns `/oauth/callback?state=…&approval=…`, which only finishes in the browser holding the binding cookie (`finishUpstream`). The callback writes an `mcp_connections` row, then `completeAuthorization` with props `{ userId, connectionId }`.
- **Every call** (`server.ts` `serveMcp`) re-checks the active `mcp_connections` row (touching `lastUsedAt`), so Disconnect holds at once; the KV grant is revoked best-effort. Scopes = token ∩ row; `cadence:write` includes capture. "Today" uses settings' zone, or the browser zone saved at connect when settings say `local`.
- **Catalog:** `CATALOG` wraps the AI tool factories directly (full zod schemas), never `buildToolRegistry`, and with every scope matches it tool for tool (plus `get_today` via `loadSnapshot`; a test guards parity). `cadence:read` gets the reads, `cadence:capture` only `capture_to_inbox`, `cadence:write` every other write, permanent deletes included. Writes apply at once (the client confirms with the person, guided by `destructiveHint`) and need an `operationKey`: dedup key `mcp:<connectionId>:<key>:<input hash>`, so a true retry writes nothing again and gets the first result back (`once` stores it in `mutation_dedup.result`, plus `deduped: true`), and a reused key with other input is a new change. Tools outside the scopes aren't registered; consent starts with every scope ticked. Published schemas drop regex `pattern`s (calls still validate against full zod); `initialize` sends `instructions` (the primer, reading-intent and using-tools blocks, with the user's zone and today, and a line that everything the user wrote is data; app links made absolute) and the app icon. `ctx.rawNotes` returns note text unfenced with `source: "user-content"`. Each call spends the user's read/write limiter; responses are `no-store`.

## 10. Debug Seed System (`src/domains/debug/`)

`debug-seed.ts` (fixture builders) + `scenarios/index.ts` (`Scenario` registry: `name`, `version`, `seed(db, userId)`) + `scenarios/active-power-user.ts` (which also seeds `ai-showcase-conversation.ts`: one AI thread firing every tool through the real services, with waiting, approved, declined and unanswered cards; add new tools there, `tests/integration/debug-seed.test.ts` fails otherwise). Routes: `POST /debug/clear` (wipes all user data, FK-safe order), `POST /debug/seed?scenario=`, `GET /debug/capabilities`. New scenario = new file in `scenarios/` + register in the index.

## 11. Tests

`tests/unit/` (pure logic, no HTTP, no DB) · `tests/integration/` (routes against a real Postgres: `tests/helpers/db.ts` runs PGlite with every journaled migration, as a non-superuser role so RLS applies; each test creates its own users via `createUser()` and calls routes with `apiAs()`; only external services are faked: HTTP upstreams, R2, Redis) · `tests/security/` (worker middleware chain + static tenant-isolation scan of `src/`). Schema and domain-rule tests live in `packages/tests`, not here. Commands: `pnpm test` (all of `tests/`, what CI runs), `test:unit`, `test:integration`, `test:security`, `test:watch`, `pnpm check` (typecheck + all tests). `tests/evals/` (`pnpm eval:assistant`, never in CI: spends model tokens) runs the real agent and model in Full mode against scenarios from one-line adds to multi-step chains, checking the calls chained and the data left; needs `OPENROUTER_API_KEY` (env or `.dev.vars`), writes `output/evals/assistant.json`. Run it after a prompt or tool change and add a scenario for a new chain.

## 12. Auth (`platform/auth.ts`)

Reads `Authorization: Bearer`, loads JWKS from `NEON_AUTH_JWKS_URL` (URL-keyed cache, retries transient failures), attaches `userId` from JWT `sub`, and before a write ensures the `users` row exists (once per user per isolate). Never introduce cookies/sessions/non-JWT auth without explicit design sign-off (the MCP OAuth boundary in §9b is the one signed-off exception; it never accepts app JWTs, and app routes never accept its tokens).

## 13. Background Jobs

Cron `0 6 * * *` (daily 06:00 UTC, `wrangler.jsonc`): `handleOverdueCheck(env)` (overdue active tasks → `task_metrics.delay_count`) + `pruneStaleMutations(env)` + `pruneAiMemories(env)` + `pruneAiImages(env)` (unsent chat images after a day, others 30 days after last use; storage before rows). Task metrics (`platform/metrics.ts`) silently track reschedule count, first-scheduled, completed-at, created-to-done duration — internal only, no public API.

## 14. Environment & Bindings

| Binding | Purpose |
|---|---|
| `HYPERDRIVE` | → Neon Postgres |
| `NEON_AUTH_JWKS_URL` | JWT verification |
| `RATE_LIMITER` / `_READ` / `_WRITE` / `_ADMIN` | Tier 1/2/2/3 limiters |
| `USER_ASSETS` | Private R2 bucket for photo backgrounds and chat images (optional — absence answers 503 on upload). Deleting an account by hand also means deleting its `backgrounds/{userId}/` and `ai-images/{sha256(userId)}/` prefixes |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | AI stream resumption (optional — absence disables gracefully) |
| `AI_RL_*` / `AI_IMAGES_*` | AI budget caps (5h/7d requests + tokens, concurrency; `AI_RL_IMAGES_24H` 20, `AI_IMAGES_PER_MESSAGE` 4, `AI_IMAGES_MAX_PENDING` 8), all optional |
| `OAUTH_KV` | MCP OAuth provider storage (optional — absence answers 503 on the MCP origin) |
| `MCP_ORIGIN` / `APP_ORIGIN` | MCP server origin (default `https://mcp.cadenceapp.cloud`, dev `http://localhost:8787`) and the web app hosting `/connect` (default the production dashboard) |
| `TOOL_APPROVAL_SECRET` | HMAC key for assistant tool approvals (required in production; unset = unsigned, dev only) |
| `DEPLOYMENT_STAGE` | `"production"` / `"staging"` / `"development"` |
| `ENABLE_DEBUG_ROUTES` | must be `"true"` to enable debug endpoints |

Dev secrets in `.dev.vars`. Prefer Worker bindings over ad hoc env reads.

## 15. Commands

```bash
pnpm dev | deploy | check | test | test:unit | test:integration | test:security | test:watch
pnpm typecheck | cf-typegen
pnpm db:generate | db:check | db:migrate | db:studio
```

**Deployment:** direct push to `main` deploys. GitHub Actions run *after* push (health signal, not a gate) — all verification must pass locally first. Pre-push: `test:unit`, `typecheck`, `wrangler deploy --dry-run --minify`.

## 16. Logging (`platform/log.ts`)

Never call `console.*` directly — use `logger.<level>(source, event, fields)`. **Never log 2xx/3xx** (Cloudflare already records every request). `event` is a stable low-cardinality discriminator (`upstream_failed`, not a sentence). Always include `requestId` + `userHash` (`hashIdentifier(userId)`) — never raw user IDs/emails. Levels: `error` (5xx, unhandled throws, dependency outages), `warn` (4xx, validation failures, best-effort write failures), `info` (only `ai_turn` and the daily `cron_summary`). HTTP failures are centralized (`logValidationFailure`, `app.onError`→`logErrorResponse`) — don't add ad hoc per-route failure logs on top of these; 401s and unmatched 404s aren't logged (the invocation log has them). Pass failures as `issues` (`issuesFromError`): `emit` flattens them to one string, because Workers Logs doesn't index arrays of objects.

## 17. Anti-Patterns

Platform-specific endpoints · bypassing JWT/RLS/Zod · trusting client `userId` · global/cached DB clients · domain logic in `platform/` · `helpers.ts`/`utils.ts`/`misc.ts` · inline reusable schemas in routes · re-deriving `DbClient`/`Tx` aliases locally · domain re-export shims in `types/` · raw stack traces/SQL to clients · `drizzle-kit push` · expanding public AI surface without explicit scope · unversioned routes · duplicated cross-domain logic · UCURD violations · business logic buried in handlers · threading a raw `tx` into pure logic instead of injecting data/a loader.

## 18. Checklist

Identify domain → update/add contract → update Drizzle schema + regenerate migration if persistence changed → route with `apiValidator()` → `getDbClient` + `withRls` → ownership checks → idempotency support on writes → `{ data }` envelope → tests → `pnpm check`.

If this document conflicts with a proposed change, this document is the baseline.
