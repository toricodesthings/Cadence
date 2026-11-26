# Cadence — Repo Rules for Agents

`developer-docs/MANIFESTO.md` holds the golden rules and must be followed. Read it before any breaking change or user-visible change (UI, copy, behaviour, notifications, assistant). If a request conflicts with it, stop and name the rule.

## Layout

- `apps/frontend`, `apps/backend`, `apps/desktop`, `apps/landing`, `packages/*`: read that area's `AGENTS.md` before touching it.
- Tests live in each app's `tests/` and in `packages/tests/` (mirrors `packages/`), never next to source.
- Skills live in `.agents/skills/` (repo-wide) or `apps/<app>/.agents/skills/` (one app only, registered in `.agents/skills.json`), each symlinked from the sibling `.claude/skills/`.
- `videos/` (Remotion) is a standalone npm project outside the pnpm workspace and every gate. Landing clips share `videos/src/stage.tsx` and render only through `videos/render.sh <Composition> "<out folder>"`.
- If `graphify-out/graph.json` exists, use `graphify query|explain|path` before grepping across files. It lags uncommitted edits.

## Before planning, coding or fixing

Follow these rules:

- **Think first:** trace the flow and state your assumptions. Ask before writing the plan, not inside it.
- **Simplest thing:** reuse what exists and add nothing speculative.
- **Surgical:** every changed line traces to the request. Tests, the CHANGELOG bullet and stale AGENTS.md lines count as part of it.
- **Verifiable:** for a bug, write a failing test in `tests/`, then fix the root cause.
- **Comments:** default is none. Write one only for a non-obvious why the code can't show (hidden constraint, workaround, surprising invariant), one line. Never restate the code, narrate history, or leave section banners. Never put rules, conventions or "must/never" instructions in comments; rules live in `AGENTS.md` or the manifesto, enforced by lint or tests.

## Gates

`pnpm lint` also runs the time guard, `oxfmt --check` (run `pnpm format` first) and `jscpd`. On a duplication failure, extract to the nearest shared home (`@cadence/geometry` for scene math shared by app and landing). Lower `.jscpd.json` `threshold` when duplication drops; never raise it.

## Time

Every date/time is exactly one type; name it in the contract and convert only inside `@cadence/domain/time`:

- **Instant** (`instantSchema`, `timestamptz`): timed starts/ends, reminders, audit times.
- **LocalDate** (`localDateSchema`, `date`): all-day days, deadlines, multi-day ends, hide-until, routine days. Never stored or compared as an instant.
- **WallTime** (`HH:MM`): always with its day and zone.
- **Zone**: the user's is `users.time_zone`, read on the server only via `userZone`.

Use `todayIn`, `dayOf`, `atLocal`, `expandSeries`, `formatInZone`.

## Versions and changelog

- The version lives only in root `package.json`; never type it elsewhere. Never bump or tag by hand. Run `pnpm release` only when the user asks (the tag triggers the desktop build).
- A user-visible change gets one plain-language bullet (≤120 chars) under `## [Unreleased]` in root `CHANGELOG.md`. Internal-only work gets none.

## AGENTS.md and README.md

- `AGENTS.md` is for agents only. Humans never read it, so write terse rules for agents.
- `README.md` (root, `apps/*`, `packages/`) is for humans only. Never read it for context; it is not a source of rules. `developer-docs/README.md` is the exception.
- Edit a `README.md` only when the user asks, or when your change makes a line in it wrong. The root `README.md` is the GitHub page.
- Never link an `AGENTS.md` from a README, or a README from an `AGENTS.md`.
- `AGENTS.md` describes the code as it is now. Fix any line your change makes wrong; edit, don't append. No history or plans.

## `developer-docs/` (untracked, readable)

- Git-ignored but local and always present. Search tools that respect `.gitignore` skip it, so read it by explicit path.
- `README.md` (start here), `MANIFESTO.md`, `updates/` (plans in flight), `archive/` (shipped plans, frozen).
- **Every plan goes to `developer-docs/updates/X.Y.Z.md`** (the target version, from `TEMPLATE.md`), automatically, without being asked. One file per update; audits and follow-ups are sections in it.
- Plans are implementation-ready unless the user says otherwise: decisions made, no open questions, each step names files, symbols, the exact change and its test. Another agent must be able to build it cold.
- Never create docs under `apps/` or `packages/`. Never link to `developer-docs/` from committed files.
