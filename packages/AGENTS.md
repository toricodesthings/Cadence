# Cadence Packages — Agent Rules

Shared, dependency-light packages used by every app. A break here breaks every surface.

```
domain     pure rules (no I/O, no framework)     → contracts, nlp
contracts  Zod schemas → inferred wire types      → nlp
nlp        parse / resolve / rank / focus views
search     token search and ranking (tasks; `methods` for Code Mode's SDK search)
geometry   SVG scene math (loading screen + landing)
tests      @cadence/package-tests, mirroring each package's src/
```

- `oxlint.config.mts` enforces the rules here: dependencies flow down this list only; no I/O, browser/Node globals, `Date.now`, `Math.random` or `console`.
- Packages are source-only: `package.json#exports` points at `.ts` files. A new module needs its sub-path export.
- Import by sub-path (`@cadence/contracts/task`). Contracts and domain have no barrel.

## Contracts

The Zod schema is the source of every type. Infer types with `z.infer`; never hand-write them.

| Family | Name | Is |
|---|---|---|
| Row | `xRowSchema` | the DB columns exactly, wire-shaped (ISO timestamps, no joins) |
| Entity | `xSchema` = `xRowSchema.extend(…)` | what the API returns |
| Input | `insertXSchema` / `updateXSchema` / query schemas | request bodies and params |

Type names: `X`, `XRow`, `InsertX`, `UpdateX`. Use `CreateXInput` / `UpdateXInput` (`z.input`) where clients build the body.

**Row**
- Must equal Drizzle's `$inferSelect` exactly.
- Change a column → update its `xRowSchema` in the same change. The backend's `tests/unit/contract-parity.test.ts` fails `tsc` otherwise.
- A column with `.default()` but no `.notNull()` is `.nullable()`.

**Entity**
- May differ from Row on purpose: literal unions for priority/effort, `.optional()` for fields partial reads omit.
- The parity test covers Row only. When changing an Entity, check it field by field against its consumers.
- The frontend's `tests/app/lib/api/rpc-parity.test.ts` pins each read route to its Entity.

**Input**
- Server post-parse types use `z.infer`: defaults are filled in.
- Client-built bodies use `z.input`: defaults are optional.
- No `.default()` on a create schema whose update schema is `.partial()`. Zod 4 keeps defaults through `.partial()`, so a PATCH would overwrite untouched columns. Use `.optional()` and let the DB default apply.

**Shared pieces**
- Time scalars (`instantSchema`, `localDateSchema`, `wallTimeSchema`, `zoneSchema`) and `ERROR_CODES` come from `common.ts`. Never redeclare them.
- A field has one type. Never a date-or-datetime union.
- Where nlp owns a type, the contract ends in `satisfies z.ZodType<…>` so drift fails `tsc`.

**Special modules**
- `settings`: `userSettingsSchema` is the sparse stored/patch shape. `SettingsView` (`DeepRequired` of it) is the full view. Never alias it to `typeof SETTINGS_DEFAULTS`; its `as const` literals break boolean comparisons.
- `ai`: wire-crossing shapes only. Prompts, tools, memory retrieval and persistence stay in the backend.
- `constants`: semantic, framework-neutral data only. Tailwind classes, icon names and CSS vars stay in the app.

## Domain

- Errors are `DomainError(code, message, status)`. Each app maps it at its boundary (backend: `formatErrorResponse`).
- Human-facing formatting stays in the frontend.

Each rule has one home. Reuse it; never re-derive it in an app.

| Module | Owns |
|---|---|
| `time.ts` | every Instant / LocalDate / WallTime / Zone conversion, series expansion |
| `task-temporal.ts` | a task's read shape and reschedule (new `TaskReadShape` → add to `task-temporal.golden.test.ts`) |
| `nlp-draft.ts` | `resolveDraft`, `appliesWithoutChoice`: the only place a parse becomes a draft |
| `reminders.ts` | `deriveReminders`, `dueAlert` |
| `repeats.ts` | Fixed / Routine / Task rules |
| `task-length.ts` | `taskMinutes`, a task's one length |
| `ordering.ts` | fractional order indexes |

## Dependencies

- `overrides` in `pnpm-workspace.yaml` pin one `zod` and one `hono`.
- Two instances cause "types not identical" errors. Check with `pnpm why zod` after dependency changes.

## Gates

- `pnpm --filter @cadence/<pkg> typecheck | lint`
- `pnpm --filter @cadence/package-tests test <pkg>`
- Package rules are tested only in `packages/tests/<pkg>/`. Apps never re-test them.
- Finish with `pnpm typecheck`.
