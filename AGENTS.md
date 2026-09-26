# Cadence — Repo Rules for Agents

Before touching an area, read its guide: `apps/frontend/AGENTS.md`, `apps/backend/AGENTS.md`, `apps/desktop/AGENTS.md`, `apps/landing/AGENTS.md`, `packages/AGENTS.md`. Tests live in each app's `tests/` and in `packages/tests/` (mirrors `packages/`), never next to source.

## Find code with the graph first

If `graphify-out/graph.json` exists (a local, git-ignored knowledge graph of `apps/` + `packages/`, refreshed by a post-commit hook), use it before grepping for anything cross-file:

- Callers and blast radius: `graphify query "what depends on <symbol or file>"` · one symbol: `graphify explain "<node>"`
- How two pieces connect (UI → hook → contract → route → DB): `graphify path "<A>" "<B>" --undirected`
- Feature areas and hubs: `graphify-out/GRAPH_REPORT.md`

The graph tracks structure, not behaviour, and lags uncommitted edits. Open the files it points to before editing, and grep only for exact strings or when the graph comes up empty.

## AGENTS.md files are the current truth

- Each AGENTS.md describes the code **as it is now**. If your change makes a line wrong, fix that line in the same change.
- **Edit, don't append.** Replace outdated lines; if you add one, merge or cut another. Keep them from growing.
- No history, dated notes, or plans in AGENTS.md. Those belong in `/docs`.

## Versions and releases

- The version lives **only** in the root `package.json`. The app label, in-app changelog, and desktop/Tauri/Cargo versions are derived at build time. Never type a version anywhere else.
- `CHANGELOG.md` (root, committed, [Keep a Changelog](https://keepachangelog.com)) is the one changelog, and the in-app changelog is built from it. When a change is user-visible, add one plain-language, one-line bullet (≤120 characters; the build enforces it) under `## [Unreleased]` in `### Added`, `### Changed`, `### Removed`, or `### Fixed`. Every release needs a one-line summary under its heading (its title in the app). Internal-only work gets no bullet.
- Semver: MAJOR = big release or breaking change · MINOR = a feature added, changed, or removed · PATCH = fixes, tweaks, dependency bumps.
- Never bump versions or create tags by hand. `pnpm release` does both (release-it): it stamps `[Unreleased]` with the version, bumps `package.json`, syncs desktop, commits, tags `vX.Y.Z`, and pushes. The tag triggers the desktop release build. Only run it when the user asks.

## Docs and planning live in `/docs` (local only, git-ignored)

- Start at `docs/README.md`. Never create docs under `apps/*/` or `packages/*/`.
- A MINOR or MAJOR update gets one planning file: `docs/updates/X.Y.Z.md` (copy `docs/updates/TEMPLATE.md`). Audits, reviews, and follow-ups are sections in that file, never new files. Once it ships, move it to `docs/archive/X.Y.Z/` and edit the affected AGENTS.md lines.
- `docs/archive/` is frozen history. Don't edit it or treat it as current.
- Never link to `/docs` from committed files. It doesn't exist on GitHub.
