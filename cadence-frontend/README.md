# Cadence Frontend

A dark-themed, buttery-smooth productivity app built for speed. Cadence is an SPA that pairs with the [cadence-backend](../cadence-backend) Hono API to deliver an optimistic, offline-first-feeling task management experience.

## Tech Stack

| Layer                   | Technology                                               |
| ----------------------- | -------------------------------------------------------- |
| **Framework**           | React 19 + React Router v7 (SPA mode)                    |
| **Styling**             | Tailwind CSS v4 (`@theme` block in `app.css`)            |
| **UI Primitives**       | Radix UI — pre-themed in `components/primitives/`        |
| **Server State**        | TanStack React Query v5                                  |
| **API Client**          | Hono RPC (`hc<AppType>`) — type-safe, end-to-end         |
| **Auth**                | Neon Auth (`@neondatabase/auth`) — Google + GitHub OAuth |
| **Toast Notifications** | Sonner — themed to twilight glass palette                |
| **Drag & Drop**         | dnd-kit (fractional `orderIndex` reordering)             |
| **Icons**               | Lucide React                                             |
| **Animations**          | tw-animate-css + Radix `data-[state]` transitions        |
| **Hosting**             | Cloudflare Workers (static assets via `wrangler`)        |
| **Package Manager**     | Bun                                                      |

## Commands

> **Always use `bun`, never `npm`.**

| Action              | Command                                 |
| ------------------- | --------------------------------------- |
| Dev server          | `bun run dev` → `http://localhost:5173` |
| Type check          | `bun run typecheck`                     |
| Production build    | `bun run build`                         |
| Preview on Workers  | `bun run preview`                       |
| Deploy (production) | `bun run deploy`                        |
| Deploy (dev env)    | `bun run deploy:dev`                    |
| Regen Worker types  | `bun run cf-typegen`                    |

## Project Structure

```
app/
├── app.css                          Design system (twilight theme tokens, motion, glass utilities)
├── root.tsx                         Root layout (HTML shell, CSS imports)
├── routes.ts                        Route config (file-based)
├── providers.tsx                    QueryClient + NeonAuthUI provider setup
│
├── routes/
│   ├── home.tsx                     Today (Planner) view — PlannerHeader, task list, ResizableSidePanel + CalendarView
│   ├── inbox.tsx                    Inbox page — GeneralPageHeader, task list, ResizableSidePanel + CalendarView
│   ├── upcoming.tsx                 Upcoming page — GeneralPageHeader, task list, ResizableSidePanel + CalendarView
│   ├── completed.tsx                Completed archive — GeneralPageHeader, ResizableSidePanel + CalendarView
│   ├── trash.tsx                    Trash — GeneralPageHeader, ResizableSidePanel + CalendarView
│   ├── calendar.tsx                 Full calendar / schedule view (Month, Week, Day)
│   └── auth.tsx                     Sign-in / sign-up flow (Neon Auth)
│
├── components/
│   ├── MainLayout.tsx               Auth-gated shell (sidebar + header + content + toaster)
│   │
│   ├── primitives/                  Pre-themed Radix UI wrappers (base layer)
│   │   ├── Collapsible.tsx          @radix-ui/react-collapsible
│   │   ├── DropdownMenu.tsx         @radix-ui/react-dropdown-menu (Content, Item, Separator)
│   │   ├── Popover.tsx              @radix-ui/react-popover
│   │   ├── ScrollArea.tsx           @radix-ui/react-scroll-area (Viewport, Scrollbar, Thumb)
│   │   ├── Separator.tsx            @radix-ui/react-separator
│   │   ├── Tooltip.tsx              @radix-ui/react-tooltip
│   │   └── index.ts                 Barrel export
│   │
│   ├── tasks/                       Task domain UI
│   │   ├── TaskCard.tsx             Presentational card (checkbox, title, metadata, drag handle)
│   │   ├── TaskCheckbox.tsx         Checkbox with optimistic toggle
│   │   ├── TaskContextMenu.tsx      Dropdown (Edit, Move, Delete)
│   │   ├── TaskList.tsx             DnD-enabled sortable list
│   │   ├── SortableTaskCard.tsx     useSortable() wrapper around TaskCard
│   │   ├── AddTaskInput.tsx         Quick-add with optimistic creation
│   │   ├── TaskListSkeleton.tsx     Pulse skeleton for cold cache
│   │   └── EmptyState.tsx           Empty day illustration
│   │
│   ├── sidebar/                     Sidebar domain UI
│   │   ├── Sidebar.tsx              Root layout (IconRail + SidebarPanel)
│   │   ├── IconRail.tsx             Narrow icon column (logo, search, quick-add, settings)
│   │   ├── SidebarPanel.tsx         Nav links + live project list (Collapsible)
│   │   ├── NavLink.tsx              Reusable nav item
│   │   ├── ProjectLink.tsx          Project list item with accent dot
│   │   ├── CreateProjectPopover.tsx Popover form with color picker
│   │   └── Tip.tsx                  Tooltip wrapper for icon rail
│   │
│   ├── calendar/                    Full calendar domain UI
│   │   ├── CalendarView.tsx         Month-view mini calendar (drives date filter via URL params)
│   │   ├── CalendarGrid.tsx         7×6 grid of day cells (month view)
│   │   ├── CalendarHeader.tsx       Month/year nav + Today button (mini calendar)
│   │   ├── CalendarDayCell.tsx      Day cell with task dot indicators (weekend tint, today glow)
│   │   ├── ScheduleHeader.tsx       Two-row calendar page header (heading+nav / view-switcher+CTA)
│   │   ├── WeekView.tsx             Week timeline (day columns, all-day strip, time gutter)
│   │   ├── DayView.tsx              Single-day timeline (all-day strip, hourly grid)
│   │   ├── TimeGutter.tsx           Hour label column shared by WeekView and DayView
│   │   ├── CalendarTaskChip.tsx     Task chips in the schedule grid (pill + block variants)
│   │   ├── GhostTaskInput.tsx       Inline quick-add on calendar time slots
│   │   └── CalendarEventPopover.tsx Floating popover for creating tasks from the calendar
│   │
│   ├── feedback/                    Notification UI
│   │   └── Toaster.tsx              Themed Sonner wrapper (twilight glass)
│   │
│   ├── layout/
│   │   ├── GeneralPageHeader.tsx    Unified page header (icon + title + description) — Inbox, Upcoming, Completed, Trash
│   │   └── PlannerHeader.tsx        Planner-specific header (Today heading + formatted date)
│   │
│   └── shared/
│       ├── ResizableSidePanel.tsx    Drag-resizable right panel (mouse + keyboard, min/max clamps, aria-label)
│       └── ScrollAreaWrapper.tsx     Reusable full-height scroll container
│
├── hooks/
│   ├── use-api-client.ts            Session-aware Hono RPC client (memoized on token)
│   │
│   ├── tasks/                       Task React Query hooks
│   │   ├── optimistic-helpers.ts    snapshot, rollback, invalidate, cancel task caches
│   │   ├── use-tasks.ts             useTasks(filters) — query with date range support
│   │   ├── use-create-task.ts       Optimistic insert + rollback + toast
│   │   ├── use-update-task.ts       Optimistic patch + rollback + toast
│   │   ├── use-delete-task.ts       Optimistic remove + rollback + toast
│   │   ├── use-reorder-task.ts      Fractional index mutation
│   │   ├── use-batch-state.ts       Batch state transition
│   │   └── index.ts                 Barrel export
│   │
│   ├── projects/                    Project React Query hooks
│   │   ├── use-projects.ts          useProjects() — query
│   │   ├── use-create-project.ts    Optimistic create
│   │   ├── use-update-project.ts    Optimistic update
│   │   ├── use-delete-project.ts    Optimistic delete
│   │   └── index.ts                 Barrel export
│   │
│   └── inbox/                       Inbox React Query hooks
│       ├── use-inbox.ts             useInbox() — query
│       ├── use-create-inbox-item.ts Optimistic create
│       ├── use-delete-inbox-item.ts Optimistic delete
│       └── index.ts                 Barrel export
│
├── lib/
│   ├── auth-client.ts               Neon Auth client (Google + GitHub OAuth)
│   ├── api/
│   │   ├── client.ts                Hono RPC client factory (hc<AppType>)
│   │   ├── helpers.ts               unwrapResponse(), parseApiError()
│   │   └── query-keys.ts            Centralized React Query key definitions
│   └── utils/
│       ├── date-format.ts           toISODate(), formatDateLabel(), getMonthDateRange()
│       ├── color-resolver.ts        Map backend accent tokens → hex values
│       └── order-index.ts           computeNextOrderIndex(), computeMidpointIndex()
│
└── types/
    ├── task.ts                      Task, TaskState, CreateTaskInput, UpdateTaskInput, TaskFilters
    ├── project.ts                   Project, CreateProjectInput
    ├── inbox.ts                     InboxItem
    └── api.ts                       ApiResponse<T>, ApiError
```

## Design System — "Twilight"

All colors, motion tokens, and glass utilities live in `app/app.css` under the `@theme` block. Use semantic token names — never hardcode hex values.

### Palette

| Token                                 | Purpose                                          |
| ------------------------------------- | ------------------------------------------------ |
| `twilight-void` → `twilight-elevated` | Background scale (5 levels, darkest to lightest) |
| `twilight-text` / `-soft` / `-muted`  | Text hierarchy (primary → secondary → tertiary)  |
| `twilight-border` / `-border-light`   | Borders (6% and 10% white)                       |
| `lantern`                             | Primary accent — amber CTA, glows                |
| `moonlit`                             | Secondary accent — blue, info                    |
| `sapphire`                            | Tertiary accent — links                          |

### Glass & Typography

- **Glass effects:** `.glass`, `.glass-surface` utility classes
- **Glows:** `.glow-lantern`, `.glow-moonlit`
- **Fonts:** `font-sans` (Inter) for body, `font-display` (Outfit) for headings
- **Motion:** CSS variables `--duration-fast/normal/smooth/expressive` and `--ease-out-expo/quart`

### Utility Classes

| Class | Purpose |
| --- | --- |
| `.btn-icon` | Square icon button base — `w-9 h-9`, `rounded-xl`, flex-centered, `transition-colors duration-200` |
| `.priority-high-bar` | Ambient lantern glow on the left border of high-priority task cards |

### Focus Ring Architecture

Cadence uses a scoped approach to avoid double-ring artifacts in composite UI components:

- **Standalone inputs** (`<input>`, `<textarea>`) receive a subtle 1px ring on `:focus-visible`
- **Composite regions** suppress the ring on child inputs so the host element can provide focus feedback:
  - `[data-focus-container]` — applied to floating panels like `GhostTaskInput` and `CalendarEventPopover`
  - `[role="form"]` — applied to form containers

> **Rule:** Never use `transition-all`. Always specify an explicit property list (e.g., `transition-[background-color,border-color]`). This prevents repainting layout-influencing properties unintentionally and matches the Design Manifesto.

## Architecture Highlights

### Optimistic UI (Core Principle)

Every mutation that modifies visible data follows this contract:

1. **`onMutate`** — Snapshot current cache → apply optimistic update (user sees change in the same frame)
2. **`onError`** — Rollback from snapshot → show error toast via Sonner
3. **`onSettled`** — `invalidateQueries` to reconcile with server truth

> **Users never see spinners on mutations.** The optimistic update _is_ the loading state. Skeleton loaders are reserved for cold-cache initial reads only.

### Primitives Architecture

Radix UI packages are wrapped in `app/components/primitives/` as pre-themed base components. Domain components **MUST** import from primitives — never from `@radix-ui/*` directly. This ensures consistent styling, animation behavior, and z-indexing across the app.

Each primitive supports customization via `className` overrides and variant props (e.g., `<DropdownMenu.Item variant="danger">`).

### Data Flow

```
User Action
  → React Query mutation (onMutate: optimistic update)
    → Hono RPC client (hc<AppType>) with JWT
      → cadence-backend (Cloudflare Worker)
        → Neon Postgres (RLS-scoped per user)
```

### Auth Flow

1. `NeonAuthUIProvider` wraps the app with Google + GitHub social login
2. `MainLayout` gates content via `requireAuth` + `authClient.useSession()`
3. API client injects JWT from session: `createApiClient(token)`
4. Global 401 handler in `providers.tsx` forces re-auth on expired tokens

## Environment Variables

Defined via `wrangler.jsonc` and `.env` for local dev:

| Variable             | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `VITE_NEON_AUTH_URL` | Neon Auth endpoint                                |
| `VITE_API_BASE_URL`  | Backend API base (`http://localhost:8787` in dev) |

## Deployment

The frontend is deployed as a **Cloudflare Worker** serving static assets with SPA fallback:

```bash
# Production
bun run deploy

# Dev environment
bun run deploy:dev
```

The `wrangler.jsonc` configures `not_found_handling: "single-page-application"` to ensure client-side routing works for all paths.

---

## Current Features (Phase 1 — Foundation + Phase 2 UI/UX)

Everything below is **implemented and working** as of February 2026.

### Auth & Security

- [x] Neon Auth integration (Google + GitHub OAuth)
- [x] JWT-based API authentication (`Authorization: Bearer <token>`)
- [x] Global 401 handling — auto-redirect to sign-in on expired tokens
- [x] Row-Level Security (RLS) on all backend tables — database-level tenant isolation
- [x] Zod validation on every API endpoint
- [x] CORS configured for production + local dev

### Tasks (Full CRUD + Optimistic UI)

- [x] Create tasks (quick-add input with instant optimistic insert)
- [x] Update tasks (state toggle, title, metadata)
- [x] Delete tasks (optimistic removal with rollback on failure)
- [x] Drag-and-drop reordering via fractional `orderIndex` (dnd-kit)
- [x] Batch state transitions (mark multiple as done/active)
- [x] Filter by state, project, scheduled date, and date range
- [x] Skeleton loaders on cold cache, stale-while-revalidate on warm

### Projects

- [x] Create projects with name + color accent picker (6 accent options)
- [x] Update project name and color
- [x] Delete projects
- [x] Live project list in sidebar with accent-colored dots
- [x] Collapsible project section

### Inbox

- [x] Create inbox items (raw text capture)
- [x] List inbox items
- [x] Delete inbox items
- [x] Inbox count badge in sidebar

### Calendar (Mini Month View + Full Schedule)

- [x] Month-level calendar grid with task dot indicators
- [x] Date selection drives task list filtering via URL params
- [x] Month/year navigation with "Today" jump button
- [x] Date range queries to backend for per-month task loading
- [x] Full schedule page with Month, Week, and Day view modes
- [x] Week view — day header columns with today highlight glow, all-day strip, hourly time gutter
- [x] Day view — single-day timeline with all-day strip and hourly slots
- [x] `ScheduleHeader` — two-row layout (title+nav row / view-switcher+CTA row), seasonal subtitle, `btn-icon` navigation
- [x] `CalendarEventPopover` — floating quick-add with date label header and keyboard `⏎` hint
- [x] `GhostTaskInput` — inline time-slot quick-add with lantern halo focus glow

### UI & Layout

- [x] "Twilight" dark theme — full design system with 5-level background scale, accent colors, glass effects, and glow utilities
- [x] Sidebar with icon rail (logo, search stub, quick-add stub, notifications stub, settings stub)
- [x] Sidebar panel with primary nav (Today, Upcoming, Inbox) + secondary nav (Completed, Trash)
- [x] Profile dropdown (Google-style card, sign out)
- [x] Radix UI primitives architecture (DropdownMenu, Tooltip, Popover, ScrollArea, Separator, Collapsible)
- [x] Sonner toast notifications (themed with twilight glass aesthetic)
- [x] tw-animate-css for Radix `data-[state]` open/close transitions
- [x] Responsive scroll areas with styled translucent scrollbars
- [x] `ResizableSidePanel` — shared resizable right panel used across all main pages (mouse drag + keyboard `←/→` resize, min/max clamps)
- [x] Unified page layout — all main pages (Today, Inbox, Upcoming, Completed, Trash) share a consistent `sidePanel` prop pattern
- [x] `GeneralPageHeader` — unified icon + title + description header used by Inbox, Upcoming, Completed, and Trash
- [x] `PlannerHeader` — dedicated Planner-specific heading with warm date line
- [x] Atmospheric section separator (gradient `h-px` divider) between Planner header and task input
- [x] Scoped focus ring architecture (`data-focus-container`, `[role="form"]`) — no double-ring artifacts in composite inputs
- [x] `btn-icon` utility class for icon buttons
- [x] `priority-high-bar` glow class for high-priority task left borders
- [x] All interactive components use explicit `transition-[property]` — no `transition-all` in the codebase

### Backend API (Hono on Cloudflare Workers)

- [x] `GET/POST /api/tasks` — list with filters, create
- [x] `PATCH /api/tasks/:id` — update
- [x] `DELETE /api/tasks/:id` — delete
- [x] `PATCH /api/tasks/:id/reorder` — fractional index reorder
- [x] `PATCH /api/tasks/batch-state` — batch state transition
- [x] `GET/POST /api/projects` — list, create
- [x] `PATCH /api/projects/:id` — update
- [x] `DELETE /api/projects/:id` — delete
- [x] `GET/POST /api/inbox` — list, create
- [x] `DELETE /api/inbox/:id` — delete
- [x] `GET /health` — health check (public)

### Infrastructure

- [x] Cloudflare Workers deployment (frontend + backend)
- [x] Neon Postgres with Cloudflare Hyperdrive connection pooling
- [x] Hono RPC type-safe client — shared across web (and future mobile)
- [x] Drizzle ORM with schema-driven migrations

---

## Roadmap

### Phase 2 — Task Editing, Calendar Timeline & UX Polish

> **Goal:** Make Cadence spatially useful. Tasks aren't just checkboxes — they have duration, time slots, and physical presence on a timeline.

| Feature                     | Status | Description                                                                                                                                         | Design Ref                                 |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Task Edit Dialog**        | ⬜     | Full dialog for editing title, content (rich text), due date, scheduled time, duration estimate, project assignment. Radix Dialog primitive.        | —                                          |
| **Day Timeline View**       | ✅     | Vertical 24-hour timeline (WeekView + DayView). Timeboxed tasks render as glass blocks. Apple Calendar-inspired.                                    | [DesignPlan5](../docs/DesignPlan5.md) §1.2 |
| **All-Day vs Timeboxed**    | ⬜     | Visual separation: all-day tasks float at top of day, timeboxed tasks anchor to specific time slots on the grid.                                    | [DesignPlan5](../docs/DesignPlan5.md) §2.1 |
| **Collision Handling**      | ⬜     | Overlapping timeboxed tasks split horizontally (50/50, 33/33/33) instead of rejecting the drop.                                                     | [DesignPlan5](../docs/DesignPlan5.md) §2.2 |
| **Upcoming View**           | ✅     | Multi-day lookahead showing tasks grouped by day with date headers.                                                                                 | —                                          |
| **Completed & Trash Views** | ✅     | Archive of done/archived tasks with restore/permanent delete.                                                                                       | —                                          |
| **Search**                  | ⬜     | Full-text task search with keyboard shortcuts.                                                                                                      | —                                          |
| **Settings Page**           | ⬜     | User preferences (theme accent, default view, notification prefs).                                                                                  | —                                          |
| **Timezone-Locked Tasks**   | ⬜     | `timezone_locked` support — tasks that follow the user vs. tasks that stay local.                                                                   | [DesignPlan5](../docs/DesignPlan5.md) §4   |

### Phase 3 — AI Assistant Layer

> **Goal:** Cadence becomes an invisible executive assistant. The AI works in the background, never in a chatbot. It structures, schedules, and protects the user from burnout.

| Feature                      | Description                                                                                                                                         | Design Ref                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Inbox AI Parsing**         | Cloudflare Queue + LLM pipeline: raw text → structured Task JSON (title, due date, duration, project). Zero form-filling.                           | [DesignPlan4](../docs/DesignPlan4.md) §2.1 |
| **Draft Approval Flow**      | AI creates "Draft" tasks — user sees a summary and approves/rejects with one tap. AI never auto-commits.                                            | [DesignPlan4](../docs/DesignPlan4.md) §1.2 |
| **Morning Readout**          | Nightly Cloudflare Cron generates an optimized daily schedule. User wakes up to a pre-built "Today" plan and presses "Accept."                      | [DesignPlan4](../docs/DesignPlan4.md) §3.3 |
| **Burnout Prevention**       | Adaptive State Engine tracks `reschedule_velocity` and `burnout_index`. AI detects avoidance patterns and offers to defer/break-down overdue tasks. | [DesignPlan4](../docs/DesignPlan4.md) §2.3 |
| **AI Memory (pgvector RAG)** | Persistent learning layer — AI remembers patterns ("User can't focus before 10 AM"). Transparent: user can inspect and wipe memory.                 | [DesignPlan4](../docs/DesignPlan4.md) §3.2 |
| **Auto-Pruning**             | Cloudflare Cron aggressively deletes `EPHEMERAL` memories, keeping the RAG index high-signal and cheap to query.                                    | [DesignPlan3](../docs/DesignPlan3.md) §3.1 |
| **Weekly Reset**             | Sunday night scan for macro-trends: if Monday has 14 hours of tasks and Tuesday has 0, AI suggests a "Smoothed Schedule."                           | [DesignPlan4](../docs/DesignPlan4.md) §3.4 |
| **Tetris Scheduling**        | AI packs flexible tasks into empty calendar slots around hard meetings (synced from Apple/Google Calendar).                                         | [DesignPlan5](../docs/DesignPlan5.md) §3   |
| **Remote Triggers**          | Webhook endpoint (`/api/ai/ingest`) for iOS Shortcuts, Siri, email-to-task pipelines.                                                               | [DesignPlan4](../docs/DesignPlan4.md) §3.1 |

### Phase 4 — Mobile Parity & Ecosystem

> **Goal:** Full cross-platform experience. The Hono API already serves both clients with zero platform-specific code.

| Feature                        | Description                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Expo React Native App**      | `cadence-mobile` — shares types via Hono RPC, identical API surface. Native gestures for drag-and-drop.       |
| **Continuous Calendar Scroll** | Infinite vertical scroll through months (iOS Calendar-style), replacing paginated month navigation.           |
| **Push Notifications**         | Morning Readout alerts, overdue task reminders, draft approval pings.                                         |
| **Offline Mode**               | React Query persistence + background sync queue. True local-first experience.                                 |
| **Calendar Sync**              | Two-way sync with Apple Calendar / Google Calendar. Hard meetings become unmovable "walls" for AI scheduling. |
| **Keyboard Shortcuts**         | Power-user command palette (⌘K) for rapid task creation, navigation, and search.                              |
| **Data Export**                | Full JSON/CSV export of all user data. Self-hostable instance support.                                        |

---

## Related

- **Backend:** [`cadence-backend/`](../cadence-backend) — Hono v4 API on Cloudflare Workers + Neon Postgres
- **Integration Plan:** [`docs/02-26-2026_frontend-integration-plan.md`](docs/02-26-2026_frontend-integration-plan.md) — detailed Phase 1 spec
- **UI/UX Refinement Plan:** [`docs/02-28-2026_implementation-plan-6.md`](docs/02-28-2026_implementation-plan-6.md) — Phase 2 design unification (layout, calendar overhaul, focus ring, warmth pass)
- **Design Plans:** [`docs/DesignPlan2–5.md`](../docs/) — backend architecture, privacy model, AI assistant, and calendar/timeline design
- **Agent Instructions:** [`AGENTS.md`](AGENTS.md) — coding rules, conventions, and architecture reference
