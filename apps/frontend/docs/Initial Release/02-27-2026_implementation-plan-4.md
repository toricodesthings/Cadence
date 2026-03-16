# Cadence Implementation Plan #4 — Design Refinement, Performance & Calendar

**Date:** February 27, 2026  
**Scope:** `cadence-frontend` (primary), `cadence-backend` (supporting)  
**Depends on:** Plans #1–#3 completed

---

## Objective

Bring Cadence from "working prototype" to a polished, fast, and visually cohesive product. This plan addresses three pillars:

1. **Design Refinement** — Every no-op/placeholder element receives a proper implementation with refined aesthetics per the Design Manifesto.
2. **Performance Optimization** — Diagnose and eliminate API latency bottlenecks; target sub-50ms perceived response times.
3. **Calendar View** — Transform the Schedule page into a multi-view calendar (Day/Week/Month/Year) rivaling Google Calendar in capability but rooted in Cadence's twilight aesthetic.

---

## Current State Audit

| Area | Status | Gaps |
|---|---|---|
| Sidebar minimize | ❌ No collapse/minimize behavior | No toggle icon, no animation |
| AddTaskInput | ⚠️ Functional but raw | Narrow, feels cramped, deadline icon always visible |
| DeadlinePickerPopover | ⚠️ Basic calendar + time | No quick-action icons, no Apple-style infinite scroll, no duration mode |
| Time on deadline | ⚠️ `TimePickerInput` exists | Backend already supports `scheduledStart` — but UX is buried and clunky |
| Task editing panel | ❌ No dedicated edit panel | Context menu exists but no full panel/drawer for editing a single task |
| Mini calendar (right) | ⚠️ Shows calendar | Does NOT filter tasks by selected date, no upcoming task preview |
| Duration (start+end) | ❌ Not exposed in UI | Backend has `scheduledStart` + `scheduledEnd` columns — zero frontend support |
| Priority visual indicators | ⚠️ Left stripe exists | Priority doesn't affect card styling beyond stripe; edit dialog doesn't reflect current priority |
| Task notes panel | ❌ No notes interface | `content` field exists in DB schema — no UI to read or write it |
| Sidebar color scheme | ⚠️ Functional | Nav icons use ad-hoc colors (cyan, red) — no cohesive system |
| API response time | ❌ Multi-second latency | Cold-start Hyperdrive connections, no connection reuse optimization |
| Schedule calendar | ⚠️ Month view only | No Day/Week/Year views, no task rendering inside calendar cells |

---

## Task 1: Design Refinement

### 1.1 — Sidebar Minimize/Collapse

**Goal:** Both the IconRail and SidebarPanel can be collapsed independently with smooth animation.

**Implementation:**

- **New file:** `app/stores/sidebar-store.ts` — Zustand store (first store in the app)
  ```typescript
  import { create } from "zustand";
  import { persist } from "zustand/middleware";

  interface SidebarState {
      panelCollapsed: boolean;
      togglePanel: () => void;
  }

  export const useSidebarStore = create<SidebarState>()(
      persist(
          (set) => ({
              panelCollapsed: false,
              togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
          }),
          { name: "cadence-sidebar" }
      )
  );
  ```

- **Modify `Sidebar.tsx`:**
  - Import `useSidebarStore`
  - Wrap `SidebarPanel` in a `motion.div` with `animate={{ x: panelCollapsed ? -224 : 0 }}` and clip the overflow via the parent container
  - **Do NOT animate `width`** — the Design Manifesto forbids animating layout properties. Use `translateX` (a GPU-composited transform) to slide the panel off-screen while keeping its rendered width constant.
  - The parent container uses `overflow: hidden` to clip the translated panel
  - Transition: `type: "spring", stiffness: 400, damping: 35` (snappy but not jarring — like a drawer gliding shut)

- **Modify `IconRail.tsx`:**
  - Add a collapse toggle button below the logo (icon: `PanelLeftClose` when expanded, `PanelLeftOpen` when collapsed)
  - Wire to `useSidebarStore().togglePanel`
  - Position: below logo, above nav icons, with a subtle divider

- **Install dependency:**
  ```bash
  bun add zustand
  ```

- **Animation CSS tokens** (add to `app.css`):
  ```css
  :root {
      --sidebar-transition: 300ms var(--ease-out-expo);
  }
  ```

**Acceptance Criteria:**
- SidebarPanel slides off-screen via `translateX` with spring animation (no width/height animation)
- IconRail always remains visible (56px)
- State persists across page reloads via `localStorage`
- Keyboard shortcut: `Cmd/Ctrl + [` toggles sidebar

---

### 1.2 — AddTaskInput Redesign

**Goal:** A spacious, polished input that feels like a premium text field — not a cramped afterthought.

**Modify `app/components/tasks/AddTaskInput.tsx`:**

**Layout changes:**
- Increase padding: `px-6 py-5` → feel roomier
- Input text size: `text-[15px]` → `text-base` (16px)
- Placeholder text: "What needs to be done?" (more inviting than "Add a task…")
- Focus state: entire container gets `border-lantern/20` glow + `bg-white/[0.02]` via `focus-within`
- Plus icon: transitions to `text-lantern` on `focus-within`
- Remove the dashed border; use solid `border-twilight-border` with a subtle glow on focus

**Deadline icon behavior:**
- Deadline `<Calendar>` button is hidden by default (`opacity-0`)
- On `focus-within` of the parent container, the button fades in (`opacity-100`) with `transition-opacity duration-200`
- If a deadline IS already set (non-null `dueDate`), the icon is always visible (showing the date label)

**Structural JSX:**
```tsx
<div className={`
    flex items-center gap-4 rounded-2xl border px-6 py-5 
    transition-[border-color,background-color,box-shadow] duration-200 group/input
    ${isFocused 
        ? "border-lantern/20 bg-white/[0.02] shadow-[0_0_20px_rgba(232,164,74,0.06)]"
        : "border-twilight-border hover:border-twilight-border-light"
    }
`}>
<!-- NOTE: Never use transition-all (Design Manifesto). Always specify explicit properties. -->
    <Plus size={18} className={`shrink-0 transition-colors ${isFocused ? "text-lantern" : "text-twilight-text-muted"}`} />
    <input ... className="flex-1 bg-transparent text-base ..." />
    <div className={`transition-opacity duration-200 ${isFocused || deadline.dueDate ? "opacity-100" : "opacity-0"}`}>
        <DeadlinePickerPopover ... />
    </div>
</div>
```

**State:** Track `isFocused` via `onFocus`/`onBlur` on the input element.

---

### 1.3 — DeadlinePickerPopover Overhaul

**Goal:** A premium date picker with icon-only quick actions, Apple-style month scrolling, and integrated time.

**Modify `app/components/tasks/DeadlinePickerPopover.tsx`:**

#### Quick Actions Row (Top)
- **4 icon-only buttons** in a horizontal row with tooltips:
  - `Sun` → Today
  - `Sunrise` → Tomorrow
  - `CalendarArrowUp` → Next Week (7 days from now)
  - `CalendarClock` → Next Monday
- Each button: `w-9 h-9 rounded-xl` with hover glow
- Active state: `bg-lantern/12 text-lantern` if selected date matches the preset
- Remove the current `DeadlineQuickActions.tsx` text labels — icons only

#### Calendar Section
- **Infinite vertical scroll** using a virtualized approach:
  - Render current month + 1 month above + 1 month below
  - On scroll past threshold, shift months and re-render (recycle pattern)
  - Each month has its own header: `"March 2026"` in `font-display text-xs font-semibold text-twilight-text-muted`
  - Scrollable area: `max-h-[280px]` with `ScrollArea` primitive
  - Months transition smoothly like Apple Calendar — no hard page breaks
- **Selected day:** `bg-lantern text-twilight-void rounded-full`
- **Today indicator:** ring of `border-lantern/40`
- **Days with tasks:** amber dot below the number (reuse `datesWithTasks` pattern from CalendarView)

#### Time Integration
- Below the calendar, before recurrence:
  - **Toggle row:** Clock icon + "Add time" label — clicking reveals the time picker inline
  - When time is active: show `TimePickerInput` inline, right-aligned
  - The time picker itself gets a visual refresh:
    - Larger tap targets (44px buttons)
    - `font-display text-lg` for the time value
    - AM/PM as a pill toggle (`bg-lantern/12` for active)

#### Popover Width
- Increase from `w-[280px]` → `w-[300px]` for breathing room

---

### 1.4 — Duration Mode (Start + End Date)

**Goal:** Users can set a task to span multiple days with a start and end date, as an alternative to a fixed deadline.

#### Backend Changes (`cadence-backend`)

The backend already supports `scheduledStart` and `scheduledEnd` columns. No schema changes needed.

**Modify `src/types/task.ts`:**
- `scheduledEnd` already accepts `z.iso.datetime()` — no Zod changes needed

**Verify `buildTaskWhereClause`** in `src/routes/tasks.ts`:
- Already handles `scheduledRangeStart` + `scheduledRangeEnd` with `between()` on both `scheduledStart` and `dueDate`
- Extend to also check `scheduledEnd` falls within the range:
  ```typescript
  if (filters.scheduledRangeStart && filters.scheduledRangeEnd) {
      conditions.push(
          or(
              between(tasks.scheduledStart, filters.scheduledRangeStart, filters.scheduledRangeEnd),
              between(tasks.scheduledEnd, filters.scheduledRangeStart, filters.scheduledRangeEnd),
              between(tasks.dueDate, filters.scheduledRangeStart, filters.scheduledRangeEnd),
              // Task spans across the range
              and(
                  lte(tasks.scheduledStart, filters.scheduledRangeStart),
                  gte(tasks.scheduledEnd, filters.scheduledRangeEnd)
              )
          )
      );
  }
  ```

#### Frontend — DeadlinePickerPopover Extension

**Add a mode toggle** at the top of the popover, below the quick actions:

```
  [ Fixed Deadline ]    [ Duration ]
```

- Two pill-shaped tabs: `"Deadline"` (default) and `"Duration"`
- In **Deadline mode** (default): Current behavior — select one date
- In **Duration mode:**
  - Calendar supports **range selection** (click start date, click end date)
  - Selected range is highlighted with `bg-lantern/8` between start and end, with `bg-lantern rounded-full` on endpoints
  - Below calendar, show: `"Feb 27 → Mar 3"` label with `ArrowRight` icon between dates
  - Time picker is available for both start and end times
  - On submit: `onChange` emits `scheduledStart` + `scheduledEnd` (both ISO datetime strings)

**Update `AddTaskInput.tsx` deadline state:**
```typescript
const [deadline, setDeadline] = useState<{
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;    // NEW
    recurrenceRule: string | null;
    isAllDay: boolean;
}>({ ... });
```

**Update `useCreateTask` call** to include `scheduledEnd` when in duration mode.

**Update `TaskCard.tsx`** to display duration:
- When `scheduledStart` AND `scheduledEnd` both exist, show: `"Feb 27 – Mar 3"` with a `CalendarRange` icon
- When only `dueDate` exists, show: `"Mar 3"` with `Calendar` icon (current behavior)

---

### 1.5 — Task Editing Panel

**Goal:** Clicking a task opens a rich editing panel that replaces the calendar sidebar.

**New file:** `app/components/tasks/TaskEditPanel.tsx`

**Behavior:**
- Clicking any `TaskCard` sets `selectedTaskId` state in the planner route
- The right panel (320px) transitions from `CalendarView` to `TaskEditPanel` with a crossfade
- Clicking outside a task (background, another panel, etc.) closes the edit panel and restores `CalendarView`

**Layout of TaskEditPanel:**

```
┌─────────────────────────────┐
│  ← Back          ⋯ Actions │  ← Header bar
├─────────────────────────────┤
│                             │
│  ○ Task Title               │  ← Editable, font-display text-xl
│                             │
├─────────────────────────────┤
│  [Calendar]  Deadline/Dur.  │  ← Click to open DeadlinePickerPopover
│  [Bell]      Reminder       │  ← Toggle + datetime
│  [Tag]       Tags           │  ← Horizontal pill row
│  [FolderOpen] Project       │  ← Dropdown selector
│  [Zap]       Priority       │  ← PriorityPicker inline
│  [Pin]       Pinned         │  ← Toggle switch
│  [Repeat]    Recurrence     │  ← RecurrencePicker
├─────────────────────────────┤
(All icons are Lucide SVGs — NO emojis as UI icons per Design Manifesto)
│                             │
│  Notes                      │  ← `textarea` auto-expanding
│  Free-form text area        │
│  (auto-saves on debounce)   │
│                             │
├─────────────────────────────┤
│  Created: Feb 24 · Updated: │  ← Footer metadata
│  Task ID: abc-123           │
└─────────────────────────────┘
```

**Component structure:**
```tsx
interface TaskEditPanelProps {
    taskId: string;
    onClose: () => void;
}

export function TaskEditPanel({ taskId, onClose }: TaskEditPanelProps) {
    // Fetch full task data
    // Local state for editable fields
    // Auto-save via debounced useUpdateTask
}
```

**Section details:**

1. **Header:** Back arrow (`ArrowLeft`) + task title truncated + actions dropdown (`MoreHorizontal`) with Delete, Duplicate, Archive
2. **Title:** Inline-editable `input` or `contentEditable` div — large `font-display text-xl font-medium` — saves on blur or Enter
3. **Metadata rows:** Each row is a flex row with icon + label + value/control. Rows are **not** separated by `Separator` lines — generous `py-3` vertical spacing alone defines boundaries (per the Manifesto's "implied boundaries, not boxes" principle). Use at most **one** `Separator` to divide the metadata group from the notes section below.
   - Height per row: `py-3` — generous touch targets
   - Icon: 16px, `text-twilight-text-muted` (Lucide SVG — never emoji)
   - Label: `text-sm text-twilight-text-soft`
   - Value/control: right-aligned
4. **Notes area:** `<textarea>` with `bg-transparent`, `resize-none`, auto-expanding height
   - Placeholder: "Add notes…"
   - Auto-save: debounce 800ms → `useUpdateTask.mutate({ content: value })`
   - `font-sans text-sm leading-relaxed text-twilight-text`
5. **Footer:** `text-[11px] text-twilight-text-muted` with created/updated timestamps

**Animation:** Panel slides in from right with `framer-motion`:
```tsx
<AnimatePresence mode="wait">
    {selectedTaskId ? (
        <motion.div
            key="edit-panel"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
            <TaskEditPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
        </motion.div>
    ) : (
        <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CalendarView />
        </motion.div>
    )}
</AnimatePresence>
```

---

### 1.6 — Mini Calendar as Filter + Upcoming Preview

**Goal:** The right-side mini calendar acts as a date filter AND shows upcoming task counts.

**Modify `app/components/calendar/CalendarView.tsx`:**

- Fetch tasks for the visible month (already done via `datesWithTasks`)
- On day click: update `?date=YYYY-MM-DD` search param (already done)
- **NEW:** Below the calendar grid, add an "Upcoming" preview section:
  ```
  ┌──────────────────────────┐
│  [Calendar] Feb 2026  < > │
│  [calendar grid]           │
├────────────────────────────┤
│  Upcoming                  │
│  ────────────────────────  │
│  Today · Fix auth bug      │  ← first task title, personal
│  Tomorrow · 1 task         │
│  Feb 29 · 2 tasks          │
└────────────────────────────┘
  ```
(Icons are Lucide SVGs — no emojis)

- Fetch the next 7 days of tasks via `useTasks({ state: "ACTIVE", scheduledRange: { start: today, end: next7Days } })`
- Group by date. For today and tomorrow, show the **first task title** inline (more personal and inviting than a bare count). For other days, show count.
- Each row is clickable → sets `?date=` filter

**Modify `app/routes/home.tsx`:**

- When `selectedDate` is set AND differs from today, show a filter indicator in `PlannerHeader`:
  ```
  ✦ Filtering: February 28, 2026  [✕ Clear]
  ```
- Task list already filters by `scheduledDate` — this is already wired correctly

---

### 1.7 — Priority Visual Indicators Enhancement

**Goal:** Priority is visually prominent on task cards and auto-reflected in the edit panel.

**CSS variable definitions** (add to `app/app.css` `@theme` block):
```css
--color-priority-low: #60a5fa;      /* soft blue */
--color-priority-medium: var(--color-lantern);  /* warm amber */
--color-priority-high: #f59e0b;     /* deep amber-orange — warm, not alarming */
--color-priority-urgent: #e87461;   /* warm coral — urgent but soft, not fire-engine red */
```

> **Design Manifesto compliance:** All priority colors are defined once as CSS variables — never hardcoded Tailwind colors like `bg-red-500` or `bg-orange-400`.

**Modify `TaskCard.tsx`:**

| Priority | Left Bar | Title Color | Background Tint | Icon |
|---|---|---|---|---|
| 0 (None) | None | Default | None | None |
| 1 (Low) | `bg-priority-low` | Default | None | None |
| 2 (Medium) | `bg-priority-medium` | Default | `bg-priority-medium/[0.02]` | None |
| 3 (High) | `bg-priority-high` | Default | `bg-priority-high/[0.02]` | Small `AlertTriangle` icon |
| 4 (Urgent) | `bg-priority-urgent` + steady warm glow | Default | `bg-priority-urgent/[0.03]` | `AlertTriangle` icon (NOT `AlertOctagon` — avoid alarm-sign anxiety) |

**Urgent bar glow** — steady, not pulsing:

The Design Manifesto says motion should feel *"like leaves settling, not machines clicking."* A pulsing red bar is anxiety-inducing and contradicts the sanctuary tone. Instead, use a **persistent warm glow** — always present, never blinking:
```css
.priority-urgent-bar {
    box-shadow: 0 0 6px var(--color-priority-urgent-glow, color-mix(in srgb, var(--color-priority-urgent) 40%, transparent));
}
```
No `animation`, no `@keyframes`. The urgency is conveyed by the warm coral color intensification and the `AlertTriangle` icon — persistent visual weight, not alarm-clock behavior.

**TaskEditPanel integration:**
- `PriorityPicker` in the edit panel auto-selects the task's current priority on mount
- Changing priority immediately reflects on the task card via optimistic update

---

### 1.8 — Task Notes Panel (Content Editor)

This is covered within §1.5 (TaskEditPanel). The notes section:

- Uses the existing `content` field on the `Task` type (`text`, max 10,000 chars)
- `<textarea>` with auto-expand (via `scrollHeight` recalculation on input)
- Debounced auto-save (800ms) using `useUpdateTask.mutate({ content })`
- Character count shown subtly at bottom-right: `"234 / 10,000"` in `text-twilight-text-muted text-[10px]`
- Markdown rendering is **deferred to a future plan** — raw text only for now

---

### 1.9 — Main Sidebar Color Scheme Refinement

**Goal:** Each nav icon in `IconRail` + `SidebarPanel` has a cohesive, intentional color.

**CSS variable definitions** (add to `app/app.css` `@theme` block):
```css
--color-nav-planner: var(--color-lantern);       /* warm amber — home base */
--color-nav-schedule: var(--color-moonlit);       /* cool blue — calm overview */
--color-nav-upcoming: #34d399;                    /* soft emerald — forward-looking */
--color-nav-inbox: #a78bfa;                       /* gentle violet — incoming */
--color-nav-completed: #4ade80;                   /* fresh green — accomplished */
```

> **Design Manifesto compliance:** All nav accent colors are defined once as CSS variables. Components reference semantic Tailwind classes (`text-nav-planner`, `bg-nav-schedule/15`) instead of hardcoded Tailwind palette colors. Trash uses existing `twilight-text-muted` — no new variable needed.

**Color system for nav items:**

| Item | Icon | Active Color | Active BG | Hover Color |
|---|---|---|---|---|
| Planner | `LayoutDashboard` | `text-nav-planner` | `bg-nav-planner/15` | `text-nav-planner/70` |
| Schedule | `Calendar` | `text-nav-schedule` | `bg-nav-schedule/15` | `text-nav-schedule/70` |
| Upcoming | `CalendarRange` | `text-nav-upcoming` | `bg-nav-upcoming/15` | `text-nav-upcoming/70` |
| Inbox | `Inbox` | `text-nav-inbox` | `bg-nav-inbox/15` | `text-nav-inbox/70` |
| Completed | `CheckCircle2` | `text-nav-completed` | `bg-nav-completed/15` | `text-nav-completed/70` |
| Trash | `Trash2` | `text-twilight-text-muted` | `bg-white/[0.06]` | `text-twilight-text-soft` |

**Modify `NavLink.tsx`:**
- Accept `activeColor` and `activeBg` props
- Apply dynamically based on active state
- Default fallback: current `nav-planner` (lantern) scheme

**Modify `IconRail.tsx`:**
- Update Planner link: `text-nav-planner` + `bg-nav-planner/15` (warm, matches logo)
- Update Schedule link: `text-nav-schedule` + `bg-nav-schedule/15` (cool blue — calendar = calm overview)

---

## Task 2: Performance Optimization

### 2.1 — Diagnosis

**Current architecture bottlenecks:**

| Layer | Issue | Impact |
|---|---|---|
| **Hyperdrive cold start** | `createDbClient()` creates a new `postgres()` connection per request — Hyperdrive must establish a pooled connection each time | 200–800ms per request in dev |
| **JWT verification** | `jwtVerify()` fetches JWKS + verifies on every request — JWKS is cached in-memory but JWT decode still adds ~50ms | Cumulative per request |
| **Auth middleware user sync** | `db.insert(users).values({ id }).onConflictDoNothing()` runs on EVERY request to ensure user exists | Extra DB round-trip per request |
| **RLS context** | `setRlsContext()` executes `SET LOCAL` SQL statement before every query | Extra DB round-trip per request |
| **Frontend: no request dedup** | Multiple components may trigger identical `useTasks()` queries simultaneously | Redundant network calls |
| **Frontend: no prefetching** | Navigation between routes triggers cold fetches with loading spinners | Perceived latency |

### 2.2 — Backend Optimizations

#### 2.2.1 — Connection Reuse via Hyperdrive

**Current:**
```typescript
export function createDbClient(env: Env) {
    const client = postgres(env.HYPERDRIVE.connectionString);
    return drizzle(client, { schema });
}
```

**Problem:** Each invocation of `postgres()` bootstraps a new client. Hyperdrive handles pooling at the proxy level, but the JS client still has overhead.

**Solution:** Use `postgres`'s `{ prepare: false }` option (required for Hyperdrive) and ensure we're not creating unnecessary overhead:
```typescript
export function createDbClient(env: Env) {
    const client = postgres(env.HYPERDRIVE.connectionString, {
        prepare: false,          // Required for Hyperdrive connection pooling
        idle_timeout: 0,         // Let Hyperdrive manage lifecycle
        connect_timeout: 10,     // 10s connect timeout
    });
    return drizzle(client, { schema });
}
```

> **Note:** Cloudflare Workers are stateless — we cannot truly persist a connection across requests. But `prepare: false` eliminates the prepared statement overhead that breaks Hyperdrive's pooling.

#### 2.2.2 — Auth Middleware: Skip User Sync on Read Requests

**Current:** Every request (including GETs) runs `INSERT ... ON CONFLICT DO NOTHING` for user sync.

**Optimized approach:**
```typescript
// Only sync user on mutations — reads can assume user exists after first write
const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(c.req.method);
if (isWrite) {
    try {
        const db = createDbClient(c.env as any);
        await db.insert(users).values({ id: payload.sub }).onConflictDoNothing();
    } catch (dbErr) {
        console.error("Failed to sync user:", dbErr);
    }
}
```

**Impact:** Eliminates 1 DB round-trip from every GET request.

#### 2.2.3 — Combine RLS + Query into Single Transaction

**Current:** Two sequential queries per endpoint:
1. `SET LOCAL app.user_id = '...'` (RLS context)
2. `SELECT * FROM tasks WHERE ...` (actual query)

**Optimized — `lib/rls.ts`:**

Export a helper that wraps both in a single `db.transaction()`:
```typescript
export async function withRls<T>(
    db: ReturnType<typeof createDbClient>,
    userId: string,
    fn: (tx: typeof db) => Promise<T>
): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
        return fn(tx as any);
    });
}
```

**Usage in routes:**
```typescript
// Before (2 round-trips):
await setRlsContext(db, userId);
const items = await db.select().from(tasks).where(...);

// After (1 round-trip via transaction):
const items = await withRls(db, userId, async (tx) => {
    return tx.select().from(tasks).where(...);
});
```

**Impact:** Reduces every endpoint from 2 DB round-trips to 1 transaction.

#### 2.2.4 — Add Cache-Control Headers for GET Endpoints

Cloudflare Workers can leverage the edge cache. For task list reads:

```typescript
// In task GET routes:
c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
```

This tells the browser to always revalidate but serves stale content instantly while doing so.

### 2.3 — Frontend Optimizations

#### 2.3.1 — React Query Stale Time Tuning

**Current `providers.tsx`:**
```typescript
staleTime: 2 * 60 * 1000,  // 2 minutes
```

**Issue:** 2 minutes is too long for a productivity app where changes are frequent, but too short to prevent constant refetching during navigation.

**Optimized strategy — differentiated stale times:**

```typescript
// In query-keys.ts, export stale time presets:
export const STALE_TIMES = {
    TASKS: 30 * 1000,        // 30s — tasks change frequently
    PROJECTS: 5 * 60 * 1000, // 5min — projects change rarely
    TAGS: 5 * 60 * 1000,     // 5min — tags change rarely
    INBOX: 60 * 1000,        // 1min — inbox is async
} as const;
```

Apply per-hook:
```typescript
// In use-tasks.ts:
return useQuery({
    queryKey: ...,
    queryFn: ...,
    staleTime: STALE_TIMES.TASKS,
});
```

#### 2.3.2 — Route Prefetching

**Problem:** Navigating between Planner → Upcoming → Inbox triggers cold fetches.

**Solution:** Prefetch adjacent routes on hover/mount:

```typescript
// New utility: app/lib/utils/prefetch.ts
export function usePrefetchOnHover(queryKey: any[], queryFn: () => Promise<any>) {
    const queryClient = useQueryClient();
    return {
        onMouseEnter: () => {
            queryClient.prefetchQuery({ queryKey, queryFn, staleTime: 10_000 });
        },
    };
}
```

**Apply in `NavLink.tsx`:**
- Planner link: prefetches today's tasks
- Inbox link: prefetches inbox items
- Upcoming link: prefetches next 7 days tasks

#### 2.3.3 — Optimistic Updates: Eliminate Awaited Invalidation

**Current pattern:**
```typescript
onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
}
```

**Issue:** `invalidateQueries` triggers background refetch which briefly causes a flash if the optimistic data differs from server response.

**Optimized pattern — use `setQueryData` from mutation response:**
```typescript
onSuccess: (serverData) => {
    // Replace the optimistic placeholder with real server data
    queryClient.setQueryData(
        queryKeys.tasks.list(currentFilters),
        (old: Task[] | undefined) =>
            old?.map(t => t.id === serverData.id ? serverData : t) ?? []
    );
},
onSettled: () => {
    // Soft background refetch — won't cause flash because data is already correct
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all, refetchType: "none" });
}
```

#### 2.3.4 — Debounce Auto-Save Operations

For the new TaskEditPanel's notes and title editing:
- **Title:** Save on blur or Enter (no debounce needed — discrete events)
- **Notes:** Debounce 800ms — use a custom `useDebouncedCallback` hook
- **Priority/Tags/etc:** Immediate (optimistic mutation as current)

**New hook:** `app/hooks/use-debounced-callback.ts`
```typescript
import { useRef, useCallback } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => void>(
    callback: T,
    delay: number
): T {
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
    return useCallback((...args: any[]) => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => callback(...args), delay);
    }, [callback, delay]) as T;
}
```

### 2.4 — Performance Budget

| Metric | Current (est.) | Target |
|---|---|---|
| Task list load (cached) | 50–100ms (stale-while-revalidate) | <20ms (from cache, bg refresh) |
| Task create (perceived) | <50ms (optimistic) | <50ms (no change needed) |
| Task update (perceived) | <50ms (optimistic) | <50ms (no change needed) |
| API cold GET | 1–3 seconds | <300ms (Hyperdrive warm) |
| API warm GET | 500ms–1s | <100ms |
| Route navigation | 200–500ms (cold fetch) | <100ms (prefetched) |

---

## Task 3: Calendar View — Multi-View Schedule

### 3.1 — View System Architecture

**Modify `app/routes/schedule.tsx`:**

Add a view mode state and switcher:
```typescript
type CalendarViewMode = "day" | "week" | "month" | "year";
const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
```

**Header extension:**
```
┌──────────────────────────────────────────────────────┐
│  ❄ February 2026     Today  < >   [Day][Week][Mo][Yr]│
└──────────────────────────────────────────────────────┘
```

- View mode switcher: 4 pill buttons in a segmented control
- Active pill: `bg-white/[0.08] text-twilight-text`
- Inactive pill: `text-twilight-text-muted hover:text-twilight-text-soft`
- Container: `glass` background, `rounded-xl`, `p-0.5`

### 3.2 — Month View (Current — Enhanced)

**Current state:** Grid of day numbers with dot indicators.

**Enhancement — Task previews inside cells:**

**Modify `CalendarDayCell.tsx` (variant="full"):**

Each cell becomes taller and shows up to 3 task titles:
```
┌─────────────────┐
│  27              │
│  ● Buy groceries │
│  ● Team standup  │
│  + 2 more        │
└─────────────────┘
```

- Task titles: `text-[11px] text-twilight-text-soft truncate`
- Each task has a left-edge color indicator matching priority
- Duration tasks (start→end) span across cells with a connecting bar:
  - Bar: `h-5 bg-lantern/15 border-l-2 border-lantern rounded-r-md` spanning from start to end cell
  - Task title only shown in the start cell
- "+N more" link: `text-[10px] text-lantern/70`
- Maximum cell height: distribute evenly across 5–6 rows in the grid

**Data flow:**
- Fetch all tasks for the visible month (already done)
- Group tasks by date → pass `tasksForDay` prop to each `CalendarDayCell`
- Duration tasks: check if `scheduledStart` ≤ day ≤ `scheduledEnd` and render the bar

### 3.3 — Week View (New)

**New component:** `app/components/calendar/WeekView.tsx`

**Layout — Google Calendar style but with twilight aesthetic:**

```
         Mon 24    Tue 25    Wed 26    Thu 27    Fri 28    Sat 29    Sun 30
────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────
  All   │ Buy gro │         │ Dentist │         │         │         │
  Day   │ ceries  │         │         │         │         │         │
────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────
  8 AM  │         │         │         │         │         │         │
────────┤         │         ├─ Team   ─┤         │         │         │
  9 AM  │         │         │ Standup │         │         │         │
────────┤         │         ├─────────┤         │         │         │
 10 AM  │         │         │         │         │         │         │
  ...
```

**Design language:**
- Time gutter: `w-16` left column with hour labels in `text-[11px] text-twilight-text-muted`
- Hour grid lines: `border-twilight-border/50` (faded, not harsh)
- Half-hour lines: `border-twilight-border/20` (barely visible)
- Column separators: `border-twilight-border/30`
- Current time indicator: `border-t-2 border-lantern` horizontal line across the current day column at the correct hour position
- Today column: `bg-lantern/[0.02]` subtle warm tint

**Task rendering in cells:**
- Tasks with specific times (`scheduledStart` with `isAllDay: false`): positioned absolutely based on time, height = duration or 1hr default
- All-day tasks: rendered in the "All Day" row at the top
- Task chip styling:
  ```
  rounded-lg bg-lantern/12 border-l-2 border-lantern px-2 py-1
  text-[11px] text-twilight-text font-medium
  ```
- Duration tasks spanning multiple days: rendered as horizontal bars in the "All Day" section
- Overlapping tasks: stack side-by-side with reduced width (Google Calendar behavior)

**Interactions:**
- Horizontal scroll on overflow (if many all-day tasks)
- Vertical scroll for time grid (default scroll position: 8 AM)
- Today button jumps to current week

**Navigation:**
- Left/Right arrows: ±1 week
- Title shows: `"Feb 24 – Mar 2, 2026"`

### 3.4 — Day View (New)

**New component:** `app/components/calendar/DayView.tsx`

**Layout — Single column time grid:**

```
┌──────────────────────────────────────┐
│  Thursday, February 27               │
│  ──────────────────────────────────  │
│  All Day: Buy groceries, Submit form │
├──────────────────────────────────────┤
│  7 AM  │                             │
│  8 AM  │                             │
│  9 AM  │ ┌──────────────────────┐   │
│        │ │ Team Standup         │   │
│ 10 AM  │ │ 9:00 – 10:00 AM     │   │
│        │ └──────────────────────┘   │
│ 11 AM  │                             │
│  ...                                 │
```

- Wider task chips than week view: full width of the day column
- Task chip: `rounded-xl bg-lantern/10 border-l-3 border-lantern p-3`
- More detail shown: title + time range + project name
- Current time: `border-t-2 border-lantern` with a small dot on the left edge

### 3.5 — Year View (New)

**New component:** `app/components/calendar/YearView.tsx`

**Layout — 12 mini calendars in a 4×3 or 3×4 grid:**

```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ January  │ │ February│ │  March  │ │  April  │
│ [mini]   │ │ [mini]  │ │ [mini]  │ │ [mini]  │
├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤
│   May   │ │  June   │ │  July   │ │ August  │
│ [mini]   │ │ [mini]  │ │ [mini]  │ │ [mini]  │
├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤
│September│ │ October │ │November │ │December │
│ [mini]   │ │ [mini]  │ │ [mini]  │ │ [mini]  │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

- Each mini calendar: reuse `CalendarGrid` in `variant="compact"` but with even smaller sizing
- Day numbers: `text-[10px]` (minimum legible size — never smaller)
- Each day cell has `min-w-[24px] min-h-[24px]` padding for click targets (year view is nav-secondary, so 24px is acceptable rather than the full 44px required for primary actions)
- Months with tasks: dot indicators on days with tasks
- Click a month → switch to Month view for that month
- Click a specific day → switch to Day view for that day
- Current month: subtle `border border-lantern/20 rounded-xl` highlight
- Today: amber dot (same pattern as compact calendar)

**Data:** Fetch task counts per month for the year (new `useTasks` call with year-wide range — consider a dedicated lightweight endpoint in a future plan for efficiency).

### 3.6 — Schedule View Components Summary

| Component | File | Status |
|---|---|---|
| `ScheduleHeader` | `app/components/calendar/ScheduleHeader.tsx` | **New** — extracted from `schedule.tsx` with view mode switcher |
| `MonthView` | Existing `CalendarGrid` variant="full" | **Modify** — add task previews in cells |
| `WeekView` | `app/components/calendar/WeekView.tsx` | **New** |
| `DayView` | `app/components/calendar/DayView.tsx` | **New** |
| `YearView` | `app/components/calendar/YearView.tsx` | **New** |
| `TimeGutter` | `app/components/calendar/TimeGutter.tsx` | **New** — shared by Day + Week views |
| `CalendarTaskChip` | `app/components/calendar/CalendarTaskChip.tsx` | **New** — task rendering within calendar cells |

### 3.7 — Neurodivergent-Friendly Design Considerations

Per the Design Manifesto, the calendar must not feel like a sterile spreadsheet:

1. **Soften the grid:** Lines are `border-twilight-border/30`, not solid — implied boundaries, not boxes
2. **Warm hover states:** Hovering a time slot warms its background by `bg-white/[0.02]` — like lantern light approaching
3. **Generous spacing:** Hour rows are at least `h-14` (56px) — not cramped 40px rows
4. **Today glow:** Current day column has a `bg-lantern/[0.02]` warmth + `border-t-2 border-lantern` time indicator
5. **Organic transitions:** View switching uses `framer-motion` crossfade with `duration: 0.25` and a subtle `y: 4` → `y: 0` drift (content settles like mist, not a hard cut)
6. **No information overload:** Week view shows max 3 tasks per time slot, Day view shows all but with generous padding
7. **Color coding by priority, not project:** Priority colors (defined as CSS variables) are immediately meaningful; project colors are secondary (small dot/tag)

### 3.8 — Empty State Design

The Design Manifesto describes Cadence as a *"digital sanctuary."* Empty moments should feel peaceful — not hollow or broken. Every calendar view and task list needs an intentional empty state:

**Calendar views (Day/Week with no tasks):**
- Show the time grid normally (the structure itself is calming)
- In the center of the empty space: a soft, low-opacity illustration or a single line of warm text
- Example: `"A clear day ahead"` in `text-twilight-text-muted font-display text-sm italic`
- No sad-face icons, no "Nothing here!" exclamations — these create anxiety

**Month view (day cell with no tasks):**
- Leave gracefully empty — the date number alone is sufficient
- No placeholder text inside cells (too noisy at scale)

**Task list (no tasks for selected date):**
- Center-aligned message: `"Nothing scheduled"` in `text-twilight-text-muted`
- Below it: a soft `text-[13px]` hint: `"Drag a task here or pick a date when adding one"`
- The empty state should feel like looking out a quiet window — space for possibility, not a void

**Year view (month with no tasks):**
- Simply show the mini calendar without dot indicators — no special empty treatment needed

> **Tone check:** Empty states are where "Warm, Cozy, Inviting" matter most. These moments should feel like a clean desk in a warm room — ready and welcoming, not sterile.

---

## Implementation Order & Dependencies

### Phase A — Foundation (do first)

| # | Task | Files | Depends On |
|---|---|---|---|
| A1 | Install Zustand | `package.json` | — |
| A2 | Create sidebar store | `app/stores/sidebar-store.ts` | A1 |
| A3 | Sidebar collapse animation | `Sidebar.tsx`, `IconRail.tsx` | A2 |
| A4 | Backend `createDbClient` optimization | `cadence-backend/src/lib/db.ts` | — |
| A5 | Backend `withRls` transaction helper | `cadence-backend/src/lib/rls.ts` | A4 |
| A6 | Backend auth middleware: skip user sync on GETs | `cadence-backend/src/lib/auth.ts` | — |
| A7 | Backend `buildTaskWhereClause` — add `scheduledEnd` range | `cadence-backend/src/routes/tasks.ts` | — |

### Phase B — Design Polish (after Phase A)

| # | Task | Files | Depends On |
|---|---|---|---|
| B1 | AddTaskInput redesign | `AddTaskInput.tsx` | — |
| B2 | DeadlinePickerPopover overhaul (quick actions, scroll, time) | `DeadlinePickerPopover.tsx`, `DeadlineQuickActions.tsx` | — |
| B3 | Duration mode in DeadlinePickerPopover | `DeadlinePickerPopover.tsx`, `AddTaskInput.tsx` | B2 |
| B4 | Priority visual enhancement on TaskCard | `TaskCard.tsx`, `app.css` | — |
| B5 | Nav icon color scheme refinement | `IconRail.tsx`, `NavLink.tsx`, `SidebarPanel.tsx` | — |
| B6 | React Query stale time tuning | `providers.tsx`, individual hooks | — |
| B7 | Route prefetching | `NavLink.tsx`, new `prefetch.ts` utility | B6 |

### Phase C — Major Features (after Phase B)

| # | Task | Files | Depends On |
|---|---|---|---|
| C1 | TaskEditPanel component | `app/components/tasks/TaskEditPanel.tsx` | B4 |
| C2 | Wire TaskEditPanel into home.tsx | `app/routes/home.tsx` | C1 |
| C3 | Mini calendar upcoming preview | `CalendarView.tsx` | — |
| C4 | Debounced auto-save hook | `app/hooks/use-debounced-callback.ts` | — |
| C5 | Notes section in TaskEditPanel | `TaskEditPanel.tsx` | C1, C4 |

### Phase D — Calendar Views (after Phase C)

| # | Task | Files | Depends On |
|---|---|---|---|
| D1 | Extract `ScheduleHeader` with view switcher | `ScheduleHeader.tsx`, `schedule.tsx` | — |
| D2 | `TimeGutter` shared component | `TimeGutter.tsx` | — |
| D3 | `CalendarTaskChip` component | `CalendarTaskChip.tsx` | — |
| D4 | Enhanced Month view (task previews in cells) | `CalendarDayCell.tsx`, `CalendarGrid.tsx` | D3 |
| D5 | Week view | `WeekView.tsx` | D2, D3 |
| D6 | Day view | `DayView.tsx` | D2, D3 |
| D7 | Year view | `YearView.tsx` | — |
| D8 | Wire all views into schedule.tsx | `schedule.tsx` | D1, D4, D5, D6, D7 |

---

## New Files Summary

| File | Type | Purpose |
|---|---|---|
| `app/stores/sidebar-store.ts` | Store | Sidebar collapse state (Zustand + persist) |
| `app/hooks/use-debounced-callback.ts` | Hook | Generic debounced callback for auto-save |
| `app/lib/utils/prefetch.ts` | Utility | Route prefetch helper for React Query |
| `app/components/tasks/TaskEditPanel.tsx` | Component | Full task editing right panel |
| `app/components/calendar/ScheduleHeader.tsx` | Component | Schedule page header with view mode switcher |
| `app/components/calendar/WeekView.tsx` | Component | Full week time-grid view |
| `app/components/calendar/DayView.tsx` | Component | Single day time-grid view |
| `app/components/calendar/YearView.tsx` | Component | 12-month overview grid |
| `app/components/calendar/TimeGutter.tsx` | Component | Time labels column (shared by Day + Week) |
| `app/components/calendar/CalendarTaskChip.tsx` | Component | Task rendering within calendar cells |

## Modified Files Summary

| File | Changes |
|---|---|
| `cadence-backend/src/lib/db.ts` | Add `prepare: false` + connection options |
| `cadence-backend/src/lib/rls.ts` | Add `withRls()` transaction wrapper |
| `cadence-backend/src/lib/auth.ts` | Skip user sync on GET requests |
| `cadence-backend/src/routes/tasks.ts` | Extend `scheduledEnd` range query |
| `app/components/sidebar/Sidebar.tsx` | Collapse animation with framer-motion |
| `app/components/sidebar/IconRail.tsx` | Add collapse toggle + color refinement |
| `app/components/sidebar/NavLink.tsx` | Accept configurable active colors |
| `app/components/sidebar/SidebarPanel.tsx` | Update nav item colors |
| `app/components/tasks/AddTaskInput.tsx` | Full redesign (spacing, focus states, visibility) |
| `app/components/tasks/DeadlinePickerPopover.tsx` | Overhaul (icons, scroll, duration, width) |
| `app/components/tasks/DeadlineQuickActions.tsx` | Icon-only buttons with tooltips |
| `app/components/tasks/TaskCard.tsx` | Priority visual tiers + duration display |
| `app/components/calendar/CalendarView.tsx` | Add upcoming preview section |
| `app/components/calendar/CalendarDayCell.tsx` | Task preview rendering in full variant |
| `app/components/calendar/CalendarGrid.tsx` | Pass task data to day cells |
| `app/routes/home.tsx` | TaskEditPanel integration + selected task state |
| `app/routes/schedule.tsx` | View mode switcher + multi-view rendering |
| `app/providers.tsx` | Differentiated stale times |
| `app/app.css` | Priority color CSS variables + nav color CSS variables + sidebar transition token + urgent steady glow class |
| `app/lib/api/query-keys.ts` | Export `STALE_TIMES` constants |
| `app/types/task.ts` | Add `scheduledEnd` to `UpdateTaskInput` (if not already) |

---

## Testing Checklist

### Design Refinement
- [ ] Sidebar collapses/expands with smooth spring animation (via `translateX`, NOT width)
- [ ] Sidebar state persists across page reloads
- [ ] `Cmd+[` keyboard shortcut toggles sidebar
- [ ] AddTaskInput feels spacious; deadline icon shows only on focus
- [ ] DeadlinePickerPopover shows 4 icon-only quick action buttons
- [ ] Apple-style calendar scrolling works (month transitions)
- [ ] Time picker integrates cleanly within the popover
- [ ] Duration mode allows selecting start + end dates
- [ ] Duration tasks display correctly on TaskCard (`"Feb 27 – Mar 3"`)
- [ ] TaskEditPanel opens when clicking a task, replaces calendar panel
- [ ] TaskEditPanel auto-saves notes with debounce
- [ ] Clicking outside a task card restores the calendar panel
- [ ] Priority 4 (Urgent) shows **steady** warm coral glow on left bar + tinted background (NO pulsing animation)
- [ ] All priority colors reference CSS variables, not hardcoded Tailwind palette colors
- [ ] Priority auto-selects in TaskEditPanel on open
- [ ] Mini calendar filters task list by selected date
- [ ] Upcoming preview shows first task title for today/tomorrow, counts for other days
- [ ] All nav icons use cohesive CSS-variable-based color scheme (no hardcoded Tailwind colors)

### Performance
- [ ] Backend GET requests complete in <300ms (warm Hyperdrive)
- [ ] Navigating between routes shows no loading spinner (prefetched data)
- [ ] Notes auto-save doesn't fire on every keystroke (800ms debounce)
- [ ] No flash/flicker after optimistic update reconciliation

### Calendar Views
- [ ] View mode switcher renders correctly (Day/Week/Month/Year pills)
- [ ] Month view shows task titles inside day cells
- [ ] Duration tasks span across cells with visual bar
- [ ] Week view renders time grid with correct hour positions
- [ ] Week view shows current time indicator
- [ ] Day view displays full task details in time slots
- [ ] Year view renders 12 mini calendars
- [ ] Year view click-through: month → month view, day → day view
- [ ] All views respect `prefers-reduced-motion`
- [ ] View transitions are smooth (framer-motion crossfade with subtle vertical drift)

### Empty States & Tone
- [ ] Day/Week view with no tasks shows warm, peaceful empty message ("A clear day ahead")
- [ ] Task list with no tasks for selected date shows inviting empty state with helpful hint
- [ ] No sad-face icons, exclamation marks, or anxiety-inducing empty states anywhere
- [ ] All `transition-*` classes use explicit properties (no `transition-all`)
- [ ] No emojis used as UI icons in any component (Lucide SVGs only)
- [ ] TaskEditPanel metadata rows use spacing only, not `Separator` between every row

---

## Out of Scope (Deferred)

- [ ] Adding tasks directly from calendar (click to create in time slot)
- [ ] Drag-and-drop tasks between calendar days/times
- [ ] Markdown rendering in task notes
- [ ] Full-text search implementation
- [ ] Light/Daylight theme implementation
- [ ] Mobile/responsive layout for calendar views
- [ ] AI-powered task scheduling
- [ ] Notification system implementation
- [ ] Tag management (edit/delete tags)
- [ ] Keyboard navigation within calendar grid
