# `packages/` — Shared Workspace Packages (AGENTS.md)

Guidance for agents working in Cadence's dependency-light shared packages. Read
this **before** editing anything under `packages/`. These packages are imported
by every client (`apps/backend`, `apps/frontend`, and downstream
`desktop`/`mobile`), so a break here breaks every surface at once.

---

## 0. The packages and their one-line jobs

```
packages/
  nlp/        NLP parse / resolve / rank / focus-views.   deps: chrono-node, fuse.js
  contracts/  Zod schemas → inferred types (wire shapes). deps: zod, @cadence/nlp
  domain/     Pure domain logic (no I/O, no framework).   deps: rrule, @cadence/contracts
  tests/      @cadence/package-tests: every package test, mirroring each package's src/
```

**Dependency direction is strictly downhill** and enforced (see §6):

```
app  →  domain  →  contracts  →  nlp
```

No package imports an app. No package imports `drizzle-orm`, `hono`, `react`, or
`@cloudflare/workers-types`. `domain` additionally must not import any backend
`platform/**` (no `AppError`, `db`, `withRls`).

Each package is **source-only**: `package.json#exports` point directly at `.ts`
files (no build step). Consumers resolve the TypeScript under `moduleResolution:
"Bundler"`. Internal relative imports are extensionless (`./task`, not
`./task.js`). `tsconfig.json` extends `../../tsconfig.base.json`
(`verbatimModuleSyntax: true` → use `import type` / `export type` for types).

---

## 1. `@cadence/contracts` — the single source of truth for shapes

> **Direction of truth:** the Zod schema is authored once here; the TypeScript
> type is `z.infer`red from it — **never hand-write a type that mirrors a
> contract.** Drizzle `$inferSelect` and Hono `AppType` are demoted to
> compile-time guardrails, not type sources.

### 1.1 The three schema families (per domain module)

Every domain module (`task.ts`, `inbox.ts`, `habit.ts`, …) exports up to three
families plus their inferred types:

| Family | Name | What it is | Source of record |
|---|---|---|---|
| **Row** | `xRowSchema` | Exactly the DB columns, wire-shaped (timestamps as ISO strings, no joins). | Drizzle table |
| **Entity** | `xSchema` = `xRowSchema.extend({…})` | The object the API returns (row + joins/derived enrichment). | the client interface |
| **Input** | `insertXSchema` / `updateXSchema` / query schemas | Request bodies & params. | the route |

`export type X = z.infer<typeof xSchema>` etc.

### 1.2 Row schemas are load-bearing — keep them `$inferSelect`-exact

`xRowSchema` must be **structurally identical** to `typeof table.$inferSelect`.
This is asserted at compile time in
`apps/backend/tests/unit/contract-parity.test.ts` (one `expectTypeOf(...)
.toEqualTypeOf(...)` per table — currently 15). A column rename/add/nullability
change now fails `tsc` there instead of silently breaking a client. **When you
touch `apps/backend/src/db/schema.ts`, update the matching `xRowSchema` in the
same change.** Watch DB nullability: a Drizzle column with `.default()` but
**without** `.notNull()` is `T | null` — model it `.nullable()`, not required.

### 1.3 `z.input` vs `z.infer` (output) — pick deliberately

Zod defaults make `z.infer` (output) treat a defaulted field as **required**,
while `z.input` keeps it **optional**. So:

- **Backend** post-parse types (`InsertTask`, …) use `z.infer` (output) — after
  `apiValidator` runs, defaults are present.
- **Client-facing** input types (`CreateTaskInput`, `InsertHabit`, `UpdateHabit`,
  RHF form values) use **`z.input`** — clients build request bodies without the
  server-defaulted fields. Mixing these up produces "missing property" errors at
  every call site.
- **No `.default()` on a create schema whose update schema is `.partial()`**
  (tag, project, habit). Zod 4 keeps defaults through `.partial()`, so a PATCH
  would write them over untouched columns. Leave the field `.optional()` and let
  the DB column default apply on insert.

### 1.4 Entity may intentionally diverge from Row

The Row is DB-truth; the Entity is the client view and **may override** Row
fields to match what clients actually consume. Current deliberate overrides:

- `task.priority`/`task.effort` → literal unions (`TaskPriority` = `0|1|2|3|4`,
  `EffortLevel` = `1|2|3|null`) — Row keeps numeric for `$inferSelect` parity.
- `task.sectionId/waitingOn/waitingReminder/notBefore`, inbox analysis-lifecycle
  columns, and `subtask.userId` → made `.optional()` in the Entity so optimistic
  caches and partial reads (which omit them) typecheck.

When you change an Entity, **diff it field-by-field against the consuming client
interface** — the parity guard only covers the Row subset.

### 1.5 `settings.ts` and `ai.ts` are special

- **settings**: `userSettingsSchema` is the sparse **storage/patch** shape (all
  fields optional — used by the DB jsonb column + PATCH). `SETTINGS_DEFAULTS`
  (`as const`) holds the defaults. `SettingsView` (`DeepRequired` of the stored
  shape) is the full view the API returns and the frontend's `UserSettings`
  (not `typeof SETTINGS_DEFAULTS`, whose `as const` literals break
  `=== true/false` comparisons). Saved focus views (Row + Entity) live here too. `deepPartial`,
  `deepMerge` (defaults ⊕ stored/patch, used by both apps), and
  `personalEventSchema` live here; legacy-settings migration is backend-only
  (`settings.route.ts#normalizeSettings`).
- **ai**: only the **wire-crossing** shapes belong here (UIMessage, chat request,
  conversation/message/image Row+Entity, conversation list/detail projections,
  `streamErrorSchema` + `AI_ERROR_CODES` (status + retryability; each client
  keeps its own wording), chat image limits + `cadence-image:` URL helpers, message role/status enums, and the
  `TaskProposalPart`/`DangerConfirmPart` widget payloads). Everything that
  composes prompts, runs tools, retrieves memory, or persists rows stays in
  `apps/backend/src/domains/ai` (server-only).

### 1.5a The other modules

- **common**: scalars, pagination, `uuidParamSchema`/`taskIdParamSchema`, the
  `ApiError` envelope + `ERROR_CODES`/`ErrorCode` (every code the API sends;
  `AppError` and `DomainError` take one), and the wire-format boundary helpers
  `isDateOnly`/`normalizeStartBoundary`/`normalizeEndBoundary`.
- **task** also holds the `GET /tasks` filters (`taskFiltersSchema`,
  `taskListQuerySchema`); **events** the usage-event names and batch cap;
  **proxy** the weather/geocoding/holiday queries and responses;
  **notification** reminder state (Row + Entity + upsert).

### 1.5b Shared constants — `constants.ts` (Tier 2)

`@cadence/contracts/constants` holds **semantic, framework-neutral data only** —
`TASK_PRIORITY_NAMES` (`none…urgent`, index = level), `TASK_PRIORITY_LABELS`, `TAG_PALETTE`. The guiding
rule (§0 litmus): **share semantics, never presentation.** Tailwind classes,
Lucide icon names, and CSS-var strings stay in the consuming app and are layered
on top — e.g. `apps/frontend/.../constants/priority.ts` builds its `PRIORITY_CONFIG`
from the shared labels + a local presentation table; `constants/colors.ts`
re-exports `TAG_PALETTE` but keeps its CSS-var `PROJECT_ACCENT_OPTIONS` local.
Add a constant here only when it is genuinely cross-client and carries no
framework/presentation coupling.

### 1.6 Adding / changing a contract — checklist

1. Edit/author `packages/contracts/src/{domain}.ts` (Row + Entity + Input).
2. Add the sub-path to `packages/contracts/package.json#exports`.
3. If it maps to a DB table, add a parity assertion in
   `contract-parity.test.ts`; if a read route returns it, a line in the
   frontend's `tests/app/lib/api/rpc-parity.test.ts`.
4. Both apps import the sub-path directly (`@cadence/contracts/{domain}`); no
   app keeps a schema file.
5. `pnpm --filter @cadence/contracts typecheck && lint`,
   `pnpm --filter @cadence/package-tests test contracts`, then `pnpm typecheck`.

---

## 2. `@cadence/domain` — pure logic, framework-neutral errors

Pure, deterministic logic that was (or would be) duplicated across backend and
frontend. **The litmus test: no I/O, no clock-as-dependency-injection-less
randomness, no `AppError`/Hono/React/`db`.** If it throws, it throws
`DomainError`.

### 2.1 `DomainError`, not `AppError`

`packages/domain/src/errors.ts` exports `DomainError(code, message, status=400)`.
**Each app maps it at its own boundary** — the backend's
`platform/errors.ts#formatErrorResponse` converts a thrown `DomainError` into an
`AppError` (`new AppError(e.status, e.code, e.message)`), preserving codes
(`INVALID_TASK_SCHEDULE`, `INVALID_RECURRENCE_RULE`) so API bodies are unchanged.
Never import `AppError` here.

### 2.2 Current modules

- `task-temporal.ts` — `classifyTaskReadShape` (the canonical 6-value
  `TaskReadShape` enum, used as-is by both apps), `normalizeTaskTemporalFields`,
  `hasTaskTemporalMutation`, `inferIsAllDay` (a proposal's shape → all-day vs timed).
- `task-recurrence.ts` — `validateTaskRecurrenceRule`, `expandScheduleScopedTasks`
  (+ helpers), and `resolveOccurrenceAnchor` (next/closest occurrence around a
  reference date; returns `null` on unparseable rule — callers supply the
  fallback). Filter inputs are typed via the local `ScheduleScopeFilters`
  (structurally compatible with the backend's `NormalizedTaskFilters`, so no
  backend import).
- `ordering.ts` — fractional `orderIndex` math (`ORDER_INDEX_GAP`,
  `computeNextOrderIndex`, `computeMidpointIndex`, `computeGappedOrderIndex`).
- `repeats.ts` — the Fixed / Routine / Task rules: `routineTimeOn` (a routine's
  time on a date, honouring per-weekday overrides), `habitRule`/`habitOccurrences`
  (a routine's due days; rules without INTERVAL/COUNT are anchored by whole
  periods so days before creation follow the pattern, "every N" rules count from
  the creation day in the user's zone), `localDay`, `addDaysToDate` (zone-free),
  `isPausedOn` (a pause covers today through `pausedUntil`, never the past), `stepDayStatus`/`stepMarksOn`
  (a routine day's status from its step marks, and back), and
  `suggestInteractionMode` (the server default that makes class-like timed series Fixed).
- `ai-title.ts` — conversation-title helpers (`deriveFallbackTitle`,
  `normalizeTitle`) for the frontend's optimistic title and the backend fallback.

Presentation/formatting (human strings, `date-format`-dependent code) stays in
the **frontend**; it *consumes* these primitives.

### 2.3 Tests live in `packages/tests/<pkg>/`, mirroring `src/`

`packages/tests/domain/*.test.ts` (vitest), importing the public sub-paths. The golden cross-consistency table in
`task-temporal.golden.test.ts` asserts the single classifier covers every
branch — it is the regression net that previously required keeping two copies in
sync. Add to it when you add a `TaskReadShape` branch.

---

## 3. Backend & frontend wiring (how the shims work)

- **Backend**: routes and services import shapes directly from
  `@cadence/contracts/<domain>` and pure logic from `@cadence/domain/*`; no domain
  has a schema file. Loose DB columns are narrowed to the entity in one mapper
  per domain (`toTask`, `toSavedFocusView`, …).
- **Frontend**: imports `@cadence/contracts/*` sub-paths directly. The only
  `app/types/*` files are `settings.ts` (re-exports `SettingsView` as
  `UserSettings`, plus `SETTINGS_DEFAULTS`/`DeepPartial`/`PersonalEvent`) and
  `api.ts` (the `ApiErrorResponse` runtime class). `@cadence/backend` is still imported by the
  RPC client (`AppType`) in 3 files — keep that dependency.

---

## 4. Versions & instance identity (read before touching deps)

- **One zod.** A root `pnpm.overrides.zod` pin makes apps and contracts
  resolve a single zod instance — two instances cause "two different types with
  this name exist" / "types not identical" errors. Verify with
  `pnpm why zod` after dependency changes.
- **One hono.** A root `pnpm.overrides.hono` pin does the same for hono (the
  frontend's RPC client builds against the backend's `AppType`).
- These packages are `private` and unversioned-in-practice (`workspace:*`).

---

## 5. Conventions

- **Naming:** `xRowSchema` / `xSchema` / `insertXSchema` / `updateXSchema`; types
  `X` / `XRow` / `InsertX` / `UpdateX`, plus `CreateXInput` / `UpdateXInput`
  (`z.input`) where clients build the body. Constants `SCREAMING_SNAKE`.
- **Shared scalars:** `isoDateTimeSchema` / `flexibleDateTimeSchema` come from
  `common.ts` (contracts and backend alike) — never redeclare them.
- **Imports:** always by sub-path (`@cadence/contracts/task`); contracts and domain
  have no barrel (only nlp does, for the backend). Extensionless relative imports inside a package.
- **No catch-all files.** One module per domain; no `utils.ts`/`helpers.ts`.
- **Contracts own shape, including refinements.** Never
  duplicate a shape in an app. Where nlp owns a type (`CanonicalNlpEnvelope`,
  `FocusViewDefinition`), the contract schema ends in `satisfies z.ZodType<…>` so tsc catches drift.

---

## 6. Enforcement

- **Compile-time row parity:** `apps/backend/tests/unit/contract-parity.test.ts`
  (enforced by `tsc --noEmit`, which includes `tests/`).
- **Compile-time route parity:** `apps/frontend/tests/app/lib/api/rpc-parity.test.ts`
  pins what each read route sends (inferred through the RPC client) to its entity.
- **Dependency boundaries:** `packages/check-imports.mjs`, run by each package's
  `lint` script (and the turbo `lint` task) with the packages above it as extra
  forbidden specifiers. It fails on any forbidden import specifier.
- **Per-package gates:** `pnpm --filter @cadence/<pkg> typecheck | lint`, and `pnpm --filter @cadence/package-tests test <pkg>` (vitest path filter). Tests live in `packages/tests/<pkg>/<module>.test.ts` (contracts: size limits and update-carries-only-sent-fields are API promises); apps never re-test package rules.
- **Whole workspace:** `pnpm typecheck` (turbo, all packages + apps).

---

## 7. Common pitfalls

- Editing a Drizzle column without updating its `xRowSchema` → parity test fails
  (good — that's the point; fix the schema).
- Aliasing `SettingsView` to `typeof SETTINGS_DEFAULTS` → `as const` literals
  break boolean comparisons. Keep it derived via `DeepRequired`.
- Adding `drizzle-orm`/`hono`/`react`/an app import to a package → `lint` fails.
  If you truly need DB/framework behavior, it doesn't belong in `packages/`.
- Forgetting the `package.json#exports` sub-path → consumers can't resolve the
  new module.
