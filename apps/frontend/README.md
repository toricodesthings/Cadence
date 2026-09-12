# Cadence Frontend

The frontend is the Cadence web app — the planner, calendar, habits, inbox, and AI assistant that people actually use. It's a single-page app that talks to [`@cadence/backend`](../backend) through a fully typed client, so there's no guessing about what shape the API returns.

## In plain terms

- It's built with **React 19** and **React Router v7** running in **SPA mode** — the browser loads one HTML shell, and React Router swaps pages client-side from there (no server-side rendering).
- It's deployed as **static files on Cloudflare Workers**, with a tiny Worker handling the fallback routing.
- Every API call goes through a **typed RPC client** (`hc<AppType>` from Hono) generated directly from the backend's routes — if the backend's shape changes, the frontend fails to type-check instead of failing silently at runtime.
- Server data (tasks, habits, etc.) is managed by **TanStack Query**, and most edits are **optimistic** — the UI updates instantly, then reconciles with the server, rolling back only if something actually fails.
- The same codebase, rebuilt in a different mode, becomes the [desktop app](../desktop) — see `app/platform/` for the parts that adapt between "running in a browser" and "running inside Tauri."

## Stack

- React 19 + React Router v7 in SPA mode
- Tailwind CSS v4 with the Twilight design tokens in `app/app.css`
- Radix UI primitives wrapped under `app/components/primitives`
- TanStack Query for reads and optimistic mutations
- Hono RPC client via `hc<AppType>`
- Zustand for local UI state (sidebar, tag filter, right panel, task selection)
- Vercel AI SDK (`@ai-sdk/react`) for the AI assistant's streaming chat
- Framer Motion + `tw-animate-css` for animation
- Cloudflare Workers via `wrangler`

## Commands

Run from the repository root:

```bash
pnpm dev:frontend
pnpm --filter @cadence/frontend typecheck
pnpm --filter @cadence/frontend test
pnpm --filter @cadence/frontend build
pnpm --filter @cadence/frontend preview
pnpm deploy:frontend
pnpm deploy:frontend:dev
pnpm --filter @cadence/frontend cf-typegen
```

Or run them from this directory with `pnpm <script>`.

## Conventions

- Import backend RPC contracts from `@cadence/backend`, not `../../..` paths.
- Keep route files thin and push reusable logic into `app/hooks`, `app/lib`, and domain component folders.
- All Radix usage should flow through `app/components/primitives`.
- Mutations remain optimistic-first: snapshot, update immediately, rollback on error, reconcile on settle.
- Notification settings fields are required in the settings schema; do not make them optional.

## Features

- **Planner** — task management with list and kanban views, sections, subtasks, drag-and-drop reordering
- **Schedule** — calendar views (day, week, month, year) with hybrid task/habit/event rendering
- **Inbox** — lightweight capture with sections, for thoughts you want out of your head before you sort them
- **Habits** — weekly/monthly tracking, resolution flows, nudge toasts
- **AI Assistant** — a side-panel chat that can read and act on your real tasks, projects, habits, and calendar (it proposes changes and waits for approval before writing anything); conversations persist and pick up where they left off
- **Universal search** — `Cmd/Ctrl+K` command palette with fuzzy search across tasks, projects, and habits
- **Quick add** — `N` shortcut opens a tabbed creation surface for tasks, inbox thoughts, and habits
- **Notification center** — client-side notifications derived from reminders, due dates, and overdue tasks; fires native browser notifications when enabled
- **Holding planner** — slide-out right panel for triaging unmanaged tasks (no date, no project)
- **Weekly review** — a dedicated reflection/reset surface
- **Manual sync** — `Cmd/Ctrl+Shift+S` invalidates all queries for fresh data
- **Settings** — deep-linkable tabs including notifications, appearance, date/time, shortcuts, AI, and integrations

## Production Notes

- `VITE_NEON_AUTH_URL` is environment-specific. Dev and production intentionally use different Neon Auth branches.
- Web social sign-in uses the current web origin to build `/auth/callback`. If production social auth returns `403` from Neon Auth, check the trusted redirect domains and provider configuration on the production Neon Auth branch for `dashboard.cadenceapp.cloud`.
- CSP is managed through [`public/_headers`](./public/_headers). Current policy allows Cloudflare Insights, Google Fonts, and self-origin geolocation, and denies everything not explicitly listed.
- The auth UI comes from `@neondatabase/auth/react/ui`; layout fixes are applied through route-level classNames and `app/app.css` overrides.

## Structure

```text
app/
├── components/  UI grouped by domain (assistant, calendar, desktop, events, habits, holding,
│                inbox, kanban, notifications, quick-add, settings, sidebar, tasks, weekly-review)
├── hooks/       React Query hooks, app-level hooks (ai, search, notifications, sync, focus, shortcuts)
├── lib/         API client, auth, AI chat transport, holidays, notifications engine, types, validation
├── platform/    Web vs. desktop runtime boundary (deep links, keyring, native fetch patching, updater)
├── routes/      Route entry points
├── stores/      Zustand state (sidebar, tag filter, right panel, task selection, task completion)
└── types/       Frontend-local types
```

## Related Docs

- [Workspace root](../../README.md)
- [Backend app](../backend/README.md)
- [Desktop app](../desktop/README.md)
- [Full contributor rules](./AGENTS.md)
- [Changelog](../../CHANGELOG.md)
