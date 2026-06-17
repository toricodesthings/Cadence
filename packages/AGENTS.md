# `packages/` — Shared Workspace Packages (AGENTS.md)

Guidance for agents working in Cadence's dependency-light shared packages. Read
this **before** editing anything under `packages/`. These packages are imported
by every client (`apps/backend`, `apps/frontend`, and downstream
`desktop`/`mobile`), so a break here breaks every surface at once.

---

## 0. The packages and their one-line jobs

```
packages/
  nlp/        NLP parse / resolve / rank / focus-views.   deps: chrono-node, fuse.js, rrule
  contracts/  Zod schemas → inferred types (wire shapes). deps: zod, @cadence/nlp
  domain/     Pure domain logic (no I/O, no framework).   deps: rrule, date-fns, @cadence/contracts, @cadence/nlp
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
.toEqualTypeOf(...)` per table — currently 11). A column rename/add/nullability
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

### 1.4 Entity may intentionally diverge from Row

The Row is DB-truth; the Entity is the client view and **may override** Row
fields to match what clients actually consume. Current deliberate overrides:

- `task.priority`/`task.effort` → literal unions (`TaskPriority` = `0|1|2|3|4`,
  `EffortLevel` = `1|2|3|null`) — Row keeps numeric for `$inferSelect` parity.
- `tag.color` / `project.colorAccent` → non-null in the Entity (DB default
  guarantees a value; the prior FE interfaces assumed non-null). Row stays
  nullable. *(This masks a latent "API could return null" bug — the truthful fix
  is to null-handle at call sites; tracked, not done.)*
- `task.sectionId/waitingOn/waitingReminder/notBefore`, inbox analysis-lifecycle
  columns, and `subtask.userId` → made `.optional()` in the Entity so optimistic
  caches and partial reads (which omit them) typecheck.

When you change an Entity, **diff it field-by-field against the consuming client
interface** — the parity guard only covers the Row subset.

### 1.5 `settings.ts` and `ai.ts` are special

- **settings**: `userSettingsSchema` is the sparse **storage/patch** shape (all
  fields optional — used by the DB jsonb column + PATCH). `SETTINGS_DEFAULTS`
  (`as const`) + `CanonicalSettings` is the **full** shape. The frontend's full
  `UserSettings` *view* is a widened interface that stays in
  `apps/frontend/app/types/settings.ts` (not `typeof SETTINGS_DEFAULTS`, whose
  `as const` literals break `=== true/false` comparisons). `deepPartial` lives
  here.
- **ai**: only the **wire-crossing** shapes belong here (UIMessage, chat request,
  conversation/message Row+Entity, message role/status enums, and the
  `TaskProposalPart`/`DangerConfirmPart` widget payloads). Everything that
  composes prompts, runs tools, retrieves memory, or persists rows stays in
  `apps/backend/src/domains/ai` (server-only). `promptBlock*` schemas are
  admin-gated → they stay in `ai.schema.ts`, not here.

### 1.5b Shared constants — `constants.ts` (Tier 2)

`@cadence/contracts/constants` holds **semantic, framework-neutral data only** —
`TASK_PRIORITY_LABELS`, `TASK_PRIORITY_SORT_WEIGHT`, `TAG_PALETTE`. The guiding
rule (§0 litmus): **share semantics, never presentation.** Tailwind classes,
Lucide icon names, and CSS-var strings stay in the consuming app and are layered
on top — e.g. `apps/frontend/.../constants/priority.ts` builds its `PRIORITY_CONFIG`
from the shared labels + a local presentation table; `constants/colors.ts`
re-exports `TAG_PALETTE` but keeps its CSS-var `PROJECT_ACCENT_OPTIONS` local.
Add a constant here only when it is genuinely cross-client and carries no
framework/presentation coupling.

### 1.6 Adding / changing a contract — checklist

1. Edit/author `packages/contracts/src/{domain}.ts` (Row + Entity + Input).
2. Add the sub-path to `packages/contracts/package.json#exports` **and** the
   barrel `src/index.ts`.
3. If it maps to a DB table, add a parity assertion in
   `contract-parity.test.ts`.
4. The backend `domains/{domain}/{domain}.schema.ts` should be
   `export * from "@cadence/contracts/{domain}"` (+ server-only refinements).
5. Frontend imports the sub-path directly (`@cadence/contracts/{domain}`); prefer
   sub-paths over the barrel to keep import graphs tight.
6. `pnpm --filter @cadence/contracts typecheck && lint && test`, then
   `pnpm typecheck` (whole workspace).

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
  `TaskReadShape` enum), `normalizeTaskTemporalFields`, `hasTaskTemporalMutation`,
  and the boundary helpers `isDateOnly`/`normalizeStartBoundary`/
  `normalizeEndBoundary`. The frontend `getTaskScheduleKind` maps canonical →
  legacy labels via a table; the backend uses the values directly.
- `task-recurrence.ts` — `validateTaskRecurrenceRule`, `expandScheduleScopedTasks`
  (+ helpers), and `resolveOccurrenceAnchor` (next/closest occurrence around a
  reference date; returns `null` on unparseable rule — callers supply the
  fallback). Filter inputs are typed via the local `ScheduleScopeFilters`
  (structurally compatible with the backend's `NormalizedTaskFilters`, so no
  backend import).

Presentation/formatting (human strings, `date-format`-dependent code) stays in
the **frontend**; it *consumes* these primitives.

### 2.3 Tests live with the code

`packages/domain/src/*.test.ts` (vitest). The golden cross-consistency table in
`task-temporal.golden.test.ts` asserts the single classifier covers every
branch — it is the regression net that previously required keeping two copies in
sync. Add to it when you add a `TaskReadShape` branch.

---

## 3. Backend & frontend wiring (how the shims work)

- **Backend**: routes import shapes directly from `@cadence/contracts/<domain>`
  and pure logic from `@cadence/domain/*`. A `domains/*/*.schema.ts` exists only
  where server-only validation remains — `tasks.schema.ts` (filter/query
  `superRefine`) and `ai.schema.ts` (admin promptBlock); both re-export their
  contract. The per-domain schema shims, `settings-defaults.ts`,
  `task-normalization.ts`, and `task-recurrence.ts` were **deleted** in cleanup.
  `types/api.ts` remains a thin re-export of `@cadence/contracts/common` (the
  documented shared-types home).
- **Frontend**: Phase 3 codemod repointed relative imports to
  `@cadence/contracts/*` sub-paths and deleted the `app/types/*` shims —
  **except** `types/settings.ts` (full `UserSettings`/`PersonalEvent` view +
  `SETTINGS_DEFAULTS`/`DeepPartial` re-exports) and `types/api.ts` (the
  `ApiErrorResponse` runtime class). `@cadence/backend` is still imported by the
  RPC client (`AppType`) in 3 files — keep that dependency.

---

## 4. Versions & instance identity (read before touching deps)

- **One zod.** Root `pnpm.overrides.zod` pins `^4.4.3` so apps and contracts
  resolve a single zod instance — two instances cause "two different types with
  this name exist" / "types not identical" errors. Verify with
  `pnpm why zod` after dependency changes.
- **One hono.** Root `pnpm.overrides.hono` pins `^4.12.23` for the same reason
  (the frontend's RPC client builds against the backend's `AppType`).
- These packages are `private` and unversioned-in-practice (`workspace:*`).

---

## 5. Conventions

- **Naming:** `xRowSchema` / `xSchema` / `insertXSchema` / `updateXSchema`; types
  `X` / `CreateXInput` / `UpdateXInput`. Constants `SCREAMING_SNAKE`.
- **Imports:** sub-path (`@cadence/contracts/task`) preferred over the barrel.
  Extensionless relative imports inside a package.
- **No catch-all files.** One module per domain; no `utils.ts`/`helpers.ts`.
- **Contracts own shape; domain folders keep server-only refinements.** Never
  duplicate a shape in an app.

---

## 6. Enforcement

- **Compile-time row parity:** `apps/backend/tests/unit/contract-parity.test.ts`
  (enforced by `tsc --noEmit`, which includes `tests/`).
- **Dependency boundaries:** `packages/*/scripts/check-imports.mjs`, wired into
  each package's `lint` script (and the turbo `lint` task). It fails on any
  forbidden import specifier.
- **Per-package gates:** `pnpm --filter @cadence/<pkg> typecheck | lint | test`.
- **Whole workspace:** `pnpm typecheck` (turbo, all packages + apps).

---

## 7. Common pitfalls

- Editing a Drizzle column without updating its `xRowSchema` → parity test fails
  (good — that's the point; fix the schema).
- Using `z.infer` for a client-facing input type → required-default errors at
  call sites. Use `z.input`.
- Aliasing the frontend's full `UserSettings` to `typeof SETTINGS_DEFAULTS` →
  `as const` literals break boolean comparisons. Keep the widened interface.
- Adding `drizzle-orm`/`hono`/`react`/an app import to a package → `lint` fails.
  If you truly need DB/framework behavior, it doesn't belong in `packages/`.
- Forgetting the barrel export or the `package.json#exports` sub-path → consumers
  can't resolve the new module.
