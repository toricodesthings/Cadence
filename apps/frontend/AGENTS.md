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

React 19 · React Router v7 (SPA mode) · Cloudflare Workers + Wrangler assets · Tailwind CSS v4 (`@theme` in `app/app.css`) · Framer Motion + `tw-animate-css` · TanStack Query · Hono RPC (`hc<AppType>`) · Neon Auth (`@neondatabase/auth-ui`) · Radix UI (wrapped) · Lucide icons · dnd-kit · Zustand · `react-markdown` + `remark-gfm` · `rrule` · `date-fns` · Vercel AI SDK (`@ai-sdk/react`, `ai` v7) for the assistant · TypeScript 7.

## 3. Runtime Shape

- Shell: `app/root.tsx` (HTML shell, fonts, error boundary) · `app/providers.tsx` (`QueryClientProvider` + `NeonAuthUIProvider`) · `worker.ts` (thin Cloudflare Worker fallback entry — SPA static assets via `not_found_handling: "single-page-application"`, not a rendering layer).
- Env vars (Wrangler vars): `VITE_NEON_AUTH_URL`, `VITE_API_BASE_URL`. App version/changelog are **not** env vars — `vite.config.ts` reads root `package.json` + `CHANGELOG.md` at build time (`release-info.ts`); `lib/constants/changelog.ts` holds no entries.

## 4. Routes (`app/routes.ts`)

`/` (home — hosts Planner + Inbox triage), `/today`, `/schedule`, `/events`, `/upcoming`, `/completed`, `/trash`, `/project/:projectId`, `/habits`, `/weekly-review`, `/auth/:pathname`, `/desktop/quick-capture` (desktop-only capture window), plus `/changelog`, `/privacy-policy`, `/terms`, `/help-feedback`. Primary routes call `useRouteFocus()` to restore keyboard focus on navigation.

## 5. Source Layout

```text
app/
├── app.css          # Design tokens (@theme/:root), utilities, base rules — the design source of truth
├── root.tsx, providers.tsx, routes.ts, worker.ts
├── components/      # assistant, calendar, command-palette, desktop, events, feedback, focus-views,
│                     # habits, holding, inbox, kanban, layout, notifications, primitives, quick-add,
│                     # settings, shared, sidebar, support, tasks, weekly-review
├── hooks/           # ai, auth, calendar, core, environment, habits, inbox, notifications, projects,
│                     # search, sections, tags, tasks, ui  (+ use-nlp-parse, use-swipe-navigation)
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
- Reuse existing utilities before inventing new ones (`.glass`, `.glass-surface`, `.aurora-accent`, `.glow-*`, `.focus-pulse-soft`, `.cadence-toast`, `.offline-banner`, `.mobile-sheet-*`, `.safe-*`, `.scrollbar-*`). Z-index: only `.layer-*` utilities, never arbitrary `z-[…]`.
- Layout via `useShellMode()` (`app/hooks/ui/use-shell-mode.ts`: `wide` ≥1440px, `laptop` ≥1120px, `tablet` ≥768px, `phone` <768px) — never raw breakpoints. Anything "mobile" must also be checked at `tablet`. Tailwind v4 tree-shaking: conditional/prop-driven colors need `@source inline(…)` in `app.css`, or an inline `style`.
- Contrast floor: no text opacity below `/90` on twilight-muted text (enforced comment at top of `app.css`). Fonts: `Sora` (structural/body, `font-sans`), `Outfit` (display/titles, `font-display`). Every interactive element needs a visible focus style — never `outline-none` without a replacement. Hit targets ≥44×44px (≥36px compact); icon-only controls need `aria-label` + `Tip` (`primitives/Tooltip`), never native `title=""`. `cursor-pointer` on every custom interactive surface, no exceptions.

## 7. Data & State

- `useQuery`/`useMutation` only for server state — no `useEffect`-fetch-into-local-state without a specific non-caching reason.
- Optimistic pattern (see `app/hooks/tasks/optimistic-helpers.ts`, `habits/optimistic-helpers.ts`): cancel in-flight queries → snapshot cache → update immediately → rollback on error → invalidate on settle.
- Query keys centralized in `app/lib/api/query-keys.ts` (domains: tasks, projects, inbox, tags, habits, ai) with differentiated `STALE_TIMES` — don't invent arbitrary per-hook caching windows.
- Global query errors sign the user out on 401-ish failures and redirect to `/auth` — do not break this.
- Local UI state: Zustand (`app/stores/`, see §5 for current domains). Local device cache: `useSettings()` uses `localStorage` as a fast initial read. Don't move durable preference state into ad hoc component state when it belongs in Query, Zustand, or local cache.

## 8. Domain Behavior to Preserve

- **Tasks:** main product unit; list + kanban views; "waiting" is a first-class state, not a hack; `notBefore`, `effort`, tag filtering, sections, subtasks all active. Ordering uses fractional indexing — `app/lib/utils/order-index.ts` (`computeNextOrderIndex`, `computeMidpointIndex`); never renumber whole lists unnecessarily.
- **Schedule:** multi-mode (month/week/day/year), fetches only the active range. Habit logs hydrate into **virtual habit tasks** on some schedule surfaces — intentional hybrid behavior, don't simplify away.
- **Habits:** first-class surface; weekly hydration + monthly detail; resolution updates optimistically and drives toast nudges.
- **Inbox:** items + sections; lightweight capture, not a public AI-parsing surface on its own.
- **Settings:** dialog state driven by `?settings=` query param (`SettingsDialog.tsx`, deep-linkable tabs: About, Account, Appearance, Assistant, AI, DataPrivacy, DateTime, Integrations, Location, Notifications, Shortcuts, Tasks). Merged optimistically, cached locally. Notification fields are required (backend default seeds them; migration `0011` backfilled). Appearance owns the photo background: `settings.appearance.backgroundImage` is server-owned (upload/delete routes only), the file is fetched through authenticated RPC and cached in IndexedDB (`lib/themes/background-image-cache.ts`, cleared on sign-out), inactive image queries release their blobs, and choosing a mode or curated preset leaves photo mode without deleting the photo. Appearance orders mode, curated presets, accents, backgrounds, then intensity. Background has exclusive Cadence/photo choices; Cadence accents are disabled in photo mode, with automatic, sampled and custom photo accents below the image. `BackgroundSettings` owns file selection and mounts `PhotoCropDialog` for local preview, zoom and crop; only confirmation starts upload. Cache writes are serialized and guarded against same-tab sign-out/deletion. `settings.location` is owned by the Location tab and read everywhere through `useUserLocation` (weather, holidays); only an explicit user action may call `navigator.geolocation`, and location/weather queries carry `meta: { persist: false }`.
- **AI Assistant** (`components/assistant/`, `hooks/ai/`, `lib/ai/`, `stores/assistant-store.ts`): side-panel chat over `@ai-sdk/react`, streaming via `chat-transport.ts`. Tool results render as typed widget cards (`components/assistant/widgets/`) dispatched from `tool-registry.tsx` — proposal cards (task create/update, batch reschedule, project/tag create, log habit, inbox cluster/structure) are human-in-the-loop and require explicit confirm; a `write` kind (e.g. capture-to-inbox) is already executed server-side and just shows a quiet confirm chip. `DangerConfirmCard` gates destructive actions. Never let a tool widget silently mutate without the confirm step it's registered for. Conversations persist and resume; usage is surfaced via `use-ai-usage.ts`.
- **Shortcuts/search:** `Cmd/Ctrl+K` (command palette + universal fuzzy search over tasks/projects/habits), `N` (quick-add), `Cmd/Ctrl+Shift+S` (manual sync), `G` chords for navigation. Don't add conflicting shortcuts casually.
- **Notification center** (`components/notifications/NotificationCenter.tsx`): derivation is **client-side only** — `reminder-engine.ts` scans cached tasks/habits on a 60s interval (`use-notification-center.ts`). Dismiss/read state is session-scoped (module-level `Set`s via `useSyncExternalStore`, resets on reload — by design). `use-browser-notifications.ts` fires native `Notification` API when permitted.
- **Quick add:** `QuickAddSurface.tsx`, tabbed (tasks/thoughts/habits), triggered by `N` or UI; navigates + `useRouteFocus()` on submit.
- **Holding planner:** `HoldingPlannerPanel.tsx`, slide-out panel for unmanaged (no date/no project) tasks; visibility in `right-panel-store.ts` (persisted); available wide/laptop only.

## 9. Component Patterns

- `app/components/primitives/`: `AlertDialog`, `Button`, `Collapsible`, `ContextMenu`, `Dialog`, `DropdownMenu`, `Input`, `Popover`, `ScrollArea`, `Select`, `Separator`, `Skeleton`, `Switch`, `TimePicker`, `Tooltip`. Check here before styling a new Radix wrapper.
- Prefer composition over boolean-prop explosion. Routes stay thin orchestration; domain components own domain rendering (`MainLayout.tsx` is the shared authenticated shell: sidebar, header, panels, command palette, quick-add, notification center, settings dialog, toaster, sync button).

## 10. Auth

Neon Auth via `authClient` (`app/lib/auth-client.ts`) + `NeonAuthUIProvider` (`providers.tsx`) + `AuthView` (`routes/auth.tsx`). Custom atmospheric branding/layout on the auth route; third-party UI themed via `.neon-auth-wrapper` in `app.css`. Session changes invalidate all queries. Do not introduce a parallel auth stack.

## 11. Web vs. Desktop Boundary (`app/platform/`)

`desktop.ts` (feature-detect "are we in Tauri"), `desktop-shell.ts`, `desktop-auth-handoff.ts` + `lib/desktop-auth-session.ts` (native OAuth/deep-link handoff), `desktop-keyring.ts` (OS credential storage vs. browser storage), `patch-desktop-fetch.ts` (native HTTP transport), `desktop-update-state.ts` (updater), `desktop-e2e.ts`, `web.ts` (browser counterpart). `routes/desktop.quick-capture.tsx` + `hooks/ui/use-desktop-layout-scale.ts` / `use-desktop-command-preferences.ts` back the native quick-capture window and OS menu commands (see [`apps/desktop/AGENTS.md`](../desktop/AGENTS.md)). New platform-divergent behavior belongs behind this boundary — never an inline `if (Tauri)` scattered in domain components.

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
