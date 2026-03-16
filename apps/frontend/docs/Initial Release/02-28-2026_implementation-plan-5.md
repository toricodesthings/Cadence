# Cadence Implementation Plan #5 — Calendar View

**Date:** February 28, 2026
**Scope:** `cadence-frontend/app/components/calendar` and `cadence-frontend/app/routes/schedule.tsx`

---

## Objective

Transform the Schedule page into a multi-view calendar (Day/Week/Month/Year) rivaling Google Calendar in capability, but deeply rooted in Cadence's "Twilight Sanctuary" aesthetic. The calendar will be the primary surface for scheduling, visual task management, and high-level planning.

## Core Directives

1. **Adhere to the Design Manifesto:** No heavy borders, rigid boxes, or sterile spreadsheet aesthetics. Use implied boundaries, `border-twilight-border/30` (faded lines), warm hover states, and generous spacing.
2. **Multi-View:** Implement Day, Week, Month, and Year views. Month is the default.
3. **Task Rendering:** Tasks must be visible *within* the calendar grid, not just as dots or side panels.
4. **Interactive Mapping:** Drag and drop tasks (between days, between hours in day/week views), and click to open `TaskEditPanel`.
5. **Fluid Navigation:** Support Apple-Calendar-like navigation (month scrolling) and natural `framer-motion` crossfades between views.

---

## Architecture & State

### Schedule Route (`schedule.tsx`)

The `schedule.tsx` file will act as the orchestrator for the multi-view calendar.

**State requirements:**
```typescript
type CalendarViewMode = "day" | "week" | "month" | "year";
const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
const [currentDate, setCurrentDate] = useState<string>(toISODate(new Date())); // Drives what is shown on screen
```

**Layout updates:**
- **ScheduleHeader Component (`app/components/calendar/ScheduleHeader.tsx`):**
  - Extract the current header logic into a dedicated component.
  - Implement the view switcher (4 pill buttons) next to the "Today" button.
  - View switcher style: Segmented control in a `glass` container.
- **Main Content Area:**
  - An `AnimatePresence` wrapper that transitions between the 4 view components based on `viewMode`.

---

## Component Specifications

### 1. `CalendarTaskChip.tsx` (New)
The universal component for rendering a task block inside calendar cells.

**Variations:**
- **Inline / Stacked (Month View, All-Day row):**
  - Height: Compact.
  - Style: Soft, floating pills. `rounded-full bg-[priority-bg]/70 backdrop-blur-md px-3 py-1 text-[12px] truncate border border-white/10`. Multi-day tasks should look like a continuous, gently curved ribbon flowing across days, not a harsh solid block.
- **Absolute / Timed (Day View, Week View grid):**
  - Height: Determined by `durationEstimate` or `scheduledEnd - scheduledStart`. Defaults to 60 mins.
  - Style: Think "smooth river stones." `rounded-2xl bg-[priority-bg]/70 backdrop-blur-xl p-3 border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.12)]`. Add space between tasks; do not let them touch the grid lines perfectly. Allow them to breathe.

**Interactions:**
- **OnClick:** Calls `onSelect(task.id)` to open `TaskEditPanel` via a gracefully sliding side-sheet (`backdrop-blur-2xl` overlay), preventing jarring context switches.
- **Hover:** Reveals a subtle, glowing `...` (ellipsis) or quick-action icons (archive/complete) in the top right corner. Do not rely on invisible right-click actions.
- **Draggable:** Supports `dnd-kit/sortable` or generic `useDraggable` to drag between cells/time slots. When picked up, the task must physically lift (scale * 1.02, increase shadow, slightly brighten background).

### 2. Month View (`CalendarGrid.tsx` + `CalendarDayCell.tsx`)
**Current:** Grid of days with dot indicators.
**Enhancement:** True task rendering inside cells.

- **Cell UI (The "Hamburger Stack"):**
  - Taller default height to accommodate task lists.
  - Tasks inside a single day visually stack like a "hamburger", maintaining the unified soft pill aesthetic (`rounded-full`, tight gaps). It should look like a neat stack of plates rather than noisy separate rectangles.
  - Shows up to 3 `CalendarTaskChip`s.
  - If more than 3 tasks: show a subtle "+N more" button. Clicking this smoothly expands the specific day cell downwards (pushing the row below it gently using `framer-motion`), keeping all surrounding context perfectly visible (NO blocking popovers).
- **Duration Spanning:**
  - Tasks spanning multiple days flow across cell boundaries seamlessly with a visual connector (e.g., a gently curved ribbon, not a rigid block).

### 3. Week View (`WeekView.tsx`)
**Structure:**
- **Top Row (Axis):** Day headers (Mon 24, Tue 25...) and an "All Day" section holding all-day tasks.
- **Time Gutter (`TimeGutter.tsx`):** Leftmost column with 12 AM - 11 PM labels.
- **Main Grid:**
  - Columns for each day of the week.
  - Horizontal grid lines for hours (`border-twilight-border/20` — soft implied boundaries).
  - Absolute positioning of `CalendarTaskChip`s based on `scheduledStart` time.
- **Overlapping Tasks:** Never shrink tasks into unclickable vertical slivers. Maintain a minimum tap width (e.g., 40% of the column). If tasks overlap heavily, stagger them cascadingly (like physical cards resting slightly on top of each other). When hovered, the task smoothly elevates to the top of the z-index and expands via `framer-motion`.
- **Current Time:** A horizontal glowing `border-lantern` line spanning the current day block at the exact minute position.

### 4. Day View (`DayView.tsx`)
**Structure:**
- Operates identically to the Week View time grid, but heavily zoomed in on a single day.
- Has an "All Day" summary header.
- Because it's full-width, task blocks (`CalendarTaskChip`) show more rich text (title + time range + project tag) and maintain generous hit areas.

### 5. Year View (`YearView.tsx`)
**Structure:**
- 3x4 grid rendering 12 miniature calendars.
- Reuses `CalendarGrid` with `variant="compact"`.
- Clicking a day or month jumps to Day/Month view respectively, establishing fluid navigation levels.
- Subtle heatmap dot representation rather than text.

---

## Drag and Drop Implementation (`dnd-kit`)

In order to support dragging tasks across days and hours fluidly and safely (as per neurodivergent UX guidelines):
1. **Providers:** Wrap the entire View component area in a `DndContext`.
2. **Droppable Zones & Visual Affordance:**
   - **Month View:** Every `CalendarDayCell` is a `useDroppable` with `id={"day-" + dateStr}`. When a drag is currently active and hovering over a day, the cell *must* softly glow `--color-moonlit/20` to visually confirm it is the active target.
   - **Week/Day View:** The grid itself must be sub-divided into droppable 15-minute or 30-minute block nodes. When hovered, that specific block brightly illuminates.
3. **Draggables:** Ensure `CalendarTaskChip` implements `useDraggable`.
   - **Physical Lift:** Using a `DragOverlay`, the chip must scale up by `1.02x` and receive a deep shadow, indicating it is "held."
4. **OnDragEnd:**
   - If dropped on a day (Month view): Mutate `scheduledStart/dueDate` date component.
   - If dropped on a time block (Week/Day view): Mutate `scheduledStart/dueDate` datetime components.
   - **Constraint:** Tasks cannot snap off-screen or vanish. If dropped in an invalid area, they safely spring back to their original position using framer-motion.
   - Dispatch `useUpdateTask({ ...newTimes })` mutation for instant optimistic UI.

---

## Task Interaction Flows (Neurodivergent UX)

### Task Addition (Max 2-Click Philosophy)
Creating tasks *must never* feel like data entry. We employ overlapping interaction modes to ensure a task can be added in 2 clicks or less, adapting to the user's brain state.

1. **Inline Creation (The "Empty Space" Rule)**
   - **Click 1:** Click *any* empty space on the calendar. A "Ghost Chip" instantly spawns exactly where you clicked holding a raw `<input type="text">`. No modals, no context-loss.
   - **Action 2:** Type the task name and press `Enter`. Handled optimistically. The start time is auto-set by the Y-coordinate of the mouse click.
2. **Natural Language / AI Quick-Add**
   - The user can bring up an omnibar (e.g. `Cmd + K`) or use the Ghost Chip to type: *"Gym every Tuesday and Thursday at 6pm for 8 weeks"*. 
   - We will lay the groundwork to parse this NLP into proper start times, durations, and `recurrenceRules` (see Scheduling below).
3. **Unscheduled Inbox Dragging**
   - A smooth right-sidebar holds "Unscheduled Tasks." Users drag them directly onto the glowing drop zones. *Action: Click-hold, drag, release.* (Effectively a zero-click mental load).

### Repeated Scheduling & Timetable Construction
**Goal:** Support robust routine building (e.g., University Class Timetables, Weekly Gym Sessions) without turning the UI into an overwhelming form.

- **Recurrence Data Model:** While full RRule implementation may require a backend patch later, the front-end will immediately structure tasks with `recurrence_pattern` (e.g. `FREQ=WEEKLY;BYDAY=TU,TH`), `recurrence_end`, and `template_id`.
- **Ghost Stacking (Visual Timetable Building):** 
  - Instead of filling out a form determining recurrence, the user can construct timetables visually. Hold `Alt/Option` and seamlessly drag a task (e.g. "Math 101") onto multiple days in the week view. Cadence automatically links these together as a recurring set.
  - Useful for visualizing Gym schedules, Classes, or blocked deep-work time.

### AI Integration Hooks (Future-Proofing)
- **Component Readiness:** `CalendarTaskChip` must accept an `isSuggested` boolean prop. When `true`, it renders with a subtle shimmering `--color-twilight-primary` border.
- **Use Case:** In the future, Cadence will have an "Auto-Schedule" AI. If the user drops an unscheduled task into the "Auto-Schedule" zone, the agent will analyze their sleep, current workload, and availability, and ghost-render the task into the best available slot on their timetable. The user just clicks standard 'Enter' to confirm it.
- **Smarter Recurrence:** The AI will natively parse and suggest recurrence limits (e.g. knowing University terms end in May, it will auto-suggest an end-date for class tasks).

### Task Management / Viewing
- **No Right-Clicking:** Do not use hidden context menus (right-clicking). They cause discovery anxiety. Provide a visible mechanism.
- **Hover Actions:** Hovering over a `CalendarTaskChip` reveals smooth, subtle icon buttons at the top right of the chip (e.g., complete, trash, expand).
- **Edit Panel Side-Sheet:** If a user needs deeper editing (tags, description), clicking the task slides out a soft `TaskEditPanel` side-sheet (`w-96`, `backdrop-blur-3xl`). The main calendar dims slightly (`backdrop-brightness-75`), keeping the user safely visually anchored to their original month/week without a full page takeover.

---

## Performance Considerations
- **Query Efficiency:** The current `useTasks` hook fetches tasks. For the calendar, ensure it fetches a date range via `scheduledRangeStart` and `scheduledRangeEnd` to avoid client-side bloat.
- **Component Recycling:** Keep `CalendarTaskChip` thin to avoid React render bloat when scrolling months.

---

## Execution Steps for Agents

1. **Step 1: Scaffolding**
   - Create empty placeholder components for `ScheduleHeader`, `WeekView`, `DayView`, `YearView`, `TimeGutter`, and `CalendarTaskChip` in `cadence-frontend/app/components/calendar/`.
   - Update `app/routes/schedule.tsx` to hold the view switcher state and conditional `AnimatePresence` rendering.
2. **Step 2: Component Engineering (Month & Chip)**
   - Complete `CalendarTaskChip` styling based on priority CSS vars.
   - Inject `CalendarTaskChip` into the existing `CalendarDayCell.tsx` logic.
3. **Step 3: Advanced Grids (Week & Day)**
   - Build `TimeGutter` and implement absolute positioning mathematics for tasks inside `WeekView` and `DayView`. Calculate `top` offset based on hours, `height` based on duration.
4. **Step 4: Year View**
   - Assemble `YearView` by mapping 12 `CalendarGrid` instances at compact size.
5. **Step 5: Drag and Drop Context**
   - Implement `dnd-kit` droppable zones in the calendar grids.
   - Wire `onDragEnd` to the `useUpdateTask` mutation hook to modify timing fields.
6. **Step 6: UI Polish**
   - Apply Design Manifesto rules: subtle borders, warm hover effects, current time indicator line.

---

## Post-Implementation Audit — March 2026

### Completed Beyond Original Plan
- **CalendarEventPopover** — Google Calendar-style floating popover for quick task creation via grid click or toolbar button. Not in original plan; replaces the "Ghost Chip" inline input.
- **Right-click context menu** — Context menu on month-view day cells triggers CalendarEventPopover with `isAllDay: true`. Provides a discovery-friendly alternative to grid clicks.
- **Toolbar "Add Task" button** — ScheduleHeader includes an explicit CTA for task creation.
- **PriorityPicker** integration in CalendarEventPopover.

### Fixes Applied During Audit
1. **`data-task-chip` attribute** — CalendarTaskChip now sets `data-task-chip` on both pill and block variants. Previously, grid click handlers used `closest("[data-task-chip]")` to filter clicks on task chips, but no element had the attribute, causing double-fire on task click.
2. **Shared `calendar-utils.ts`** — Extracted `HOUR_HEIGHT`, `DAY_GRID_HEIGHT`, `minutesFromMidnight()`, `taskTop()`, `taskHeight()` from duplicated code in WeekView and DayView into `app/components/calendar/calendar-utils.ts`.
3. **Dead code removal** — Removed unused `SLOT_MINUTES`, `SLOT_COUNT`, `SLOT_HEIGHT` constants from WeekView. Removed unused `todayCol` variable.
4. **YearView DRY** — Replaced inline `toLocal()` lambda with shared `parseLocalDate()` from date-format.ts.
5. **View-gated queries** — Each `useTasks()` call in schedule.tsx now passes `enabled: viewMode === "..."` so only the active view's query fires. Previously all 4 views fetched simultaneously.
6. **`staleTime` applied** — `useTasks` hook now applies `STALE_TIMES.TASKS` (30s). Previously used React Query default of 0ms (refetch on every focus).
7. **Optimistic ID collision** — Replaced `"temp-${Date.now()}"` with `crypto.randomUUID()` for optimistic task IDs.
8. **UTC day-boundary fix** — All date range builders (`getMonthDateRange`, `getWeekDateRange`, `getYearDateRange`, `startOfDay`, `endOfDay`) now use local-timezone-aware `new Date().toISOString()` instead of hardcoded `Z` suffix, ensuring tasks near midnight boundaries appear correctly.
9. **Stale `today` fix** — `handleToday` callback now uses a fresh `new Date()` instead of a closure-captured `today` from render time.
10. **CalendarEventPopover error handling** — Popover now closes on mutation success (via `onSuccess` callback) instead of immediately after `createTask()` call. Add Task button shows "Adding…" text and disables during pending state.

### Known Limitations (Deferred)
- **Overlapping task stagger/cascade** — Plan §3 (Week View) specifies cascading stagger for overlapping tasks. Currently, overlapping tasks render directly on top of each other. Implementing this requires a layout algorithm (track columns/lanes) in a future iteration.
- **Live current-time indicator** — The red "now" line in Week/Day views is computed once per render. A `setInterval`-based live update would provide a smoother experience.
- **Unscheduled inbox sidebar drag** — Plan §Task Interaction Flows specifies a sidebar with unscheduled tasks draggable onto the calendar. Not yet implemented.
- **NLP/AI quick-add** — Deferred to Phase 2 (AI). Plan §Task Interaction Flows acknowledges this as future-proofing.
- **Ghost visual timetable building** — Alt/Option-drag to clone tasks across days. Not yet implemented.
- **`timezoneLocked` support** — Schema field exists but frontend does not read or apply it. Requires UX design for how users toggle this per-task.
- **AnimatePresence + Portal** — CalendarEventPopover renders via `createPortal` to `document.body` which makes `AnimatePresence` exit animations unreliable. A future fix could use Radix-style portal handling or render the popover inline with absolute positioning.
