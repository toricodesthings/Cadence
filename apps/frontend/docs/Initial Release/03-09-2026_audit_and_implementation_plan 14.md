# Cadence Frontend Audit & Implementation Plan (Detailed)

This document is a comprehensive, implementation-ready breakdown of logic corrections, visual refinements, and responsive scaling improvements needed across the frontend. It enforces the **Design Manifesto** (Twilight Sanctuary) constraints on layout, negative space, atmospheric integration, and typographic scale.

---

## Phase 1: Logic Correction and Bug Fixes

### 1. Kanban Board: Dropping a Task Reverts Position

**File Target:** `apps/frontend/app/components/kanban/KanbanBoard.tsx`
**Root Cause:**
When `handleDragEnd` detects a drag finish over a new column, it calls `updateTask.mutate({ id, sectionId })`. However, it completely omits fractional index sorting logic (`orderIndex`). The optimistic update only changes the column association. When the backend query cache resolves, the task drops to the bottom or reverts its visual spot, leading to a race condition.
**Implementation Steps:**

1. In `handleDragEnd`, identify if the drop was on top of another card (using `event.over.data`).
2. If dropped on a card, calculate the midpoint `newOrderIndex` between the card above and below the drop index.
3. If dragged to an empty column, set `orderIndex: 0` or compute the maximum.
4. Pass _both_ `sectionId` and `orderIndex` to the `updateTask` hook (or `useReorderTask` if staying in the same column) so optimism matches the final database state.

### 2. Schedule Page: Week View Drag-and-Drop Date Shifting

**File Target:** `apps/frontend/app/routes/schedule.tsx`
**Root Cause:**
When a task is dropped precisely on a day column (`day-YYYY-MM-DD`), the drag handler tries to merge the target drag date (`datePart`) with the existing hour of the task. It uses `const normalizedIso = new Date(task.scheduledStart).toISOString();` and slices it via `normalizedIso.slice(11)`. This strips local timezone hours into UTC.
**Implementation Steps:**

1. Locate `handleDragEnd` inside `schedule.tsx`.
2. Inside the `droppedId.startsWith("day-")` block, remove `.toISOString().slice(11)`.
3. Instead, parse local hours/minutes directly from `new Date(task.scheduledStart)`. Construct a clean local date string merging `datePart` (YYYY-MM-DD) and the existing local hour/minute padded to two digits (e.g., `HH:mm:00`).

### 3. Habit Page: Missing Archived Restoration in Cache

**File Target:** `apps/frontend/app/hooks/habits/use-update-habit.ts`
**Root Cause:**
Triggering a restore (`archived: false`) works on the backend, but the optimistic layer filters arrays without acknowledging cross-boundary insertion. Because the habit was archived, it didn't exist in the active query cache to begin with, preventing its immediate visibility upon restore.
**Implementation Steps:**

1. Inside `onMutate` inside `useUpdateHabit.ts`, check if `patch.archived === false`.
2. Retrieve the active habits cache using `queryClient.getQueryData`.
3. If the item doesn't exist in the active array, affirmatively unshift or push the combined `...existing, ...patch` payload into the active array manually.
4. Trigger a strict `invalidateEverywhere(queryClient, ["habits"])` on `onSettled` to guarantee UI continuity.

### 4. Maximum Update Depth Exceeded in Time Inputs

**File Target:** `apps/frontend/app/components/tasks/TimePickerInput.tsx`
**Root Cause:**
A passive `useEffect` tracks `hour, minute, period` and instantly triggers `onChange()`. If the parent component's `onChange` function isn't wrapped in `useCallback()`, triggering it causes a parent re-render, passing down a new `onChange` ref, trapping React into an infinite re-render loop resulting in `Maximum update depth exceeded`.
**Implementation Steps:**

1. In `TimePickerInput.tsx`, remove the `useEffect` that broadcasts the change automatically.
2. Abstract the broadcast into a helper function: `const broadcastChange = (h, m, p) => { ... onChange(iso); }`.
3. Update `incrementHour`, `decrementHour`, `incrementMinute`, etc., to explicitly call `broadcastChange(newHour, newMinute, newPeriod)` internally.

---

## Phase 2: Design Manifesto Violations & UI Refinements

### 1. Holding (Inbox) Page (`inbox.tsx`)

**Manifesto Violations:**

- **Vertical Rhythm (Missing Breathability):** There is ZERO vertical spacing between the `AddTaskInput` and the task list section header beneath it. The components crash into each other, violating the explicit "generous spacing" rule.
- **Visual Clutter (Empty States):** If there are no items in "Unmanaged tasks" and no items in "Needs processing", the UI shows two separate empty states visually chained, creating unnecessary clutter and violating "Serenity / Cognitive Ease".

**Implementation Steps:**

1. **Vertical Rhythm:** Find `<div className="mt-6"><AddTaskInput ... /></div>` and change it to `<div className="mt-6 mb-10">` (or apply `mt-10` to the primary content) to guarantee luxurious breathing room.
2. **Empty State Rule:** Conditionally render the "Unmanaged tasks" section entirely. If `holdingTasks.length === 0`, do NOT render the section header or an empty placeholder. Let the "Needs Processing" empty state take over as the sole anchor of the page.
3. **Ghost Input Layer:** Wrap the generic `AddTaskInput` in a subtle frosted glass container (`bg-twilight-surface/30 backdrop-blur-md`) so it sits elegantly below the header.

### 2. Project Page (`project.tsx`)

**Manifesto Violations:**

- **Vertical Rhythm:** Same as Inbox, the spacing between the `AddTaskInput` and the list is uncomfortably tight (`mb-6`, but the list has no top padding).
- **Harsh Components:** The custom hex color picker inside the project rename `<Dialog>` is implemented using a stark native `<input type="color">` wrapped in a basic ring.
- **Resize Constraints:** The resizable side panel can be collapsed to sizes that break text formatting, or expanded wildly.

**Implementation Steps:**

1. **Spacing Fix:** Increase the `mb-6` on the `AddTaskInput` container to `mb-8` or `mb-10`.
2. **Panel Boundaries:** Enforce rigid `min-w-[300px]` and `max-w-[500px]` constraints rigorously on the project view's resizer. Ensure Kanban mode overflow uses `min-h-[50vh] flex overflow-x-auto overflow-y-hidden` strictly isolated from document scroll.
3. **UI Polish:** Provide a softer presentation for the native color picker and smooth `<AnimatePresence>` for the Project Actions dropdown. Ensure vertical list gaps are standardized to `gap-1`.

### 3. Schedule Page (`schedule.tsx` & Grid Contexts)

**Manifesto Violations:**

- **Claustrophobia (Overflow Defaults):** Grid systems expand indefinitely, breaking horizontal constraints and hiding the `TaskEditPanel` or calendar columns underneath parent scrollbars.
- **Clinical Gridlines:** Weekly horizontal line dividers (`DAY_GRID_HEIGHT` separators) use hard borders that feel "SaaS-y," violating the Twilight directive of "Soft Glowing Cues" and removing them from a sanctuary feel.

**Implementation Steps:**

1. **Force Boundary Containment:** For the main Grid structures wrapped inside `home.tsx` and `schedule.tsx`, inject `flex-1 min-w-0 overflow-hidden` directives securely on the parent columns.
2. **Subdue Grid Lines:** Open `WeekView.tsx` / `DayView.tsx` and adjust structural border lines to `border-twilight-border/20` and dashed half-hours to `border-white/[0.03]`. Make the time gutter borders almost invisible.

### 4. Habits Page (`habits.tsx` & `HabitsCanvas.tsx`)

**Manifesto Violations:**

- **Empty State Typography Clash:** The core text style for the empty habits canvas uses uncentered, disparate text wrappers (`<p className="text-lg...">` and text bounds) that completely misalign from the standardized, perfectly-centered "ring + icon" empty states on the Upcoming and Inbox pages.
- **Motion Breakage:** Unarchiving a habit causes it to instantly pop into existence without the `<AnimatePresence>` staggered layout defined by the manifesto.

**Implementation Steps:**

1. **Harmonize Empty State:** Rewrite `HabitsCanvas.tsx` empty return heavily. Structure it identically to `Upcoming`:

```tsx
<div className="flex flex-col items-center justify-center px-4 py-20 text-center">
	<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
		<Flame size={24} className="text-lantern" />
	</div>
	<h3 className="mb-2 text-lg font-medium text-twilight-text">
		The sanctuary is ready.
	</h3>
	<p className="max-w-sm text-sm text-twilight-text-muted">
		Add a routine above, then return here to log it throughout the week.
	</p>
</div>
```

2. **Dynamic Archiving Text:** If `emptyStateMode === "archived"`, change the copy to "No archived habits." and "Keep up the consistent work across your active routines."

### 5. Task Primitives & Dropdowns (Global)

**Manifesto Violations:**

- **Subtask Starkness:** `SubtaskList.tsx` continues to use basic boxed border squares for completion logic, breaking visually from the custom `TaskCheckbox.tsx`.
- **Dropdown Overflows:** `TaskContextMenu.tsx` and Priority/Tag pickers expand off-screen vertically.

**Implementation Steps:**

1. **Subtasks:** Change the manual SVG structure inside `SortableSubtaskItem.tsx` to mount `TaskCheckbox` natively. Increase subtask padding from `py-2` to `py-3` for breathing room.
2. **Dropdown Cap:** Wrap `DropdownMenu.Content` lists inside `<ScrollAreaWrapper className="max-h-[min(350px,80vh)]">` immediately to stop them dropping beneath the taskbar.
