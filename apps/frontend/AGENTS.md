# Cadence Frontend — Agent Instructions

React Router v7 SPA (`ssr: false`, intentional) deployed as static assets on Cloudflare Workers. Consumes the shared backend ([`@cadence/backend`](../backend)) exclusively through a typed Hono RPC client — never invent client-only API contracts. This is also the source codebase for the [desktop app](../desktop): a `platform/` runtime boundary swaps web-vs-desktop behavior, so most code must stay platform-neutral. It embodies the **Twilight Sanctuary** design language (full philosophy: [`docs/MANIFESTO.md`](../../docs/MANIFESTO.md), §5); functional correctness and aesthetic integrity are equally non-negotiable.

## 1. Non-Negotiables

- Client-rendered SPA. Do not introduce SSR assumptions.
- All server data flows through **TanStack Query**; all API calls through the typed Hono RPC client (`app/lib/api/client.ts`) — never raw `fetch` for backend calls.
- Reusable hooks → `app/hooks/`; non-UI logic → `app/lib/`; shared UI → `app/components/` grouped by domain; Radix always through `app/components/primitives/`, never imported raw into domain components.
- No sterile SaaS styling: no white cards, harsh borders, gray dashboards. Prefer glass, shadow, ambient color, breathing room. Never hardcode a one-off hex when a semantic token belongs in `app/app.css`.
- Notification settings fields are required in the settings schema — never optional.
- Mutations are optimistic-first: snapshot → update immediately → rollback on error → reconcile on settle.

## 2. Tech Stack

React 19 · React Router v7 (SPA mode) · Cloudflare Workers + Wrangler assets · Tailwind CSS v4 (`@theme` in `app/app.css`) · Framer Motion + `tw-animate-css` · TanStack Query · Hono RPC (`hc<AppType>`) · Neon Auth (`@neondatabase/auth`) · Radix UI (wrapped) · Lucide icons · dnd-kit · Zustand · `react-markdown` + `remark-gfm` · `date-fns` · Vercel AI SDK (`@ai-sdk/react`, `ai` v7) for the assistant · TypeScript 7.

## 3. Runtime Shape

- Shell: `app/root.tsx` (HTML shell, fonts, error boundary; dev unregisters leftover preview service workers) · `app/providers.tsx` (account-keyed query persistence + auth, persistent background, `WorkspaceStartup` waits for first-route queries and suspense) · `worker.ts` (SPA static assets; transparent same-origin Neon Auth proxy at `/api/auth/*` that forwards cookie values verbatim; exchanges the single-use `neon_auth_session_verifier` on the `/auth/callback` navigation, then leaves via a script `location.replace`. Proxied cookies stay `SameSite=None; Secure` (first-party); both paths are in `assets.run_worker_first`). `public/sw.js` bypasses `/auth` and `/api`, respects `no-store`, and caches only the offline shell and validated, hashed build assets; never auth responses, dev modules or mutable CSS.
- Build env: `VITE_NEON_AUTH_URL`, `VITE_API_BASE_URL`. Deployed web builds ignore `VITE_NEON_AUTH_URL` and use `${origin}/api/auth` (`lib/env.ts`) so auth cookies are first-party — iOS/WebKit blocks third-party cookies and OAuth never completes; dev and desktop call Neon Auth directly. Worker runtime: `NEON_AUTH_BASE_URL` (var). App version/changelog are **not** env vars — `vite.config.ts` reads root `package.json` + `CHANGELOG.md` at build time (`release-info.ts`); `lib/constants/changelog.ts` holds no entries.

## 4. Routes (`app/routes.ts`)

`/` (home — hosts Planner + Inbox triage), `/today`, `/schedule`, `/events`, `/upcoming`, `/completed`, `/trash`, `/project/:projectId`, `/routines` (`/habits` redirects), `/weekly-review`, `/auth/:pathname`, `/desktop/quick-capture` (desktop-only capture window), plus `/browse`, `/changelog`, `/privacy-policy`, `/terms`, `/help-feedback`. Primary routes call `useRouteFocus()` to restore keyboard focus on navigation.

## 5. Source Layout

```text
app/
├── app.css          # Design tokens (@theme/:root), utilities, base rules — the design source of truth
├── root.tsx, providers.tsx, routes.ts, worker.ts
├── components/      # assistant, calendar, command-palette, desktop, events, feedback, focus-views,
│                     # habits (Routines UI), holding, inbox, kanban, layout, notifications, primitives,
│                     # quick-add, settings, shared, sidebar, support, tasks, today, weekly-review
├── hooks/           # ai, auth, calendar, core, environment, habits, inbox, notifications, projects,
│                     # search, sections, tags, tasks, ui  (+ use-nlp-parse)
├── lib/             # actions, ai (chat-transport, usage, input-guard, stop-stream, stream-error),
│                     # api (client, query-keys), auth-client.ts, constants, holidays, location, notes,
│                     # notifications, nlp, themes, utils, validations, env.ts
├── platform/         # WEB vs DESKTOP runtime boundary — see §11
├── stores/          # Zustand: assistant, focus-view, note-room, right-panel (holding),
│                     # sidebar, tag-filter, task-completion, task-selection
└── types/           # frontend-local types (e.g. settings.ts — the full UserSettings view type)
```

## 6. Design System (full detail: `docs/MANIFESTO.md` §5)

- Tokens live under `@theme`/`:root`/`@layer base|utilities` in `app.css`. Accent tokens (`--accent-primary|-soft|-dim`, etc.) are also Tailwind colors; `data-palette` on `<html>` re-tints everything (`lantern` default, `ember`/`rose`/`violet`/`sapphire`/`jade`/`copper`/`frost`, each with a daylight variant) — don't reference `--color-lantern` directly in new surfaces.
- Every surface must work under every mode combo: `data-theme="daylight"`, `data-accent="soft|vivid"`, `data-theme-preset`, `data-bg-mode="custom"`, `data-bg-image="on"` (photo background: tone + accents derived in `lib/themes/image-palette.ts`), `data-density="compact"` (targets stay ≥36px), `data-motion="reduced|full"`. Weekly Reset uses the shared background with tinted step panels; shared glass, utility overlays and Settings surfaces use these semantic tokens; `photo-shell-surface` gives persistent photo-mode chrome a light tint without a separate backdrop blur. Never patch per-mode inside a component.
- Dark surfaces use the `panel`/`panel-raised` colors (the background's own bases; theme presets derive them from their gradient), never accent mixes; right-rail panels share `SIDE_PANEL_SURFACE` (`components/shared/side-panel-surface.ts`). Reuse existing utilities (`.glass`, `.glass-surface`, `.aurora-accent`, `.glow-*`, `.focus-pulse-soft`, `.cadence-toast`, `.offline-banner`, `.mobile-sheet-*`, `.safe-*`, `.scrollbar-*`). Put standard `backdrop-filter` after its WebKit fallback so production optimization preserves it. Z-index: only `.layer-*` utilities, never arbitrary `z-[…]`; popover/menu content is already `layer-floating-ui` (above dialogs), so never re-layer it.
- Layout via `useShellMode()` (`app/hooks/ui/use-shell-mode.ts`: `wide` ≥1440px, `laptop` ≥1120px, `tablet` ≥768px, `phone` <768px) — never raw breakpoints. Phone/tablet dock is Capture · Schedule · assistant · Routines · Browse; every compact header's leading control opens `MainLayout`'s workspace menu sheet (Today, Upcoming, projects, tags); Browse owns the profile quick view, Events, Weekly Reset, Settings, Completed, Trash, search and support. Header actions keep Notifications and contextual Focus/Controls, and route controls open as a popover that drills into sub-panels, not a sheet. Every compact sheet — search, schedule creation, routine creation, Settings, Notifications, the workspace menu — is a `UtilitySheet` (heading or header slot, optional band and pinned footer) over the draggable `ResponsiveOverlayPanel`; Profile & Security lives inside Settings. Compact task ⋮ is a quick-actions dropdown (pin, duplicate, trash; editing lives in task detail) and task right-click/long-press menus are desktop-only. Compact creation is always the bottom-right orb, never a centred pill (the dock owns the centre). Compact toasts sit top-centre, clear of the dock, and are swiped away in any direction. Check both compact modes. Tailwind v4 tree-shaking: conditional/prop-driven colors need `@source inline(…)` in `app.css`, or an inline `style`.
- Contrast floor: no text opacity below `/90` on twilight-muted text (enforced comment at top of `app.css`). Fonts: `Sora` (structural/body, `font-sans`), `Outfit` (display/titles, `font-display`). Every interactive element needs a visible focus style — never `outline-none` without a replacement. Hit targets ≥44×44px (≥36px compact); icon-only controls need `aria-label` + `Tip` (`primitives/Tooltip`), never native `title=""`. `cursor-pointer` on every custom interactive surface, no exceptions.

## 7. Data & State

- `useQuery`/`useMutation` only for server state — no `useEffect`-fetch-into-local-state without a specific non-caching reason.
- Optimistic pattern (see `app/hooks/tasks/optimistic-helpers.ts`, `habits/optimistic-helpers.ts`): cancel in-flight queries → snapshot cache → update immediately → rollback on error → invalidate on settle.
- Query keys centralized in `app/lib/api/query-keys.ts` (domains: tasks, projects, inbox, tags, habits, ai) with differentiated `STALE_TIMES` — don't invent arbitrary per-hook caching windows.
- Global query errors sign the user out on 401-ish failures and redirect to `/auth` — do not break this.
- Local UI state: Zustand (`app/stores/`, see §5). `useSettings()` seeds from account-local storage only when cached data exists; query persistence waits for account identity before restoring. Startup reuses cached data, waits for missing workspace data, and gives optional weather/location/holiday/photo queries four seconds before falling back; failures stay recoverable. Keep durable preferences in Query, Zustand, or local cache.

## 8. Domain Behavior to Preserve

- **Tasks:** tasks, events, habits and capture clarification use `EditSidePanel`, shared title/header/section controls and a type label (Task, Fixed or Routine); domain editors own their fields. All edit rails animate and resize through `EditSidePanelRail`; smaller layouts use overlays. Event cards open the editor outside interactive controls. Creation (schedule blocks, events, routines) goes through `shared/Composer.tsx`: dialog on desktop, `UtilitySheet` on compact, built-in Cancel with a discard guard, plus `ComposerTitle`, `ComposerTabs` (segmented), `WeekdayPicker`, `ComposerToggle` and a `ComposerMore` fold; `CadencePicker` is built from them. Tasks are the main product unit; list + kanban views; "waiting" is a first-class state, not a hack; `notBefore`, `effort`, tag filtering, sections, subtasks all active. Ordering uses fractional indexing — `app/lib/utils/order-index.ts` (`computeNextOrderIndex`, `computeMidpointIndex`); never renumber whole lists unnecessarily.
- **Schedule:** multi-mode (month/week/day/year), fetches only the active range; compact shells change period by dragging the calendar body (`hooks/ui/use-period-swipe.ts` — drag-follow, velocity commit, flat under reduced motion) into the same direction/slide path the header arrows use; task block context menus and the shared editor expose Trash with whole-series wording for recurring blocks; Undo restores the task and requests its details through `useTaskDetailsRequest` on task routes. Habit logs hydrate into **virtual habit tasks** on some schedule surfaces — intentional hybrid behavior, don't simplify away.
- **Repeats:** three kinds, told apart by "if I miss one…" (`shared/RepeatKindPicker`): **Fixed** (`interactionMode: "timetable"`, no check-off, never overdue), **Routine** (a `habits` row; misses let go, never carried over or shown as catch-up), **Task** (carries over). The UI says "Routines", never "Habits"; code and DB keep `habit`. Switching Task ⇄ Routine goes through `hooks/habits/use-convert-repeat.ts` (create new, then trash/archive old, one Undo). Routine times per day come from `routineTimeOn` (`@cadence/domain/repeats`); show a routine with `habits/RoutineMark` (emoji or glyph) and respect `settings.tasks.showStreaks`. Today = `today/DaySpine` (Fixed + timed routines, now/next) over Still open (carried-over tasks, only when non-empty) · Today · Routines (`shared/RoutineAgendaRow`, done ones folded).
- **Routines:** first-class surface; weekly hydration + monthly detail; all edit menus open the shared panel, with Notes, Details and History sections, in-place saves, pause/resume, archive/restore and confirmed deletion. Resolution updates optimistically and drives toast nudges.
- **Inbox:** items + sections; compact Capture uses New captures/Ready to place tabs and an Add orb opening the shared capture composer in a draggable sheet with retained drafts. Clarify shares the editor layout while preserving suggestions, source text, date placement, custom scheduling, full-task-editor handoff and discard.
- **Settings:** `?settings=` opens the desktop dialog or compact `SettingsSheet`; `menu` shows categories and sign-out, with Profile & Security inside Settings. Compact details replace the same history entry; swipe/close returns to the underlying route. `SettingsContent.tsx` shares tab content (deep-linkable tabs: About, Account, Appearance, Assistant, AI, DataPrivacy, DateTime, Integrations, Location, Notifications, Shortcuts, Tasks). Merged optimistically, cached locally. Notification fields are required (backend default seeds them; migration `0011` backfilled). Appearance owns the photo background: `settings.appearance.backgroundImage` is server-owned (upload/delete routes only), the file is fetched through authenticated RPC and cached in IndexedDB (`lib/themes/background-image-cache.ts`, cleared on sign-out), inactive image queries release their blobs; the provider-owned background keeps the active image and object URL alive across route changes, and choosing a mode or curated preset leaves photo mode without deleting the photo. Appearance orders mode, curated presets, accents, backgrounds, then intensity. Background has exclusive Cadence/photo choices; Cadence accents are disabled in photo mode, with automatic, sampled and custom photo accents below the image. `BackgroundSettings` owns file selection and mounts `PhotoCropDialog` for local preview, zoom and crop; only confirmation starts upload. Cache writes are serialized and guarded against same-tab sign-out/deletion. `settings.location` is owned by the Location tab and read everywhere through `useUserLocation` (weather, holidays); only an explicit user action may call `navigator.geolocation`, and location/weather queries carry `meta: { persist: false }`.
- **AI Assistant** (`components/assistant/`, `hooks/ai/`, `lib/ai/`, `stores/assistant-store.ts`): side-panel chat over `@ai-sdk/react`, streaming via `chat-transport.ts`. Tool results render as typed widget cards (`components/assistant/widgets/`) dispatched from `tool-registry.tsx` — proposal cards (task create/update, batch reschedule, project/tag create, log habit, inbox cluster/structure) are human-in-the-loop and require explicit confirm; a `write` kind (e.g. capture-to-inbox) is already executed server-side and just shows a quiet confirm chip. `DangerConfirmCard` gates destructive actions. Never let a tool widget silently mutate without the confirm step it's registered for. Conversations persist and resume; usage is surfaced via `use-ai-usage.ts`.
- **Shortcuts/search:** `Cmd/Ctrl+K` (command palette + universal fuzzy search over tasks/projects/habits), `N` (quick-add), `Cmd/Ctrl+Shift+S` (manual sync), `G` chords for navigation. Don't add conflicting shortcuts casually.
- **Notification center** (`components/notifications/NotificationCenter.tsx`, responsive `NotificationsSheet.tsx` at `?notifications=true`): desktop bell shows up to three recent items in `NotificationPreview`, a matching-height centered empty state and an explicit expand button; the expanded dialog and direct compact sheet share search, All/Unread filters, global newest/oldest/priority sorting, incremental lists, read/unread checkmarks, a defer menu, dismissal and confirmed bulk clearing. Derivation is client-side (`reminder-engine.ts`, 60s scan in `use-notification-center.ts`); read/dismiss/defer state uses a module store backed by localStorage and best-effort notification-state API sync. `use-browser-notifications.ts` fires native notifications when permitted.
- **Quick add:** `QuickAddSurface.tsx`, tabbed (tasks/thoughts/habits), triggered by `N` or UI; navigates + `useRouteFocus()` on submit.
- **Holding planner / placement:** placing a Ready task sets a due date with Undo (`holding/PlaceSheet.tsx`); load is effort-weighted (`lib/utils/task/day-load.ts`) and shown as bars and words, never counts. Ready tasks carry Today/Tomorrow/lightest (accented)/Pick-day chips (always on compact; on desktop they fade in on hover, focus or selection) and "Pick day" opens `PlaceSheet`. The desktop rail when nothing is selected is `HoldingPlannerPanel.tsx`: this week and next as day tiles (load dots) that captures and Ready cards drop onto via `PlaceDndProvider`/`PlaceDraggable` (each draggable carries its own `onPlace`), plus the chosen day's tasks; visibility in `right-panel-store.ts` (persisted).

## 9. Component Patterns

- `app/components/primitives/`: `AlertDialog`, `Button`, `Collapsible`, `ContextMenu`, `Dialog`, `DropdownMenu`, `Input`, `Popover`, `ScrollArea`, `Select`, `Separator`, `Skeleton`, `Switch`, `TimePicker`, `Tooltip`. Check here before styling a new Radix wrapper. `Dialog` and `AlertDialog` share `primitives/dialog-styles.ts` (themed `surface-dialog` glass, layout, header/footer/title type) and use `Button` size `md` for actions; consumers set size, layout and padding only, never their own background, border or shadow, and use `DialogCloseButton` when a header needs an inline close. `ContextMenu`, `DropdownMenu`, `Popover` and `Tooltip` share `primitives/menu-styles.ts` (floating surface, motion, menu rows, `GenericMenu`). Primitives import `cn` from `lib/utils`.
- Reuse primitives through composition; remove duplicate controls, layouts and animations. One home per helper: dates, calendar grids, month/weekday names and `TimePicker` values in `lib/utils/date-format.ts`; motion (`EASE_OUT_EXPO`, `slideVariants`) in `lib/constants/motion.ts`; module stores via `lib/utils/external-store.ts`; `useOnlineStatus` and `useIsCoarsePointer` in `hooks/`. Routes stay thin; domain components own rendering. `MainLayout.tsx` owns the shared shell and active-panel close control; every page header (including Schedule and Routines, which hide the shell header) uses `layout/PageHeader.tsx`: shell-header height, `surface-shell` (shared with right-rail panels), icon + eyebrow + title + optional meta; optional dialogs, search, bulk actions and note room defer mounting until needed, preserving exit motion with `DeferredMount`. The assistant is code-split; visible lazy content uses `StartupSuspense` so startup includes its requests.

## 10. Auth

Neon Auth via `authClient` (`app/lib/auth-client.ts`) + `NeonAuthUIProvider` (`providers.tsx`) + `AuthView` (`routes/auth.tsx`). Custom atmospheric branding/layout on the auth route; third-party UI themed via `.neon-auth-wrapper` in `app.css`. Web callbacks restore through `useAuthState` with serial retries for up to 15 seconds; only a resolved session permits workspace navigation. Session changes invalidate all queries. Do not introduce a parallel auth stack.

## 11. Web vs. Desktop Boundary (`app/platform/`)

`runtime.ts` (web/desktop switch plus the only Tauri-window and storage checks: `hasDesktopWindow`, `getDesktopStore`, `getWebStorage`), `desktop.ts` (Tauri implementation), `desktop-shell.ts`, `desktop-auth-handoff.ts` + `lib/desktop-auth-session.ts` (native OAuth/deep-link handoff), `desktop-keyring.ts` (OS credential storage vs. browser storage), `patch-desktop-fetch.ts` (native HTTP transport), `desktop-update-state.ts` (updater), `desktop-e2e.ts`, `web.ts` (browser counterpart). `routes/desktop.quick-capture.tsx` + `hooks/ui/use-desktop-layout-scale.ts` / `use-desktop-command-preferences.ts` back the native quick-capture window and OS menu commands (see [`apps/desktop/AGENTS.md`](../desktop/AGENTS.md)). New platform-divergent behavior belongs behind this boundary — never an inline `if (Tauri)` scattered in domain components.

## 12. Commands

```bash
pnpm dev:frontend
pnpm --filter @cadence/frontend typecheck | build | preview | test | cf-typegen
pnpm deploy:frontend | deploy:frontend:dev
```

Run from repo root, or `pnpm <script>` from this directory. Typecheck at minimum after changes when practical.

## 13. Anti-Patterns

Hardcoded hex in components · raw `@radix-ui/*` in domain components · raw `fetch` for backend calls · spinner-only flows replacing optimistic ones · duplicated query keys · reusable hooks outside `app/hooks/` · giant route components with business logic · generic SaaS panels/tables breaking the atmosphere · unnecessary full-list renumbering · breaking auth/session invalidation · conflicting keyboard shortcuts · inline platform checks outside `app/platform/`.

## 14. Checklist

Identify the owning domain folder → keep routes thin → reuse/extend a primitive before styling a new one → semantic tokens from `app.css` → Hono RPC + TanStack Query for server state → optimistic updates for visible mutations → preserve focus/pointer/a11y semantics and Twilight Sanctuary tone → typecheck.

If this document conflicts with a proposed change, this document is the baseline.
