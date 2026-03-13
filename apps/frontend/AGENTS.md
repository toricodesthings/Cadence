# Cadence Frontend - Agent Instructions

> **Read this before modifying anything in `apps/frontend`.** This file is the current operating manual for the Cadence SPA.

## 0. Mission

Cadence frontend is a **React Router v7 SPA** deployed to **Cloudflare Workers** as static assets with a Worker edge entry.

Its job is not just to render tasks. It must preserve the product's core promise:

- a calm, atmospheric productivity experience
- fast, optimistic interaction loops
- exact parity with the universal backend API
- a UI that feels handcrafted rather than generic SaaS

This app is the primary embodiment of the **Twilight Sanctuary** design language. Functional correctness and aesthetic integrity are equally important.

---

## 1. Core Non-Negotiables

### 1.1 Product and platform rules

- This is a **client-rendered SPA**. `ssr: false` is intentional.
- The frontend must consume the **shared universal backend**, never invent client-only API contracts.
- Do not build web-only business logic into the API model.
- Keep web/mobile conceptual parity whenever possible, even though this package is the web client.

### 1.2 Design rules

- The visual north star remains **Twilight Sanctuary**.
- Avoid generic SaaS styling: no sterile white cards, harsh borders, default gray dashboards, or shallow utility-only visuals.
- Prefer atmosphere, depth, breathing room, soft glass, and warm amber / moonlit accents.
- **Never hardcode one-off hex colors in component code** when a semantic token belongs in `app/app.css`.

### 1.3 Architecture rules

- All server data flows through **TanStack Query**.
- All API calls flow through the **typed Hono RPC client**.
- Reusable hooks belong in `app/hooks/`.
- Non-UI app logic belongs in `app/lib/`.
- Major shared UI belongs in `app/components/` organized by domain.
- Radix primitives must be consumed through `app/components/primitives/`, not directly from `@radix-ui/*` in domain components.

---

## 2. Current Tech Stack

- **Framework:** React 19
- **Router:** React Router v7 in SPA mode
- **Deployment:** Cloudflare Workers + Wrangler assets
- **Styling:** Tailwind CSS v4 via `@theme` in `app/app.css`
- **Animation:** Framer Motion + `tw-animate-css`
- **Server state:** TanStack React Query
- **Backend client:** Hono RPC via `hc<AppType>` from `@cadence/backend`
- **Auth:** Neon Auth + `@neondatabase/auth-ui`
- **Primitives:** Radix UI wrappers in `app/components/primitives/`
- **Icons:** Lucide React
- **DnD:** dnd-kit
- **Local UI state:** Zustand
- **Markdown rendering:** `react-markdown` + `remark-gfm`
- **Recurrence:** `rrule`
- **Dates:** `date-fns`

---

## 3. Runtime Shape

### 3.1 Application shell

The app is rooted through:

- `app/root.tsx` — HTML shell, font loading, app stylesheet, error boundary
- `app/providers.tsx` — Query client + Neon auth provider composition
- `worker.ts` — Cloudflare Worker fallback for static deployment edge behavior

### 3.2 Deployment model

- Static assets are served from `build/client`
- Wrangler uses SPA fallback through `not_found_handling: "single-page-application"`
- The Worker is currently a lightweight fallback entry, not a server-rendering layer

Do not introduce SSR assumptions into this package without an explicit architecture change.

---

## 4. Route Inventory and Product Domains

Current top-level routes are:

- `/` — Planner
- `/schedule` — Calendar / scheduling canvas
- `/upcoming` — Upcoming task horizon
- `/inbox` — Inbox capture and sorting
- `/completed` — Completed tasks
- `/trash` — Archived / removed task surface
- `/project/:projectId` — Project-scoped task view
- `/auth/:pathname` — Sign-in / sign-up flow
- `/habits` — Habit planning and review canvas
- `/weekly-review` — Weekly reset / reflection surface

All primary routes (`/`, `/upcoming`, `/inbox`, `/habits`, `/project/:projectId`) call `useRouteFocus()` to restore keyboard focus on navigation, enabling seamless keyboard-driven workflows from search, quick add, and notification center.

The current codebase is not “just tasks.” It includes major product domains for:

- planner tasks
- schedule/calendar
- kanban
- inbox capture
- habits
- settings
- auth
- sidebar navigation / filtering
- global command palette and universal search
- quick-add surface (tasks, thoughts, habits)
- in-app notification center and browser notifications
- holding planner panel (unmanaged task triage)

---

## 5. Source Layout

```text
app/
├── app.css                 # Design tokens, utilities, base rules, motion tokens
├── providers.tsx           # QueryClient + NeonAuth providers
├── root.tsx                # App shell, fonts, error boundary
├── routes.ts               # Route config
├── components/
│   ├── MainLayout.tsx      # App shell layout
│   ├── CommandPalette.tsx  # Global command palette + universal search
│   ├── calendar/
│   ├── feedback/
│   ├── habits/
│   ├── holding/           # HoldingPlannerPanel for unmanaged task triage
│   ├── inbox/
│   ├── kanban/
│   ├── layout/
│   ├── notifications/     # NotificationCenter popover
│   ├── primitives/
│   ├── quick-add/         # QuickAddSurface (tasks, thoughts, habits)
│   ├── settings/
│   ├── shared/
│   ├── sidebar/
│   └── tasks/
├── hooks/
│   ├── habits/
│   ├── inbox/
│   ├── projects/
│   ├── sections/
│   ├── tags/
│   ├── tasks/
│   └── shared app hooks (see §5.1)
├── lib/
│   ├── api/
│   ├── notifications/     # notification-model.ts, reminder-engine.ts
│   ├── types/             # settings.ts (Zod schemas for user settings)
│   ├── utils/
│   ├── validations/
│   └── auth-client.ts
├── stores/
│   ├── right-panel-store.ts    # Holding planner panel visibility
│   ├── sidebar-store.ts
│   ├── tag-filter-store.ts
│   ├── task-completion-store.ts
│   └── task-selection-store.ts
└── types/
   └── frontend-facing domain types
```

---

### 5.1 Shared app hooks

Notable hooks added or expanded in the current codebase:

- `use-shell-mode.ts` — responsive breakpoint hook returning `wide`, `laptop`, `tablet`, `phone`
- `use-keyboard-shortcuts.ts` — global keyboard shortcut registration (`Cmd/Ctrl+K`, `N`, `G` chords, etc.)
- `use-universal-search.ts` — fuzzy search over tasks, projects, and habits with ranked scoring
- `use-route-focus.ts` — restores keyboard focus to `[data-focus-target]` after navigation
- `use-notification-center.ts` — derives in-app notifications from tasks/habits, manages read/dismiss state with `useSyncExternalStore`
- `use-browser-notifications.ts` — fires native browser `Notification` API for new items when permitted
- `use-workspace-sync.ts` — manual sync hook for TanStack Query invalidation + SyncButton UI

---

## 6. Layout and Composition Patterns

### 6.1 `MainLayout` is the shared shell

`MainLayout` is the primary app frame for authenticated surfaces. It currently handles:

- sidebar composition
- top header/title region
- optional side panels (including holding planner panel)
- auth gating
- command palette mounting
- quick-add surface mounting
- notification center mounting
- settings dialog mounting
- global toaster mounting
- floating action bar mounting
- sync button mounting

If you are building a new primary route, it will usually compose through `MainLayout`.

### 6.2 Layout principles

- Routes should stay thin orchestration layers.
- Domain components should own domain rendering.
- Shared shell concerns belong in shared layout components, not duplicated per route.
- Prefer composition over boolean-prop sprawl.

### 6.3 Provider placement

Global providers belong in `providers.tsx`, not ad hoc inside pages.

Current provider stack includes:

- `QueryClientProvider`
- `NeonAuthUIProvider`

---

## 7. Design System Rules

### 7.1 `app/app.css` is the source of truth

All foundational visual tokens live in `app/app.css` under `@theme`, `:root`, `@layer base`, and `@layer utilities`.

Use semantic design tokens instead of raw values.

### 7.2 Core token families

#### Twilight surfaces

- `--color-twilight-void`
- `--color-twilight-deep`
- `--color-twilight-base`
- `--color-twilight-surface`
- `--color-twilight-surface-muted`
- `--color-twilight-surface-hover`
- `--color-twilight-elevated`

#### Text

- `--color-twilight-text`
- `--color-twilight-text-soft`
- `--color-twilight-text-muted`

#### Accents

- `--color-lantern`
- `--color-lantern-soft`
- `--color-lantern-dim`
- `--color-moonlit`
- `--color-moonlit-soft`
- `--color-sapphire`
- `--color-ember-red`
- `--color-forest-green`
- `--color-violet`

#### Priority and nav accents

- `--color-priority-low`
- `--color-priority-medium`
- `--color-priority-high`
- `--color-priority-urgent`
- `--color-nav-planner`
- `--color-nav-schedule`
- `--color-nav-upcoming`
- `--color-nav-inbox`
- `--color-nav-completed`

### 7.3 Core utility classes

Prefer existing utilities where possible:

- `.bg-twilight`
- `.glass`
- `.glass-surface`
- `.glow-lantern`
- `.glow-moonlit`
- `.scrollbar-hidden`
- `.scrollbar-thin`
- `.btn-icon`
- `.text-truncate-safe`

### 7.4 Contrast floor rule

The stylesheet explicitly sets a **contrast floor** for twilight surfaces.

- Do not introduce muted text below the current contrast guidance.
- Avoid casual text opacity reductions like `/70` or `/80` on already-muted twilight text unless you are matching an established pattern with acceptable contrast.

### 7.5 Legacy styling note

Some existing components still use legacy classes like `text-warm-white`, `text-lantern-amber`, or literal color values.

When touching those files:

- preserve behavior unless the task is visual cleanup
- prefer migrating toward semantic `twilight-*`, `lantern`, and `moonlit` tokens rather than copying more legacy token names

Do not spread inconsistent token usage further.

---

## 8. Typography and Interaction Rules

### 8.1 Typography

- `Sora` is the primary structural font
- `Outfit` is the display/task/title font
- use `font-display` for headings and high-intent UI labels
- use `font-sans` for body and interface content

### 8.2 Focus states

- Every interactive element must have a visible focus style.
- Global focus styling is already defined in `app.css`.
- Do not use `outline-none` without a proper replacement.

### 8.3 Touch and pointer behavior

- Maintain accessible hit targets.
- Use actual semantic buttons/links.
- `cursor-pointer` should be present on interactive custom surfaces.

### 8.4 Motion rules

- Use the motion tokens defined in `:root`.
- Favor `transform`, `opacity`, and carefully selected color/border/shadow transitions.
- Avoid `transition: all` in new code.
- Respect reduced-motion expectations.

---

## 9. Data Fetching and Mutation Rules

### 9.1 No raw `fetch` for app API calls

Use the typed RPC client from `app/lib/api/client.ts`.

- `createApiClient(token?)`
- `useApiClient()` for hooks/components

Do not build untyped ad hoc backend calls.

### 9.2 TanStack Query is mandatory for server state

Use:

- `useQuery` for reads
- `useMutation` for writes

Do not fetch backend state via `useEffect` + local component state unless there is a very specific reason unrelated to server-state caching.

### 9.3 Optimistic UI is a product rule

For mutations affecting visible lists/cards/surfaces:

1. cancel in-flight queries
2. snapshot cache
3. optimistically update cache immediately
4. rollback on error
5. invalidate on settle

The existing helpers in:

- `app/hooks/tasks/optimistic-helpers.ts`
- `app/hooks/habits/optimistic-helpers.ts`

represent the preferred pattern.

### 9.4 Query keys are centralized

Use `app/lib/api/query-keys.ts` as the single source of truth.

Current domains include:

- tasks
- projects
- inbox
- tags
- habits

Also respect the differentiated `STALE_TIMES` rather than inventing arbitrary caching windows per hook.

### 9.5 Error handling

Global query errors currently sign the user out on 401-ish failures and redirect to auth.

Do not break this auth-expiry recovery path.

---

## 10. State Management Rules

The codebase intentionally separates state by type:

### 10.1 Server state

- TanStack Query

### 10.2 Local cross-component UI state

- Zustand stores in `app/stores/`

Current Zustand domains include:

- sidebar collapsed state and width persistence
- active tag filter
- multi-select task selection
- right panel visibility (holding planner)
- task completion animation state

### 10.3 Local device cache

- `useSettings()` also uses `localStorage` as fast initial cache

Do not move durable UI preference behavior into random component state when it belongs in either React Query, Zustand, or local cache.

---

## 11. Domain-Specific Behavior to Preserve

### 11.1 Tasks

- Tasks are the main product unit.
- The planner page supports list and kanban views.
- Waiting tasks are a first-class state, not a hack.
- `notBefore`, `effort`, tag filtering, sections, subtasks, and optimistic editing are all active concepts in the UI.

### 11.2 Ordering

Task and subtask order uses **fractional indexing**.

Use helpers from `app/lib/utils/order-index.ts`:

- `computeNextOrderIndex()`
- `computeMidpointIndex()`

Do not renumber entire lists unless explicitly required.

### 11.3 Calendar / schedule

- Schedule view is multi-mode: month, week, day, year.
- It fetches only the active range needed for the current view.
- Habit logs are hydrated into **virtual habit tasks** for some schedule surfaces.

This hybrid task/habit calendar behavior is intentional. Do not simplify it away without understanding the UX implications.

### 11.4 Habits

- Habits are a first-class product surface, not a side experiment.
- Weekly hydration and monthly detail are both supported.
- Habit resolution updates UI optimistically and also powers toast-based nudging/resolution flows.

### 11.5 Inbox

- Inbox supports both items and sections.
- This is lightweight capture, not yet a public AI parsing surface.

### 11.6 Settings

- Settings dialog state is driven by the `?settings=` query parameter.
- Deep-linkable settings tabs are intentional.
- User settings are merged optimistically and cached locally.
- Notification settings fields (`browser`, `taskReminders`, `habitReminders`, `dueDateAlerts`) are **required** (non-optional) in the schema. The backend default seeds all fields, and migration `0011` backfills existing users.

### 11.7 Keyboard shortcuts, command palette, and universal search

Global shortcuts are part of the product experience.

Current notable shortcuts include:

- `Cmd/Ctrl+K` — command palette (doubles as universal search)
- `Cmd/Ctrl+Shift+S` — manual sync
- `N` — quick-add surface
- `G` chords for navigation

The command palette provides universal search across tasks, projects, and habits with fuzzy matching and ranked results.

Do not add conflicting shortcuts casually.

### 11.8 In-app notification center

- Notification center lives in `app/components/notifications/NotificationCenter.tsx`.
- Notification derivation is **client-side only**: `reminder-engine.ts` scans cached tasks/habits and generates notifications based on reminders, due dates, and overdue state.
- Session-scoped dismiss/read state uses module-level `Set` objects exposed through `useSyncExternalStore`. State resets on page reload by design.
- The engine runs on a 60-second interval inside `use-notification-center.ts`.
- Browser notifications (`use-browser-notifications.ts`) fire native `Notification` API alerts when user settings allow and permission is granted.

### 11.9 Quick-add surface

- `QuickAddSurface.tsx` is a tabbed modal for creating tasks, thoughts (inbox items), and habits.
- Triggered via `N` shortcut or UI button.
- On submit, navigates to the relevant route and focuses via `useRouteFocus()`.

### 11.10 Holding planner panel

- `HoldingPlannerPanel.tsx` is a slide-out right panel showing unmanaged tasks (no date, no project).
- Visibility is controlled by `right-panel-store.ts` (Zustand, persisted to localStorage).
- Available on wide/laptop shell modes. Collapsed on smaller breakpoints.

---

## 12. Component Patterns

### 12.1 Primitives layer first

Use `app/components/primitives/` as the base layer.

Examples include:

- `Button`
- `Input`
- `Switch`
- `Select`
- `Dialog`
- `DropdownMenu`
- `Popover`
- `Tooltip`
- `ScrollArea`
- `Collapsible`
- `AlertDialog`

Domain components should compose these rather than re-skinning raw Radix packages repeatedly.

### 12.2 Composition over boolean explosion

Prefer explicit composition and smaller domain parts over giant components controlled by many booleans.

### 12.3 Thin routes, richer domain components

Routes should orchestrate data and composition.
Detailed UI behavior belongs in domain component folders.

### 12.4 Reusable helpers belong in shared utilities

If logic repeats across views, extract it into:

- `app/lib/utils/`
- `app/lib/api/`
- `app/hooks/`

---

## 13. Auth Rules

Auth currently relies on Neon Auth:

- `authClient` from `app/lib/auth-client.ts`
- `NeonAuthUIProvider` in `providers.tsx`
- `AuthView` in `routes/auth.tsx`

Important details:

- the auth route has custom atmospheric branding/layout
- third-party auth UI is themed via `.neon-auth-wrapper` styles in `app/app.css`
- session changes currently invalidate all queries

Do not introduce a separate auth stack or duplicate session plumbing.

---

## 14. Cloudflare and Environment Rules

### 14.1 Worker compatibility

All code must remain compatible with the Cloudflare Workers environment.

Avoid Node-only assumptions or server-only packages.

### 14.2 Current env vars

Defined through Wrangler vars:

- `VITE_NEON_AUTH_URL`
- `VITE_API_BASE_URL`

### 14.3 Frontend worker role

`worker.ts` is currently a minimal edge entry that exists mainly for asset deployment behavior and future extension.

Do not overcomplicate it unless the task is specifically about edge logic.

---

## 15. Commands

Use `pnpm` only.

Common commands:

- `pnpm dev:frontend`
- `pnpm --filter @cadence/frontend build`
- `pnpm --filter @cadence/frontend preview`
- `pnpm --filter @cadence/frontend preview:dev`
- `pnpm --filter @cadence/frontend deploy`
- `pnpm --filter @cadence/frontend deploy:dev`
- `pnpm --filter @cadence/frontend typecheck`
- `pnpm --filter @cadence/frontend cf-typegen`

Prefer workspace-root execution when possible.

After code changes, at minimum run the frontend typecheck when practical.

---

## 16. Anti-Patterns to Avoid

Do not:

- hardcode hex colors in components when a token belongs in `app/app.css`
- import raw `@radix-ui/*` into domain components
- use raw `fetch` for backend calls
- replace optimistic flows with spinner-only flows
- duplicate query keys across files
- put reusable hooks outside `app/hooks/`
- add giant route components full of business logic and UI state
- break the calm atmospheric design by introducing generic SaaS panels/tables
- renumber whole ordered lists unnecessarily
- break auth/session invalidation behavior
- add keyboard shortcuts that conflict with existing command palette/navigation behavior

---

## 17. What to Preserve When Editing

Unless the task explicitly says otherwise, preserve:

- Twilight Sanctuary design intent
- semantic token usage through `app/app.css`
- React Query + optimistic mutation patterns
- Hono RPC typed backend integration
- `MainLayout` shell conventions
- settings query-param deep linking
- habit/task hybrid schedule behavior
- sidebar persistence and selection/filter stores
- auth theming and session provider integration

---

## 18. Default Checklist for New Frontend Work

1. identify the domain folder that should own the change
2. keep route files thin
3. use or extend an existing primitive before inventing a new styled control
4. use semantic tokens from `app/app.css`
5. use Hono RPC through the shared API client
6. use TanStack Query for server state
7. implement optimistic updates for visible mutations
8. preserve accessibility, focus states, and pointer semantics
9. preserve Twilight Sanctuary visual tone
10. typecheck the frontend when practical

If a proposed implementation conflicts with this document, treat this file as the frontend operating baseline.
