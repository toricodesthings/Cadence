# Cadence Frontend

The frontend is a React Router v7 SPA deployed to Cloudflare Workers. It consumes typed RPC contracts from [`@cadence/backend`](../backend) through the workspace instead of brittle filesystem-relative imports.

## Stack

- React 19 + React Router v7 in SPA mode
- Tailwind CSS v4 with the Twilight design tokens in `app/app.css`
- Radix UI primitives wrapped under `app/components/primitives`
- TanStack Query for reads and optimistic mutations
- Hono RPC client via `hc<AppType>`
- Zustand for local UI state (sidebar, tag filter, right panel, task selection)
- Framer Motion + `tw-animate-css` for animation
- Cloudflare Workers via `wrangler`

## Commands

Run from the repository root:

```bash
pnpm dev:frontend
pnpm --filter @cadence/frontend typecheck
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
- **Schedule** — calendar views (day, week, month, year) with hybrid task/habit rendering
- **Inbox** — lightweight capture with sections
- **Habits** — weekly/monthly tracking, resolution flows, nudge toasts
- **Universal search** — `Cmd/Ctrl+K` command palette with fuzzy search across tasks, projects, and habits
- **Quick add** — `N` shortcut opens tabbed creation surface for tasks, thoughts (inbox), and habits
- **Notification center** — client-side notifications derived from reminders, due dates, and overdue tasks; fires native browser notifications when enabled
- **Holding planner** — slide-out right panel for triaging unmanaged tasks (no date, no project)
- **Manual sync** — `Cmd/Ctrl+Shift+S` invalidates all queries for fresh data
- **Settings** — deep-linkable tabs including notifications, appearance, date/time, shortcuts, AI, and integrations

## Structure

```text
app/
├── components/  UI grouped by domain (calendar, habits, holding, inbox, kanban, notifications, quick-add, settings, sidebar, tasks)
├── hooks/       React Query hooks, app-level hooks (search, notifications, sync, focus, shortcuts)
├── lib/         API client, auth, notifications engine, types, utilities, validation helpers
├── routes/      Route entry points
├── stores/      Zustand state (sidebar, tag filter, right panel, task selection, task completion)
└── types/       Frontend-local types
```

## Related Docs

- [Workspace root](../../README.md)
- [Backend app](../backend/README.md)
