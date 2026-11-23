# Cadence Frontend — Agent Rules

React Router SPA (`ssr: false`, on purpose) served as Cloudflare Workers static assets. It is also the desktop app's UI. It reaches the backend only through the typed Hono RPC client.

- Shared shapes and rules: `packages/AGENTS.md`.
- Area guides: `app/lib/{api,notes,app-links}/AGENTS.md`, `app/components/{primitives,calendar,habits,settings,assistant,notifications}/AGENTS.md`.
- Local skills (`apps/frontend/.agents/skills/`): `apple-design`, `better-auth-best-practices`, `vercel-react-best-practices`.

## Data

- Server data uses TanStack Query and the RPC client (`useApiClient()`).
- No `as any` on the client. No `useEffect` fetching into local state.
- Only transports sit below the client: WAL replay, `sw.js` sync, `chat-transport.ts`.
- `unwrapResponse(res)` infers its type from the route. Never pass a generic. A mismatch means the route drifted from its contract; fix the route.
- Query keys and `STALE_TIMES` live in `lib/api/query-keys.ts`. No per-hook cache windows.
- Read one task with `useTask(id)`.
- Mutations are optimistic, via the domain's `createOptimisticHelpers`.
- Only the last write in flight reads the server back (`lib/api/write-gate.ts`): refetch via `xCache.invalidate` / `refetchAfterWrites`, roll back via `xCache.rollback` or behind `isLastWrite`, show a row only if `isOnlyWriteTo(id)`.
- Creates pick their id with `clientIdFor(input)` and send it as both `id` and `Idempotency-Key`. The optimistic row is then the real row.
- Show only the end state, never an intermediate step.
- Order with fractional indexes (`lib/utils/order-index.ts`). Never renumber a whole list.
- A list shared with the caller carries `access` and `members`. Role checks use `useListAccess` / `useTaskAccess` (never `project.access` inline); list pickers use `useOwnProjects`. Rows pushed over the live socket go through `reconcileTaskInCaches`.

## Code rules

- Platform differences live in `app/platform/` only. No inline desktop checks in domain components.
- Creation goes through `shared/Composer` plus a `use…Composer` hook. Never rebuild a creator's fields elsewhere.
- Typed words go through `useNlpParse`. It runs during render, so what shows is what Enter saves.
- Writes that carry `nlp.resolved` are stored as sent.
- Per-device view choices (folds, hidden columns, view modes) use `useDeviceValue` / `useDeviceFlag`, never settings.
- Sorts and focus views also live in the URL via `useUrlState`. Priority: URL → device → default.
- List each shortcut once, in `lib/constants/shortcuts.ts`.
- UI text says Routines and Lists, never Habits or Projects. Code keeps `habit` / `project`.
- Never show `err.message`. Use `toastError(err, "Couldn't …")`.
- Never log tokens, OAuth URLs or callback query strings.
- Neon Auth's plugins are fixed (JWT, admin, organization, email OTP, magic link, phone). Build no UI for others. No second auth stack.
- Leave for the MCP origin only via the URL the consent hook returns (`location.assign`).

## Toasts, Undo, confirm

A toast answers "where did it go?"

- No toast when the result is visible in place.
- Toast a failure (`toastError`).
- Toast something that left the screen: name it (`toastName`), say where it went, add Undo if reversible (`toastUndo`).
- Toast a result the user can't see (email, clipboard, export, update ready).
- If the server can't reverse an action, `await undoWindow` in `mutationFn`. Nothing is sent until the window closes.
- Confirm only what can't be undone.
- Use the patched `toast.*` methods, never bare `toast()`.

## Design

`tools/oxlint-cadence.mjs` enforces these as `cadence/*` errors in `app/**`: `ui-words` (Routines/Lists in copy), `no-dom-title` (use `Tip`), `focus-visible` (no bare `outline-none`), `surface-tokens` (no raw white/black, palette or hex classes), `no-z-index` (`.layer-*`; `z-0`/`z-10` allowed). Files that predate a rule sit in its `"off"` override in `.oxlintrc.json`. Never add a file there; clean one and remove it.

**Hierarchy**
- The next step is obvious. Routine info is quiet; exceptions stand out.
- Every line of text costs reading. No eyebrows, kickers, or labels that repeat the title, icon or sidebar.
- Empty states use `tasks/EmptyState`, never a loose italic line.

**Agency**
- Useful defaults, no setup required.
- Optional detail sits behind a labelled control.
- Every essential action works without hover, drag, gesture or shortcut.

**Continuity**
- An action keeps its name, icon and outcome on every surface.
- Resizing or opening details keeps drafts, selection, viewed day and scroll.
- Closing returns focus to the trigger, or a logical neighbour.
- One meaning, one Lucide icon:

| Meaning | Icon | Meaning | Icon |
|---|---|---|---|
| page options (one per page) | `EllipsisVertical` | Settings | `Settings` |
| details | `SlidersHorizontal` | edit / add / sort | `Pencil` / `Plus` / `ArrowUpDown` |
| complete / task | `CheckCircle2` / `CheckSquare` | thought / note | `MessageSquare` / `StickyNote` |
| list / section / tag | `FolderOpen` / `Columns3` / `Tag` | routine (`Repeat` = repeating task only) | `Flame` |
| event / reminder / time / takes | `CalendarHeart` / `Bell` / `Clock` / `Hourglass` | waiting / focus view / assistant | `UserCheck` / `Zap` / `Sparkles` |
| Today / Tomorrow / later / next week | `Sun` / `Sunrise` / `Moon` / `ArrowRight` | pick a day / trash | `Calendar` / `Trash2` |
| shared / people | `Users` | take a task / make owner | `Hand` / `Crown` |

**Motion**
- Motion explains what opened, moved or changed. It is interruptible and never delays input.
- Springs come from `SPRINGS` in `lib/constants/motion.ts` (bounce ≤ 0.15).
- Menus, popovers and sheets use CSS eases (`--morph-*`, `--sheet-*`), never a JS spring.
- Every expand/collapse is `shared/Reveal`. Press feedback is the `press` utility.

**Tokens and modes**
- Tokens live in `app.css` and are tuned per mode only there. No one-off hex.
- Use accent tokens, never `--color-lantern`, so `data-palette` re-tints everything.
- Text on an accent fill: `text-[var(--primary-foreground)]`.
- Every surface must work in every combination of `data-theme`, `data-accent`, `data-theme-preset`, `data-bg-mode` / `data-bg-image` (photo), `data-density` and `data-motion`.
- Prop-driven Tailwind colours need `@source inline(…)` or an inline `style`.

**Surfaces**
- One ladder, low to high: ground → `capture-surface` → `surface-shell` (headers, right rail) → `surface-card` (containers) → `surface-item` → `surface-row` → `surface-control` → floating (`surface-dialog`, `surface-floating`, `.glass-surface`).
- Row states set `--row-tint` / `--row-wash`, never a background.
- Tints come from `panel` / `panel-raised`. Never accent mixes or raw `bg-white/[…]`.
- Nested corners are concentric: inner radius = outer − inset.
- Reuse `app.css` utilities (`.glass*`, `.glow-*`, `.safe-*`, `.mobile-sheet-*`) before adding new ones.
- Z-index only via `.layer-*`. Popover and menu content already sits above dialogs.
- Put standard `backdrop-filter` after its WebKit fallback.

**Shell and input**
- Layout adapts only through `useShellMode()`: `wide`, `laptop`, `tablet`, `phone`, plus `isTouch`.
- No raw breakpoint classes in components. Test both compact modes.
- A mouse gets the desktop UX at any window size.

**Compact**
- Creation is always the bottom-right orb.
- Bottom sheets are touch-only (`useShellMode()` `isPhone && isTouch`).
- Every sheet is a `UtilitySheet` over `ResponsiveOverlayPanel`: X left, heading centred, ✓ right. No bottom Cancel/submit.
- Sheet drag uses `use-sheet-gesture.ts`. Never hand-roll drag-to-dismiss.
- Pickers use `shared/PickerSurface`.
- Task right-click and long-press menus are desktop-only.
- Page headers: `layout/PageHeader`, or `PhonePageHeader` on phone.

**Readability and access**
- Twilight-muted text stays at `/90` opacity or above. Over a photo, opacity alone doesn't prove contrast.
- Semantic buttons and links, labelled fields, full keyboard operation.
- Visible focus. Never `outline-none` without a replacement.
- Touch targets ≥ 44×44px.
- Icon-only controls get `aria-label` + `Tip`, never `title=""`.
- A tooltip is never the only explanation of a touch action.
- `cursor-pointer` on custom interactive surfaces.

**Honest feedback**
- Show progress and failures beside the affected work.
- Entered text survives a failure, with a clear way to recover.
- "Saved on this device" and "synced" are different states.

## Startup

- Startup waits only for the entry route's missing first-screen data (`FIRST_SCREEN` in `use-workspace-startup.ts`).
- Never wait on decoration, the assistant or optional panels.
- On-demand UI mounts through `DeferredMount`. Visible lazy content uses `StartupSuspense`.

## Browser E2E

- Sign in at `/auth/sign-in` with `E2E_EMAIL` / `E2E_PASSWORD` from `apps/frontend/e2e_credentials.md` (git-ignored). Dev Neon branch only. Use a fresh browser context.
- User missing after a branch reset:
  1. `POST {VITE_NEON_AUTH_URL}/sign-up/email` with `Origin: http://localhost:8788` and `{email,password,name}`.
  2. Set `neon_auth."user"."emailVerified" = true` on the dev DB.
  3. Add the user id to `ADMIN_USER_IDS` in `apps/backend/.dev.vars`.

## Checklist

- Run the `modern-web-guidance` skill before writing HTML, CSS or client JS.
- Review the changed flow:
  - one obvious next step
  - keyboard and touch access
  - focus after close or resize
  - empty, pending, offline and error states
  - Undo or recovery
  - every mode above
- Browser resizing proves layout only. It doesn't prove real devices, assistive tech or the desktop shell.
