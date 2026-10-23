# Cadence — Repo Rules for Agents

## Build for executive dysfunction

Cadence carries executive function for people who struggle with it: attention-deficit disorder, autism, burnout, overloaded schedules. Every change must make the user's next step **easier**. That means fewer decisions, less to scan or read, less to remember, nothing said twice, and nothing that needs setup before it helps.

Ease must never come from removing capability. Keep the feature and move its weight off the user: good defaults, progressive disclosure, direct manipulation, and the baseline kept quiet so exceptions stand out. Before calling anything done, ask: *on a bad day, half-asleep, could someone use this without thinking?* If not, it isn't done. This rule outranks convenience in the code.

Before touching an area, read its guide: `apps/frontend/AGENTS.md`, `apps/backend/AGENTS.md`, `apps/desktop/AGENTS.md`, `apps/landing/AGENTS.md`, `packages/AGENTS.md`. Tests live in each app's `tests/` and in `packages/tests/` (mirrors `packages/`), never next to source.

## MANIFESTO

Cadence has a manifesto, [`docs/MANIFESTO.md`](docs/MANIFESTO.md). It's clear and intentional with almost no exceptions. Read before making changes to understand the guiding principles behind the code but especially the frontend.

## Find code with the graph first

If `graphify-out/graph.json` exists (a local, git-ignored knowledge graph of `apps/` + `packages/`, refreshed by a post-commit hook), use it before grepping for anything cross-file:

- Callers and blast radius: `graphify query "what depends on <symbol or file>"` · one symbol: `graphify explain "<node>"`
- How two pieces connect (UI → hook → contract → route → DB): `graphify path "<A>" "<B>" --undirected`
- Feature areas and hubs: `graphify-out/GRAPH_REPORT.md`

The graph tracks structure, not behaviour, and lags uncommitted edits. Open the files it points to before editing, and grep only for exact strings or when the graph comes up empty.

## Commands (repo root)

`pnpm dev` (backend + frontend) · `pnpm typecheck` · `pnpm lint` (runs `check:time` and the duplication gate first; rules live in root `.oxlintrc.json`, which Codacy also reads) · `pnpm check:dupes` (lists every clone) · `pnpm test` · `pnpm test:tz` (suites in four zones). Per-app commands are in each guide.

## Say it once in code too

Duplication is gated like lint: `jscpd` with root `.jscpd.json` (35 tokens, weak mode, the same scope Codacy measures) fails `pnpm lint` and CI above its `threshold`. Before copying a block, look for the helper that already does it; a second copy gets extracted into the nearest shared home (`@cadence/geometry` for scene math shared by app and landing). Lower `threshold` when duplication drops; never raise it to pass. Import blocks, thin Hono handlers (abstracting them breaks RPC inference) and the insert/update contract families are expected repeats.

## AGENTS.md files are the current truth

- Each AGENTS.md describes the code **as it is now**. If your change makes a line wrong, fix that line in the same change.
- **Edit, don't append.** Replace outdated lines; if you add one, merge or cut another. Keep them from growing.
- No history, dated notes, or plans in AGENTS.md. Those belong in `/docs`.

## Time: one model, everywhere

Every date or time value is exactly one of four types. Name the type in the contract, and never convert between types outside `@cadence/domain/time`.

- **Instant:** `timestamptz` / timestamp string with offset (`instantSchema`). Timed starts and ends, reminders, audit times.
- **LocalDate:** `date` / `YYYY-MM-DD` (`localDateSchema`). All-day days, deadlines (a deadline is a day), multi-day ends, hide-until, routine days. Never stored or compared as an instant.
- **WallTime:** `HH:MM`, always with the day and zone it belongs to (routine times).
- **Zone:** a time zone name such as `America/Toronto`. The user's is `users.time_zone`, read on the server only through `userZone`; the client keeps it in sync with the device unless Settings pins one.

Today is `todayIn(zone)`, a day is `dayOf(instant, zone)`, a time on a day is `atLocal(day, time, zone)`, and repeating series expand with `expandSeries` in their zone (same local time across DST). Display goes through `formatInZone`.

Banned (`scripts/check-time.mjs`): slicing a timestamp for a day, `toISOString()` for a day, `new Date("…T00:00")`-style parsing, `getTimezoneOffset`, `Date` local getters in day logic, `AT TIME ZONE 'UTC'`, and date-or-datetime union fields. The `test:tz` matrix runs the suites in four zones.

## Versions and releases

- The version lives **only** in the root `package.json`. The app label, in-app changelog, and desktop/Tauri/Cargo versions are derived at build time. Never type a version anywhere else.
- `CHANGELOG.md` (root, committed, [Keep a Changelog](https://keepachangelog.com)) is the one changelog; the in-app changelog is built from it.
- A user-visible change gets one plain-language, one-line bullet (≤120 characters; the build enforces it) under `## [Unreleased]` in `### Added`, `### Changed`, `### Removed`, or `### Fixed`. Internal-only work gets none.
- Every release needs a one-line summary under its heading (its title in the app).
- Semver: major = big release or breaking change · minor = a feature added, changed, or removed · patch = fixes, tweaks, dependency bumps.
- Never bump versions or create tags by hand. `pnpm release` (release-it) does it all: stamps `[Unreleased]`, bumps `package.json`, syncs desktop, commits, tags `vX.Y.Z`, and pushes.
- The tag triggers the desktop release build, so run `pnpm release` only when the user asks.

## Docs and planning live in `/docs` (local only, git-ignored)

- Start at `docs/README.md`. Never create docs under `apps/*/` or `packages/*/`.
- A minor or major update gets one planning file: `docs/updates/X.Y.Z.md` (copy `docs/updates/TEMPLATE.md`). Audits, reviews, and follow-ups are sections in that file, never new files. Once it ships, move it to `docs/archive/X.Y.Z/` and edit the affected AGENTS.md lines.
- `docs/archive/` is frozen history. Don't edit it or treat it as current.
- Never link to `/docs` from committed files. It doesn't exist on GitHub.
