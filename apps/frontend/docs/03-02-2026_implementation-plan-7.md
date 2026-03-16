# Cadence Implementation Plan #7 — Feature Evolution & Sanctuary Deepening

**Date:** March 2, 2026
**Scope:** `cadence-frontend` + `cadence-backend` coordination
**Depends on:** Plans #1–#6 completed, Habits system live
**Backend companion:** `cadence-backend/docs/03-02-2026_implementation-plan-backend.md`

---

## ✦ Guiding Philosophy

Every feature in this plan must pass the **Sanctuary Test** before implementation:

> _"Does this addition make the user feel calmer, more in control, and more at peace — or does it add noise, pressure, or cognitive weight?"_

**The Design Manifesto (§0)** defines Cadence as a _"Twilight Sanctuary"_ — a digital space that blends Cupertino precision with the warm, nature-atmospheric aesthetic of Genshin Impact's nighttime landscapes. Every new surface, control, and interaction must feel like it belongs in that warm, quiet room overlooking a vast, peaceful night landscape.

**Core constraints from the Manifesto that govern ALL work below:**

| Manifesto Rule                                                                      | Implication for This Plan                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| §1.1 Anti-SaaS: "No heavy cards, no dashboard metrics"                              | Effort dots, tag pills, and Kanban columns use implied boundaries — never boxed panels      |
| §1.2 Nature-Atmospheric: "Warm amber, frosted glass, organic precision"             | Every new UI element uses `glass-surface`, `glow-lantern`, `rounded-2xl`+                   |
| §3.2 Spacing: "White space is the night sky between the lanterns"                   | New fields (effort, tags, waiting) must NOT compress existing task card spacing             |
| §4.1 Tasks: "Smooth, warm surfaces floating gently"                                 | Subtasks inherit parent warmth — they are smaller lanterns, not spreadsheet rows            |
| §5 Animation: "No celebration, organic physics, interruptible"                      | Kanban drag, rescheduling, completion — all use `framer-motion` spring physics              |
| §6.1 Accessibility: "Every interactive element must have a visible focus indicator" | Keyboard command layer must enhance, not replace, mouse/touch interaction                   |
| §6.2 Icons: "NO EMOJIS. Use clean SVGs (Lucide)"                                    | Effort dots use CSS-rendered circles, not emoji. Tags use `#` prefix text, not emoji labels |

---

## Feature 1: Task States — Active · Waiting · Complete

### 1.1 Current State

The schema defines `taskStateEnum('task_state', ['ACTIVE', 'DONE', 'ARCHIVED'])`. The frontend type is `TaskState = "ACTIVE" | "DONE" | "ARCHIVED"`.

### 1.2 Schema Evolution

**Rename & Expand the enum:**

| Old        | New        | Meaning                                 |
| ---------- | ---------- | --------------------------------------- |
| `ACTIVE`   | `ACTIVE`   | Actionable — do it now or today         |
| _(new)_    | `WAITING`  | Blocked or pending — not actionable yet |
| `DONE`     | `COMPLETE` | Finished — archived from active view    |
| `ARCHIVED` | `ARCHIVED` | Soft-deleted / trashed                  |

**New task columns for Waiting state:**

```
waiting_on       TEXT        -- optional: "Professor García's reply", "Lab results"
waiting_reminder TIMESTAMPTZ -- optional: "check again in 3 days" → stores absolute datetime
```

**Migration strategy:** Rename `DONE` → `COMPLETE` via `ALTER TYPE task_state RENAME VALUE 'DONE' TO 'COMPLETE'`. Add `WAITING` via `ALTER TYPE task_state ADD VALUE 'WAITING'`. Add nullable columns `waiting_on` and `waiting_reminder`.

### 1.3 Frontend Type Changes

**File:** `app/types/task.ts`

```typescript
export type TaskState = "ACTIVE" | "WAITING" | "COMPLETE" | "ARCHIVED";
```

Update `CreateTaskInput` and `UpdateTaskInput` to include:

```typescript
waitingOn?: string | null;
waitingReminder?: string | null;
```

### 1.4 UI Changes

**TaskCheckbox (`TaskCheckbox.tsx`):**

- `ACTIVE` → empty circle (current behavior)
- `WAITING` → circle with a small `Pause` icon (Lucide) inside, rendered in `text-moonlit/60`
- `COMPLETE` → filled circle with subtle checkmark (current `DONE` behavior)
- Clicking a `WAITING` checkbox cycles to `COMPLETE` (not back to `ACTIVE`)

**TaskCard (`TaskCard.tsx`):**

- Waiting tasks show a subtle `text-moonlit` left-border accent (`border-l-2 border-moonlit/30`) instead of the default
- Below the title, if `waitingOn` is set, render: `⏳ Waiting on: {waitingOn}` in `text-[12px] text-moonlit/70 italic` — use the `Clock` Lucide icon, not an emoji
- If `waitingReminder` is set and is in the future, show a small `Bell` icon with tooltip: "Reminder: {date}"

**TaskEditPanel (`TaskEditPanel.tsx`):**

- Add a new `MetaRow` for state with icon `CircleDot`:
  - Three pill-style radio buttons: `Active` · `Waiting` · `Complete`
  - Styled as translucent pills: `bg-white/[0.04] rounded-xl px-3 py-1.5 text-[12px]`
  - Active pill: `bg-lantern/15 text-lantern border border-lantern/20`
  - Waiting pill: `bg-moonlit/15 text-moonlit border border-moonlit/20`
  - Complete pill: `bg-feedback-success/15 text-feedback-success border border-feedback-success/20`
- When `WAITING` is selected, reveal two sub-fields with `AnimatePresence`:
  - "Waiting on" — a borderless text input, `text-[13px] text-twilight-text-soft`, placeholder "Who or what are you waiting for?"
  - "Check again" — the `DeadlinePickerPopover` repurposed for single-date selection

**Today View (`home.tsx`):**

- **Critical UX rule:** Waiting tasks are **hidden** from the Today view by default
- Add a subtle toggle at the bottom of the task list: `"Show {n} waiting"` in `text-[12px] text-moonlit/60`
- Clicking it reveals waiting tasks in a visually distinct section with `opacity-70` and the moonlit left-border

**Filter hooks (`use-tasks.ts`):**

- Add `state` filter support for `WAITING`
- The planner query defaults to `state: "ACTIVE"` (unchanged — waiting tasks naturally excluded)

### 1.5 Manifesto Compliance

- ✅ No new heavy cards — state pills use translucent treatment (§1.1)
- ✅ Waiting indicator uses `Clock` Lucide icon, not emoji (§6.2)
- ✅ Moonlit blue accent for waiting is already in the color system (§2.1)
- ✅ Hidden from Today = reduces cognitive load = sanctuary preserved

---

## Feature 2: Effort Level

### 2.1 Schema

Add to `tasks` table:

```
effort  INTEGER  DEFAULT NULL  -- 1 = Low, 2 = Medium, 3 = High, NULL = unset
```

Nullable — effort is optional. No enum needed; integer maps cleanly to dot count.

### 2.2 Frontend Type

```typescript
export type EffortLevel = 1 | 2 | 3 | null;
// In Task interface:
effort: EffortLevel;
```

### 2.3 UI — Effort Dots

**New component:** `app/components/tasks/EffortDots.tsx`

Renders 1–3 small filled circles:

- `•` Low — 1 dot, `text-twilight-text-muted/60`
- `••` Medium — 2 dots, `text-lantern/50`
- `•••` High — 3 dots, `text-lantern/80`
- `null` — nothing rendered (invisible when unset)

Each dot: `w-1.5 h-1.5 rounded-full` with appropriate `bg-` color. Dots are spaced `gap-0.5`.

**Placement in TaskCard:**

- Right side of the card, between the priority indicator and the timestamp area
- Must not compress existing spacing — sits in the existing metadata row
- Tooltip on hover: "Low effort" / "Medium effort" / "High effort"

**Placement in TaskEditPanel:**

- New `MetaRow` with `Gauge` icon (Lucide), label "Effort"
- Three clickable dot groups — clicking the active one toggles it off (back to null)
- Visual: same translucent pill treatment as state picker

### 2.4 Filtering

- Add `effort` to `taskFiltersSchema` on backend
- Frontend: Add an effort filter chip to the Today view filter bar (if/when filter bar exists)
- **Bad-Day Survival Mode:** A future feature flag that, when active, filters Today to `effort: 1` only — show only low-effort tasks. Implementation deferred to a later plan, but the schema supports it now.

### 2.5 Manifesto Compliance

- ✅ Dots are subtle, not text labels — keeps visual noise minimal (§1.1)
- ✅ Uses warm amber gradient for medium/high — lantern-light hierarchy (§1.2)
- ✅ Invisible when unset — zero visual cost for users who don't use it (§3.2)

---

## Feature 3: Tags (User-Defined)

### 3.1 Current State

Backend already has `tags` and `task_tags` tables. Frontend has `app/types/tag.ts`, `app/hooks/tags/`, and `TagPickerSubmenu.tsx`. Tags are partially implemented.

### 3.2 Refinement — Inline Tag Creation

**Rule:** No tag settings page. Tags are created inline, in-context, where you need them.

**`TagPickerSubmenu.tsx` enhancements:**

- Current: Has an input for creating tags inline — **good, keep this**
- Add: Color picker row beneath the input — 8 preset colors as small circles (`w-5 h-5 rounded-full`), matching project color palette
- Add: "Create #{input}" appears as the first option when text doesn't match existing tags
- Fast apply: Clicking a tag toggles it immediately (optimistic UI). No confirm button.

**Tag rendering on TaskCard:**

- Below the title, tags render as small pills: `text-[11px] px-2 py-0.5 rounded-full bg-{tagColor}/10 text-{tagColor}/80 border border-{tagColor}/15`
- Maximum 3 visible tags, then `+{n}` overflow pill
- Tags section only appears if task has tags — zero visual cost otherwise

**Tag filtering:**

- Tags function as **filters, not hierarchy** — clicking a tag in the sidebar or a filter bar shows all tasks with that tag across all projects/states
- Sidebar: Under "Projects" section, add a collapsible "Tags" section showing user's tags as filter links

### 3.3 Manifesto Compliance

- ✅ Inline creation = no settings pages = no SaaS admin panels (§1.1)
- ✅ Translucent pill rendering with tag color — not solid badges (§9.4 precedent)
- ✅ Color circles use the existing project color palette — design system consistency

---

## Feature 4: Inbox + Not Before Date

### 4.1 Current State

Inbox exists (`inbox_items` table, `inbox.tsx` route). Items are raw text dumps. The flow is: capture raw text → process into task.

### 4.2 "Not Before" Date

**Schema addition to `tasks`:**

```
not_before  TIMESTAMPTZ  DEFAULT NULL
```

A task with `not_before` set to a future date is **invisible** in the Today view until that date arrives. It exists in the system, but it doesn't pollute the present.

**UI in TaskEditPanel:**

- New `MetaRow` with `CalendarOff` icon, label "Not before"
- Uses `DeadlinePickerPopover` for date selection
- When set, shows the date in `text-[13px] text-twilight-text-soft`
- Pill indicator on TaskCard: `text-[11px] text-moonlit/60` showing "Not before {date}"

**Today View filtering:**

- `use-tasks.ts` query for Today automatically excludes tasks where `not_before > now()`
- The Upcoming view shows these tasks in their correct future position

**Inbox → Task promotion flow:**

1. User captures text in Inbox (current behavior)
2. When promoting to a task, the creation dialog offers: Schedule Today / Schedule Later / Set Not Before
3. "Set Not Before" opens a date picker — the task enters the system but stays hidden until that date

### 4.3 Manifesto Compliance

- ✅ Prevents future tasks from polluting today — reduces cognitive overload (core sanctuary principle)
- ✅ CalendarOff icon from Lucide — no emoji (§6.2)
- ✅ Invisible when unset — zero visual cost

---

## Feature 5: Subtasks (Single Level Only) ✅ IMPLEMENTED

### 5.1 Schema ✅

**Table:** `subtasks` — exists and migrated.

```sql
CREATE TABLE subtasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  order_index REAL NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subtasks_task_id_idx ON subtasks(task_id);
```

**Hard constraint:** No `parent_subtask_id`. No recursion. One level only. Three-tier hierarchy: **Section → Task → Subtask**.

### 5.2 Frontend Type ✅

```typescript
export interface Subtask {
	id: string;
	taskId: string;
	title: string;
	isComplete: boolean;
	orderIndex: number;
	createdAt: string;
}
```

### 5.3 API Routes ✅

All routes implemented in `cadence-backend/src/routes/subtasks.ts`:

- `GET /api/tasks/:taskId/subtasks` — returns subtasks ordered by `orderIndex`
- `POST /api/tasks/:taskId/subtasks` — create subtask `{ title, orderIndex }`
- `PATCH /api/subtasks/:id` — update title or isComplete
- `PATCH /api/subtasks/:id/reorder` — update orderIndex only
- `DELETE /api/subtasks/:id` — delete subtask

### 5.4 Frontend Hooks ✅

**File:** `app/hooks/use-subtasks.ts` — uses **Hono RPC client + `unwrapResponse`** (not raw fetch).

Hooks: `useSubtasks`, `useCreateSubtask`, `useUpdateSubtask`, `useDeleteSubtask`, `useReorderSubtasks`.

All hooks implement **optimistic UI** with rollback on error.

### 5.5 UI ✅

**Three entry points for subtask interaction:**

1. **TaskCard inline expand** (`TaskCard.tsx`):
   - Subtask progress indicator (▸ 2/5 with mini progress bar in `bg-feedback-success/60`) is clickable
   - Clicking it expands an inline subtask list with:
     - Mini checkboxes (3.5×3.5px rounded) to toggle complete
     - Hover ✕ to delete
     - "+ Add subtask" button at the bottom
   - Subtask input supports rapid chaining — Enter submits and keeps focus
   - Escape or blur cancels/submits based on content
   - Left border accent (`border-l border-twilight-border/30`) for visual nesting
   - All click events `stopPropagation()` to avoid triggering parent card click

2. **Three-dot context menu** (`TaskContextMenu.tsx`):
   - "Add subtask" action with `ListChecks` icon
   - Opens the inline subtask input on the card, expanding if collapsed
   - Works even when a task has 0 subtasks (creates the first one inline)
   - Passed as `onAddSubtask` callback prop to `TaskContextMenu`

3. **TaskEditPanel** (`TaskEditPanel.tsx`):
   - Full `SubtaskList` component with drag-and-drop reordering (`@dnd-kit`)
   - Sortable items with grip handle, editable title (inline rename on blur), delete
   - Ghost input at bottom: "Add a subtask…" in italic muted text
   - Uses `AnimatePresence` for smooth add/remove transitions

**KanbanCard** (`KanbanCard.tsx`):

- Shows subtask progress indicator (mini bar + count) — compact for card layout
- Does NOT expand inline (clicking opens the edit panel instead)

### 5.6 Manifesto Compliance

- ✅ Collapsed by default — tasks remain clean floating surfaces (§4.1)
- ✅ No recursive nesting — prevents hierarchy abuse that kills usability
- ✅ Completion animation is gentle fade, not celebration (§5)
- ✅ Inline expand uses `framer-motion` spring for height animation
- ✅ Three intuitive entry points — natural discovery without being overwhelming

---

## Feature 6: Kanban View ✅ IMPLEMENTED

### 6.1 Design Principle — REVISED

Kanban is **not a separate page** — it's a **view mode** on existing task pages. This was a deliberate design revision: a standalone `/board` route fragmented the UX, so Kanban was integrated as a toggle within Today, Upcoming, and Completed pages.

Columns are **user-defined Sections**, not task states. This gives users full control over their organizational structure.

### 6.2 Three-Tier Hierarchy

```
Section (column)  →  Task (card)  →  Subtask (inline)
```

**Backend table:** `task_sections`

```sql
CREATE TABLE task_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index REAL NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Tasks reference sections via nullable `section_id` FK on the `tasks` table.

### 6.3 View Mode Toggle ✅

**Component:** `app/components/shared/ViewToggle.tsx`

- Two-button toggle: List (default) | Board
- Uses `useViewMode()` hook backed by **dual persistence**:
  - `localStorage` — instant read on first render (no flash)
  - Backend `settings` JSONB column on `users` table — cross-device sync
- View mode is **global** — switching to kanban on Today persists to Upcoming, Completed, etc.
- Backend routes: `GET /api/settings`, `PATCH /api/settings` (shallow merge via `||` JSONB operator)

### 6.4 Layout — REVISED

Kanban view renders **outside `ScrollAreaWrapper`** to enable native horizontal scrolling. Radix `ScrollArea.Viewport` clips `overflow-x`, so the kanban branch avoids it entirely.

```
MainLayout
├── List view → ScrollAreaWrapper (vertical Radix scroll)
│   └── max-w-2xl centered content
└── Kanban view → plain div (h-full, overflow-hidden)
    ├── Page header (shrink-0, px-8 pt-8)
    └── KanbanBoard (flex-1, min-h-0)
        └── scroll container (overflow-x-auto + scroll-smooth + scrollbar-thin)
```

**Columns:**

- "Ungrouped" column always appears first (tasks with no section)
- User-defined section columns follow, ordered by `orderIndex`
- "+ Add section" dashed button at the end
- Each column: `flex-shrink-0 w-[300px]` — fixed width, horizontal scroll

**Scrollbar:** Custom `.scrollbar-thin` utility in `app.css`:

- Firefox: `scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent`
- Webkit: 6px track, translucent white thumb with hover brightening

**Smooth scroll:** `scroll-smooth` class + `scrollIntoView({ behavior: "smooth", inline: "end" })` when creating new sections.

### 6.5 Components ✅

- `app/components/kanban/KanbanBoard.tsx` — DndContext, groups tasks by sectionId, drag between columns updates `sectionId`
- `app/components/kanban/KanbanColumn.tsx` — `SortableContext` per column, droppable area, column header with rename/delete
- `app/components/kanban/KanbanCard.tsx` — simplified card with checkbox, title, priority bar, effort dots, subtask progress

**Drag behavior:**

- Uses `@dnd-kit` with `closestCorners` collision detection
- Dragging a card between columns fires `updateTask.mutate({ id, sectionId: targetSectionId })`
- `DragOverlay` with drop animation: `cubic-bezier(0.18, 0.67, 0.6, 1.22)`

### 6.6 Section CRUD ✅

**Backend routes:** `cadence-backend/src/routes/sections.ts`

- `GET /api/sections`, `POST /api/sections`, `PATCH /api/sections/:id`, `DELETE /api/sections/:id`

**Frontend hooks:** `app/hooks/sections/use-sections.ts`

- `useSections`, `useCreateSection`, `useUpdateSection`, `useDeleteSection`
- All use Hono RPC client pattern

**Inline management:**

- Column header is editable (click to rename)
- Column has delete action
- "+ Add section" creates a new column with auto-scroll to it

### 6.7 Pages Using Kanban ✅

- `home.tsx` — Today view (active + waiting tasks)
- `upcoming.tsx` — Upcoming tasks
- `completed.tsx` — Completed tasks

All three pages conditionally render `ScrollAreaWrapper` (list) or kanban layout based on `useViewMode()`.

### 6.8 What Was Removed

- ❌ Standalone `/board` route — removed
- ❌ "Board" sidebar nav link — removed
- ❌ `G→B` keyboard shortcut — removed from Command Palette
- ❌ State-based columns (Active/Waiting/Complete) — replaced with user-defined sections

### 6.9 Manifesto Compliance

- ✅ Implied boundaries, not boxed panels (§1.1)
- ✅ Glass surface cards floating over twilight background (§4.1)
- ✅ Drag uses spring physics via `DragOverlay` (§5)
- ✅ Integrated as a view mode = no navigation fragmentation
- ✅ User-defined sections = user is in control, not the system

---

## Feature 7: Rescheduling (Fast & Frictionless)

### 7.1 Design Imperative

> _If rescheduling is painful, the system dies._

Rescheduling must be **faster than thinking about it**. Two mechanisms: quick actions and bulk operations.

### 7.2 Quick Reschedule Actions

**TaskContextMenu (`TaskContextMenu.tsx`) additions:**

New submenu: "Reschedule →" with `CalendarClock` icon:

| Action             | Behavior                                                |
| ------------------ | ------------------------------------------------------- |
| Tomorrow           | `scheduledStart = tomorrow 00:00, isAllDay = true`      |
| Next Week (Monday) | `scheduledStart = next Monday 00:00, isAllDay = true`   |
| Next Weekend       | `scheduledStart = next Saturday 00:00, isAllDay = true` |
| In 3 days          | `scheduledStart = now + 3 days, isAllDay = true`        |
| Pick a date…       | Opens `DeadlinePickerPopover` inline                    |
| Remove date        | `scheduledStart = null, dueDate = null`                 |

Each action is a single click. Optimistic UI — the task visually moves immediately, API call fires in background.

**Swipe gestures (Mobile, §4.4):**

- Swipe right on a task → cycles through: Tomorrow → Next Week → shows date picker
- Each swipe position reveals the destination label in `text-[13px] text-lantern font-medium`

### 7.3 Drag to Calendar

**In Schedule view (`schedule.tsx`):**

- Tasks from the sidebar task list can be dragged onto calendar day cells
- Dropping on a day cell sets `scheduledStart` to that day
- Dropping on a time slot in Week/Day view sets `scheduledStart` and `scheduledEnd` to the time range
- Visual feedback during drag: the target cell shows `bg-lantern/10 border-2 border-dashed border-lantern/30`

### 7.4 Bulk Reschedule

**Multi-select mode:**

- Long-press or `Shift+Click` on tasks enters multi-select mode
- Selected tasks show `ring-1 ring-lantern/30 bg-lantern/[0.03]`
- A floating action bar appears at the bottom: `glass-surface rounded-2xl px-6 py-3`
  - "Reschedule {n} tasks" → opens date picker that applies to all
  - "Move to Tomorrow" → single-click bulk action
  - "Mark Complete" → batch state change
  - "Cancel" → deselect all

### 7.5 Manifesto Compliance

- ✅ Single-click reschedule = minimal cognitive cost (core sanctuary principle)
- ✅ Drag to calendar uses spring physics (§5)
- ✅ Floating action bar uses glass-surface, not a heavy toolbar (§1.1)
- ✅ Mobile swipe gestures follow iOS Mail/Reminders fluidity (§4.4)

---

## Feature 8: Keyboard Command Layer

### 8.1 Command Palette (`Cmd+K`)

**New component:** `app/components/shared/CommandPalette.tsx`

A Radix `Dialog` triggered by `Cmd+K` (or `Ctrl+K` on Windows/Linux).

**Visual:**

- Full-width search input at top: `glass-surface rounded-2xl p-4`
- Results list below: scrollable, keyboard-navigable
- Backdrop: `backdrop-blur-2xl bg-twilight-void/60` — the world goes out of focus (§4.3)
- Input: borderless, `text-lg font-display text-twilight-text`, placeholder "What do you need?"
- Result items: `px-4 py-3 rounded-xl hover:bg-white/[0.04]`, with icon + label + shortcut hint

**Searchable items:**

- All tasks (fuzzy search by title)
- All projects
- Navigation pages: Today, Schedule, Inbox, Board, Upcoming, Completed, Habits
- Actions: "New task", "New project", "Go to today"

### 8.2 Global Keyboard Shortcuts

| Shortcut            | Action                                    | Context                   |
| ------------------- | ----------------------------------------- | ------------------------- |
| `Cmd+K`             | Open command palette                      | Global                    |
| `T`                 | Focus "New task" input                    | When no input is focused  |
| `D`                 | Mark selected task complete               | When a task is selected   |
| `S`                 | Open reschedule submenu for selected task | When a task is selected   |
| `E`                 | Open task edit panel                      | When a task is selected   |
| `Backspace` / `Del` | Archive selected task                     | When a task is selected   |
| `↑` / `↓`           | Navigate task list                        | When task list is focused |
| `Enter`             | Open selected task                        | When task is selected     |
| `Escape`            | Close panel / deselect                    | Context-dependent         |
| `1`–`4`             | Set priority on selected task             | When a task is selected   |

**Implementation:**

- New hook: `app/hooks/use-keyboard-shortcuts.ts`
- Uses `useEffect` with `keydown` listener on `document`
- Guards: shortcuts are disabled when an `<input>`, `<textarea>`, or `[contenteditable]` is focused
- All shortcuts respect the Manifesto's accessibility rules — they enhance, never replace, mouse/touch

### 8.3 Shortcut Hints

- In context menus and the command palette, show shortcut keys as small `kbd` badges:
  `text-[10px] text-twilight-text-muted/70 bg-white/[0.06] rounded px-1.5 py-0.5 font-mono`

### 8.4 Manifesto Compliance

- ✅ Command palette uses glass + blur — "the world going slightly out of focus" (§4.3)
- ✅ Keyboard shortcuts are invisible until needed — zero visual noise for casual users
- ✅ `kbd` badges use design system tokens, not hardcoded styles

---

## Feature 9: Today Screen Refinement

### 9.1 Current State

`home.tsx` shows all `ACTIVE` tasks with `PlannerHeader` + `AddTaskInput` + `TaskList`.

### 9.2 Intelligent Filtering

Today should show **only** what matters right now:

1. **Scheduled for today** — tasks with `scheduledStart` on today's date
2. **Active tasks with no date** — tasks in `ACTIVE` state with no `scheduledStart` and no `not_before` (or `not_before <= today`)
3. **Overdue tasks** — tasks with `dueDate < today` that are still `ACTIVE`
4. **Low-effort quick wins** — if the user has > 8 tasks visible, surface a collapsible "Quick wins" section showing `effort: 1` tasks separately

**Excluded from Today:**

- `WAITING` tasks (shown only via toggle, per Feature 1)
- Tasks with `not_before > today` (per Feature 4)
- `COMPLETE` and `ARCHIVED` tasks (unchanged)

### 9.3 Section Layout

```
[Greeting header — PlannerHeader]

[AddTaskInput]

── Overdue ──────────── (red-tinted section, only if overdue tasks exist)
  TaskCard (overdue)
  TaskCard (overdue)

── Today ────────────── (main section)
  TaskCard
  TaskCard
  TaskCard

── Quick Wins ───────── (collapsible, only if effort:1 tasks exist, muted section)
  TaskCard (low effort)

── {n} waiting ──────── (toggle to reveal waiting tasks)
```

Section headers: `text-[12px] font-display font-medium text-twilight-text-muted/80 uppercase tracking-wider` with a `h-px bg-gradient-to-r from-transparent via-twilight-border/30 to-transparent` divider.

Overdue section header: uses `text-red-400/80` accent instead of default muted.

### 9.4 Manifesto Compliance

- ✅ Reducing visible tasks = "the brain doesn't shut down" = sanctuary preserved
- ✅ Section dividers use gradient lines, not heavy borders (§1.1)
- ✅ Quick Wins section is collapsible — opt-in complexity

---

## Feature 10: Weekly Reset / Planning Surface

### 10.1 Design

> _"This is where the name Cadence actually makes sense."_

A dedicated weekly planning view that helps users establish rhythm.

**New route:** `app/routes/weekly-review.tsx`
**Add to routes.ts:** `route("weekly-review", "routes/weekly-review.tsx")`

### 10.2 Layout

A guided, step-by-step planning flow — NOT a dashboard. Think of it as a calm, meditative walkthrough.

**Steps (revealed sequentially, not all at once):**

**Step 1 — Inbox Review:**

- Shows all unprocessed inbox items
- For each item: "Create task" / "Dismiss" / "Schedule for this week"
- Count badge: `{n} items to review`

**Step 2 — Unscheduled Tasks:**

- Shows all `ACTIVE` tasks with no `scheduledStart`
- For each: drag to a day of the week (horizontal day bar) or "Leave unscheduled"
- Mini week bar: 7 day columns, `Mon–Sun`, cards drop into them

**Step 3 — Move Waiting Tasks:**

- Shows all `WAITING` tasks
- For each: "Still waiting" / "Mark active" / "Archive"

**Step 4 — Habit Check-in:**

- Shows habit completion stats for the past week (natural language, per Manifesto)
- "You completed 12 of 15 habits this week. Your reading streak is at 8 days."
- No charts. No progress bars. Just warm, human text.

**Step 5 — Week Ready:**

- Summary: "{n} tasks scheduled, {n} in inbox, {n} waiting"
- A single "Start your week" button that navigates to Today

### 10.3 Visual Design

- Full-screen flow, one step at a time
- Background: `bg-twilight` with the standard radial gradient
- Each step card: `glass-surface rounded-3xl max-w-2xl mx-auto p-8`
- Step indicator: small dots at the top, `w-2 h-2 rounded-full`, active = `bg-lantern`, inactive = `bg-white/[0.1]`
- Transition between steps: `framer-motion` slide + fade, `AnimatePresence` with `mode="wait"`

### 10.4 Sidebar Navigation

Add "Weekly Reset" link to sidebar, below "Habits":

- Icon: `RefreshCw` (Lucide)
- Label: "Weekly Reset"
- Show a subtle notification dot if it's Monday and the user hasn't done a reset this week

### 10.5 Manifesto Compliance

- ✅ Guided flow = calm, not overwhelming (sanctuary principle)
- ✅ No dashboards, no charts (§1.1: "No dashboard metrics")
- ✅ Natural language stats, not numbers in boxes (anti-SaaS)
- ✅ Glass surfaces, spring animations, warm tones throughout

---

## Feature 11: Internal Metrics (Silent Tracking)

### 11.1 Design Rule

> _Track internally. Don't show users yet._

These metrics exist for future AI-powered insights. They are **invisible** in the UI for now.

### 11.2 Schema

**New table:** `task_metrics`

```sql
CREATE TABLE task_metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  delay_count      INTEGER NOT NULL DEFAULT 0,     -- times it was overdue
  created_to_done  INTEGER,                        -- seconds from creation to completion
  first_scheduled  TIMESTAMPTZ,                    -- original scheduled date
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_metrics_user_id_idx ON task_metrics(user_id);
CREATE INDEX task_metrics_task_id_idx ON task_metrics(task_id);
```

### 11.3 Backend Logic

- **On reschedule:** When `scheduledStart` changes via `PATCH /api/tasks/:id`, increment `reschedule_count` and store `first_scheduled` if not already set
- **On completion:** When `state` changes to `COMPLETE`, calculate `created_to_done` as `now() - created_at` in seconds, store `completed_at`
- **On overdue detection:** A scheduled Cloudflare Cron Trigger checks for tasks where `dueDate < now()` and `state = ACTIVE`, increments `delay_count`

### 11.4 Frontend

**No UI changes.** This is backend-only for now. Future plans will use this data for:

- Overload detection ("You've rescheduled 5 tasks this week — consider reducing your plate")
- Pattern insights ("Tasks tagged #admin take 3x longer than estimated")
- Burnout index refinement (feeds into `user_metrics.currentBurnoutIndex`)

### 11.5 Manifesto Compliance

- ✅ Invisible = zero cognitive load = pure sanctuary
- ✅ Future AI features will present insights in natural language, not charts (§1.1)

---

## Feature 12: Visual Refinement

### 12.1 Subtle Completion Animation

**File:** `TaskCard.tsx` / `TaskCheckbox.tsx`

When a task is marked complete:

1. The checkbox fills with `bg-lantern` and a `Check` icon appears (already exists)
2. The task title gains `line-through` with `text-twilight-text-muted/50`
3. The entire card fades: `opacity → 0.4` over `300ms` with `ease-out`
4. After a `1.5s` delay, the card collapses its height to `0` and removes from list
5. A toast appears: "Task completed" with "Undo" action

Per Manifesto §5: _"Like a candle flame going out. No goofy bouncing or party effects."_

`framer-motion` config:

```typescript
exit={{ opacity: 0, height: 0, marginBottom: 0 }}
transition={{ opacity: { duration: 0.3 }, height: { delay: 1.5, duration: 0.4, ease: [0.25, 1, 0.5, 1] } }}
```

### 12.2 Smooth Drag Scheduling

For all drag operations (task reorder, Kanban column move, calendar scheduling):

- **Lift:** Card elevates with `scale: 1.02`, `boxShadow: '0 8px 32px rgba(0,0,0,0.25)'`
- **During drag:** Soft lantern halo: `boxShadow: '0 12px 40px rgba(0,0,0,0.3), 0 0 20px rgba(232,164,74,0.06)'`
- **Drop:** Spring settle: `stiffness: 400, damping: 30`
- Per Manifesto §4.1: _"Like picking up a smooth river stone, not snapping a circuit board."_

### 12.3 Dark Mode Excellence

The default Twilight theme IS dark mode. Ensure:

- No `bg-white` remnants anywhere (previous plans addressed this)
- All glass surfaces maintain `backdrop-blur-xl` integrity
- The Daylight theme (§2.2) is **deferred** to a future plan — dark mode is the priority

### 12.4 Typography & Spacing Audit

Run a final pass ensuring:

- All headings use `font-display` (Outfit)
- All body text uses `font-sans` (Inter)
- Minimum `py-3` on interactive rows
- `line-clamp-2` on task titles in compact views (Kanban cards, calendar chips)

---

## Execution Phases

### Phase A: Data Model Foundation (Backend-First) ✅ COMPLETE

1. ✅ Schema migration: Add `WAITING` state, rename `DONE` → `COMPLETE`, add `waiting_on`, `waiting_reminder`, `effort`, `not_before` columns
2. ✅ Create `subtasks` table
3. ✅ Create `task_metrics` table
4. ✅ Update Zod schemas and API routes
5. ✅ Add reschedule/completion metric hooks to existing task PATCH/state-change routes
6. ✅ Create `task_sections` table with `section_id` FK on `tasks`
7. ✅ Add `settings` JSONB column to `users` table
8. ✅ Create `/api/settings` GET/PATCH routes
9. ✅ Create `/api/sections` CRUD routes

### Phase B: Core State & Effort UI ✅ COMPLETE

10. ✅ Update frontend types (`TaskState`, `EffortLevel`, `Subtask`, `TaskSection`)
11. ✅ Implement `WAITING` state in `TaskCheckbox`, `TaskCard`, `TaskEditPanel`
12. ✅ Implement `EffortDots` component and integrate into `TaskCard` + `TaskEditPanel`
13. ✅ Implement `not_before` filtering in `use-tasks.ts` and Today view
14. ✅ Update Today view with section layout (Overdue / Today / Quick Wins / Waiting)

### Phase C: Tags & Subtasks ✅ COMPLETE

15. ✅ Refine `TagPickerSubmenu` with inline color picker and instant create
16. ✅ Add tag pills to `TaskCard`
17. ✅ Build subtask UI in `TaskEditPanel` with reorder, create, complete, delete (`SubtaskList`)
18. ✅ Add subtask progress indicator to `TaskCard` (clickable expand/collapse)
19. ✅ Add inline subtask CRUD on TaskCard (expand, check, delete, rapid add)
20. ✅ Add "Add subtask" to `TaskContextMenu` (three-dot menu)
21. ✅ Add subtask progress indicator to `KanbanCard`
22. ✅ Fix subtask hooks to use Hono RPC client + `unwrapResponse`

### Phase D: Views & Navigation ✅ MOSTLY COMPLETE

23. ✅ Build Kanban view: `KanbanBoard`, `KanbanColumn`, `KanbanCard`
24. ✅ Kanban as view mode toggle (not standalone route) on Today, Upcoming, Completed
25. ✅ View mode persistence: `useViewMode` → `useSettings` → localStorage + backend JSONB
26. ✅ Section-based columns with inline create, rename, delete
27. ✅ Horizontal scroll with styled scrollbar (`.scrollbar-thin`)
28. ✅ `SectionedTaskList` for list view grouping by sections
29. 🔲 Build Weekly Reset flow: `weekly-review.tsx` with 5-step guided process
30. 🔲 Add Weekly Reset sidebar link with Monday notification dot

### Phase E: Speed & Power ✅ MOSTLY COMPLETE

31. ✅ Add reschedule quick actions to `TaskContextMenu` (Today/Tomorrow/Weekend/Next Week/3 days/Custom/Remove)
32. 🔲 Implement drag-to-calendar in Schedule view
33. ✅ Build multi-select mode with floating action bar (via `task-selection-store`)
34. ✅ Build `CommandPalette` component (`Cmd+K`)
35. ✅ Implement `use-keyboard-shortcuts` hook with all global shortcuts

### Phase F: Polish ✅ MOSTLY COMPLETE

36. ✅ Completion animation refinement (candle-flame fade in `SortableTaskCard`)
37. ✅ Drag animation tuning (river-stone lift + lantern halo)
38. 🔲 Typography & spacing final audit
39. 🔲 WCAG pass on all new components (focus indicators, ARIA labels, touch targets, contrast)

---

## Design Principles Checklist (Per Feature)

Before implementing any feature from this plan, verify:

- [x] **Sanctuary Test:** Does this make the user calmer or more stressed?
- [x] **Invisible When Unused:** Does this feature add zero visual noise for users who don't use it?
- [x] **No SaaS Tropes:** No heavy cards, no dashboard metrics, no solid accent fills, no `rounded-md`
- [x] **Twilight Tokens Only:** All colors from CSS variables, no hardcoded hex, no `text-white`
- [x] **Glass & Glow:** Floating surfaces use `glass-surface`, interactive elements use `glow-lantern`
- [x] **Spring Physics:** All motion uses `framer-motion` springs, never CSS `transition-all`
- [ ] **WCAG AA:** Focus indicators, ARIA labels, 44px mobile touch targets, contrast ratios passing
- [x] **Neurodivergent-First:** Minimal cognitive load, clear visual hierarchy, no overwhelming density
- [x] **Optimistic UI:** Mutations feel instant — API fires in background, rollback on error
- [x] **Icons Only (Lucide):** No emojis as UI elements. All icons are clean SVGs.
